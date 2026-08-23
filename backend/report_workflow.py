"""Report ingestion workflow API — real, persisted processing states.

Pipeline (each step is an explicit endpoint that writes its own state):

``POST /intelligence/reports/upload``            -> ``uploaded``
``POST /intelligence/reports/{id}/extract``      -> ``extracting`` / ``extracted``
``POST /intelligence/reports/{id}/analyze``      -> ``analyzing`` / ``analyzed``
``POST /intelligence/reports/{id}/compare``      -> ``comparing`` / ``compared``
``POST /intelligence/reports/{id}/verify``       -> ``verifying`` / ``completed``

Reads:

``GET /intelligence/reports/patient/{patient_id}`` -> report list for a patient
``GET /intelligence/reports/{id}``                 -> full persisted state

Nothing in the pipeline is simulated: every UI state corresponds to a row
update in ``report_analyses`` plus the artefacts it produced (health record,
report comparison, risk assessments, evidence references, clinical review and
timeline event).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import desc
from sqlalchemy.orm import Session

from . import auth, database, models, report_extraction, vision_service
from .clinical_access import (
    MEDICAL_DISCLAIMER,
    record_timeline_event,
    resolve_patient_scope,
)
from .intelligence_engine import (
    MedicationSafetyEngine,
    REFERENCE_RANGES,
    ReportComparisonEngine,
    RiskEngine,
)
from .schemas import clinical_workflow as cw

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/intelligence/reports", tags=["Clinical Report Workflow"])

_S = models.ReportAnalysisStatus


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------


def _stages(analysis: models.ReportAnalysis) -> List[Dict[str, Any]]:
    try:
        parsed = json.loads(analysis.stage_history or "[]")
        return parsed if isinstance(parsed, list) else []
    except (ValueError, TypeError):
        return []


def _set_stage(
    db: Session,
    analysis: models.ReportAnalysis,
    status: _S,
    detail: Optional[str] = None,
    *,
    commit: bool = True,
) -> None:
    """Persist a stage transition on the analysis row."""
    history = _stages(analysis)
    history.append(
        {
            "stage": status.value,
            "at": datetime.now(timezone.utc).isoformat(),
            "detail": detail,
        }
    )
    analysis.status = status.value
    analysis.stage_history = json.dumps(history)
    analysis.updated_at = datetime.now(timezone.utc)
    if status is _S.COMPLETED:
        analysis.completed_at = datetime.now(timezone.utc)
        analysis.raw_payload = None
    if status is _S.FAILED:
        analysis.raw_payload = None
    db.add(analysis)
    if commit:
        db.commit()
        db.refresh(analysis)


def _fail(db: Session, analysis: models.ReportAnalysis, reason: str, code: int = 400) -> None:
    analysis.error_detail = reason[:500]
    _set_stage(db, analysis, _S.FAILED, reason[:250])
    raise HTTPException(status_code=code, detail=reason)


def _json_load(value: Optional[str], default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return default


def _to_response(analysis: models.ReportAnalysis) -> cw.ReportAnalysisResponse:
    return cw.ReportAnalysisResponse(
        id=analysis.id,
        patient_id=analysis.patient_id,
        uploaded_by=analysis.uploaded_by,
        file_name=analysis.file_name,
        content_type=analysis.content_type,
        file_size=analysis.file_size,
        source=analysis.source,
        status=analysis.status,
        stage_history=[cw.ReportStageEntry(**s) for s in _stages(analysis)],
        error_detail=analysis.error_detail,
        extracted_values=_json_load(analysis.extracted_values, {}),
        abnormal_findings=[
            cw.AbnormalFinding(**f) for f in _json_load(analysis.abnormal_findings, [])
        ],
        summary=analysis.summary,
        requires_clinician_review=bool(analysis.requires_clinician_review),
        health_record_id=analysis.health_record_id,
        comparison_id=analysis.comparison_id,
        review_id=analysis.review_id,
        created_at=analysis.created_at,
        updated_at=analysis.updated_at,
        completed_at=analysis.completed_at,
        disclaimer=MEDICAL_DISCLAIMER,
    )


def _load_analysis(
    db: Session, analysis_id: int, current_user: models.User
) -> models.ReportAnalysis:
    analysis = (
        db.query(models.ReportAnalysis)
        .filter(models.ReportAnalysis.id == analysis_id)
        .first()
    )
    if not analysis:
        raise HTTPException(status_code=404, detail="Report analysis not found")
    resolve_patient_scope(db, current_user, analysis.patient_id)
    return analysis


def _require_stage(analysis: models.ReportAnalysis, allowed: tuple[_S, ...]) -> None:
    if analysis.status not in [s.value for s in allowed]:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Report is in state '{analysis.status}'; expected one of "
                f"{', '.join(s.value for s in allowed)}."
            ),
        )


# ---------------------------------------------------------------------------
# Stage 1 — upload
# ---------------------------------------------------------------------------


@router.post("/upload", response_model=cw.ReportAnalysisResponse, status_code=201)
async def upload_report(
    file: UploadFile = File(...),
    patient_id: Optional[int] = Form(None),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> cw.ReportAnalysisResponse:
    """Validate and persist an uploaded clinical report (state ``uploaded``).

    Args:
        file: Report file. Structured formats (JSON/CSV/TSV/TXT) are parsed
            locally; images and PDFs require a configured vision provider.
        patient_id: Target patient; defaults to the caller.

    Returns:
        The persisted report analysis in state ``uploaded``.

    Raises:
        HTTPException: 400 unsupported/oversized file, 403/404 patient scope.
    """
    pid = resolve_patient_scope(db, current_user, patient_id)
    file_name = (file.filename or "report").strip()[:200]

    if not report_extraction.is_supported_content_type(file.content_type, file_name):
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported report format. Upload a structured lab report "
                "(.json, .csv, .tsv, .txt) or an image/PDF report."
            ),
        )

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded report file is empty.")
    if len(contents) > report_extraction.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Report file exceeds the 10 MB limit.")

    structured = report_extraction.is_structured(file.content_type, file_name)
    if structured:
        try:
            payload = contents.decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=400,
                detail="Structured report files must be UTF-8 encoded text.",
            )
    else:
        import base64

        payload = base64.b64encode(contents).decode("ascii")

    analysis = models.ReportAnalysis(
        patient_id=pid,
        uploaded_by=current_user.id,
        file_name=file_name,
        content_type=file.content_type,
        file_size=len(contents),
        source="structured_upload" if structured else "vision_upload",
        status=_S.UPLOADED.value,
        raw_payload=payload,
        stage_history=json.dumps(
            [
                {
                    "stage": _S.UPLOADED.value,
                    "at": datetime.now(timezone.utc).isoformat(),
                    "detail": f"{len(contents)} bytes received and validated",
                }
            ]
        ),
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return _to_response(analysis)


# ---------------------------------------------------------------------------
# Stage 2 — extract
# ---------------------------------------------------------------------------


@router.post("/{analysis_id}/extract", response_model=cw.ReportAnalysisResponse)
def extract_report(
    analysis_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> cw.ReportAnalysisResponse:
    """Extract clinical markers from the stored payload (``extracted``)."""
    analysis = _load_analysis(db, analysis_id, current_user)
    _require_stage(analysis, (_S.UPLOADED, _S.EXTRACTING, _S.FAILED))
    _set_stage(db, analysis, _S.EXTRACTING, "Parsing report payload")

    payload = analysis.raw_payload
    if not payload:
        _fail(db, analysis, "Stored report payload is no longer available for extraction.", 409)

    try:
        if analysis.source == "structured_upload":
            markers = report_extraction.extract_markers(
                payload, analysis.content_type, analysis.file_name
            )
        else:
            import base64

            raw = base64.b64decode(payload)
            if (analysis.content_type or "") == "application/pdf":
                result = vision_service.analyze_lab_report_pdf(raw)
            else:
                result = vision_service.analyze_lab_report(raw)
            markers = report_extraction.markers_from_vision_result(result)
    except report_extraction.ReportExtractionError as exc:
        _fail(db, analysis, str(exc))
    except HTTPException as exc:
        _fail(
            db,
            analysis,
            f"Extraction provider unavailable: {exc.detail}. "
            "Upload a structured (.json/.csv/.txt) report to process this file locally.",
            503,
        )
    except Exception:  # pragma: no cover - defensive
        logger.error("Report extraction failed for analysis %s", analysis_id)
        _fail(db, analysis, "Report extraction failed unexpectedly.", 500)

    analysis.extracted_values = json.dumps(markers)
    _set_stage(db, analysis, _S.EXTRACTED, f"{len(markers)} marker(s) extracted")
    return _to_response(analysis)


# ---------------------------------------------------------------------------
# Stage 3 — analyze
# ---------------------------------------------------------------------------


@router.post("/{analysis_id}/analyze", response_model=cw.ReportAnalysisResponse)
def analyze_report(
    analysis_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> cw.ReportAnalysisResponse:
    """Screen extracted markers and persist the report as a health record."""
    analysis = _load_analysis(db, analysis_id, current_user)
    _require_stage(analysis, (_S.EXTRACTED, _S.ANALYZING))
    _set_stage(db, analysis, _S.ANALYZING, "Screening values against reference ranges")

    markers: Dict[str, float] = _json_load(analysis.extracted_values, {})
    if not markers:
        _fail(db, analysis, "No extracted values available to analyze.", 409)

    findings = report_extraction.build_findings(markers)
    summary = report_extraction.build_summary(markers, findings)

    record = models.HealthRecord(
        user_id=analysis.patient_id,
        record_type=report_extraction.infer_record_type(markers),
        data=json.dumps(markers),
        prediction=summary[:500],
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    analysis.health_record_id = record.id
    analysis.abnormal_findings = json.dumps(findings)
    analysis.summary = summary
    analysis.requires_clinician_review = bool(findings)
    _set_stage(
        db,
        analysis,
        _S.ANALYZED,
        f"{len(findings)} abnormal screening flag(s); health record #{record.id} stored",
    )
    return _to_response(analysis)


# ---------------------------------------------------------------------------
# Stage 4 — compare with history
# ---------------------------------------------------------------------------


@router.post("/{analysis_id}/compare", response_model=cw.ReportAnalysisResponse)
def compare_report(
    analysis_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> cw.ReportAnalysisResponse:
    """Compare this report with the patient's previous report, when one exists."""
    analysis = _load_analysis(db, analysis_id, current_user)
    _require_stage(analysis, (_S.ANALYZED, _S.COMPARING))
    _set_stage(db, analysis, _S.COMPARING, "Locating previous report for comparison")

    if not analysis.health_record_id:
        _fail(db, analysis, "Report has no stored health record to compare.", 409)

    previous = (
        db.query(models.HealthRecord)
        .filter(
            models.HealthRecord.user_id == analysis.patient_id,
            models.HealthRecord.id < analysis.health_record_id,
        )
        .order_by(desc(models.HealthRecord.id))
        .first()
    )
    if not previous:
        _set_stage(
            db,
            analysis,
            _S.COMPARED,
            "No previous report on record — comparison skipped",
        )
        return _to_response(analysis)

    comparison = models.ReportComparison(
        user_id=analysis.patient_id,
        report_a_id=previous.id,
        report_b_id=analysis.health_record_id,
        status="pending",
    )
    db.add(comparison)
    db.commit()
    db.refresh(comparison)

    try:
        result = ReportComparisonEngine.compare(
            db, analysis.patient_id, previous.id, analysis.health_record_id
        )
    except ValueError as exc:
        comparison.status = "failed"
        db.commit()
        _fail(db, analysis, f"Report comparison failed: {exc}")

    comparison.what_changed = json.dumps(result["what_changed"])
    comparison.what_stayed_stable = json.dumps(result["what_stayed_stable"])
    comparison.what_became_abnormal = json.dumps(result["what_became_abnormal"])
    comparison.what_improved = json.dumps(result["what_improved"])
    comparison.what_worsened = json.dumps(result["what_worsened"])
    comparison.requires_clinician_attention = result["requires_clinician_attention"]
    comparison.risk_trend = result["risk_trend"]
    comparison.overall_risk_score = result["overall_risk_score"]
    comparison.status = "completed"
    comparison.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(comparison)

    analysis.comparison_id = comparison.id
    if result["requires_clinician_attention"]:
        analysis.requires_clinician_review = True
    _set_stage(
        db,
        analysis,
        _S.COMPARED,
        f"Compared with report #{previous.id}; trend {result['risk_trend']}",
    )
    return _to_response(analysis)


# ---------------------------------------------------------------------------
# Stage 5 — verify (risk, medication relevance, evidence, review, timeline)
# ---------------------------------------------------------------------------


@router.post("/{analysis_id}/verify", response_model=cw.ReportAnalysisResponse)
def verify_report(
    analysis_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> cw.ReportAnalysisResponse:
    """Update risk, medication relevance, evidence, review and timeline."""
    analysis = _load_analysis(db, analysis_id, current_user)
    _require_stage(analysis, (_S.COMPARED, _S.VERIFYING))
    _set_stage(db, analysis, _S.VERIFYING, "Updating risk, evidence and review state")

    pid = analysis.patient_id
    findings: List[Dict[str, Any]] = _json_load(analysis.abnormal_findings, [])
    markers: Dict[str, float] = _json_load(analysis.extracted_values, {})

    # 1. Risk engine refresh — persisted so the risk centre reflects this report.
    risk = RiskEngine.assess(db, pid)
    for entry in risk["risks"]:
        db.add(
            models.RiskAssessment(
                user_id=pid,
                risk_category=entry["risk_category"],
                risk_level=entry["risk_level"],
                score=entry["score"],
                confidence=entry.get("confidence"),
                contributing_factors=json.dumps(entry.get("contributing_factors") or []),
                trend=entry.get("trend"),
                reason=entry.get("reason"),
                recommended_review_level=entry.get("recommended_review_level"),
            )
        )

    # 2. Medication relevance (screening only — never prescribes).
    safety = MedicationSafetyEngine.analyze(db, pid)
    med_note = (
        f"{len(safety.medications)} active medication(s); "
        f"{len(safety.interactions)} interaction, {len(safety.contraindications)} allergy "
        f"and {len(safety.duplicate_therapies)} duplicate-therapy signal(s)."
    )

    # 3. Evidence references — the actual reference ranges applied (verifiable).
    for finding in findings[:10]:
        rng = REFERENCE_RANGES.get(finding.get("marker", ""))
        if not rng:
            continue
        db.add(
            models.EvidenceReference(
                user_id=pid,
                evidence_type="lab_result",
                title=f"{rng['label']} screening reference range applied",
                source="AI Healthcare System reference-range table (non-diagnostic)",
                citation=f"{rng['label']} {rng['min']}–{rng['max']} {rng['unit']}",
                relevance_score=0.8,
                confidence=0.6,
                extraction_date=datetime.now(timezone.utc),
                status="unverified",
                related_findings=json.dumps(
                    {"report_analysis_id": analysis.id, "marker": finding.get("marker")}
                ),
            )
        )
    db.commit()

    # 4. Clinical review when the report needs a human decision.
    review_id = analysis.review_id
    if analysis.requires_clinician_review and not review_id:
        critical = any(f.get("severity") == "critical" for f in findings)
        review = models.ClinicalReview(
            user_id=current_user.id if current_user.role != "patient" else pid,
            patient_id=pid,
            ai_summary=(
                f"Report '{analysis.file_name}': {analysis.summary or ''} {med_note}"
            ).strip(),
            ai_evidence=json.dumps(
                {
                    "abnormal_findings": findings,
                    "comparison_id": analysis.comparison_id,
                    "report_analysis_id": analysis.id,
                }
            ),
            ai_risk_level=risk["overall_risk_level"],
            ai_confidence=0.6,
            priority="high" if critical else "medium",
            status="pending",
        )
        db.add(review)
        db.commit()
        db.refresh(review)
        review_id = review.id
        analysis.review_id = review_id

    # 5. Timeline event — the report now appears on the longitudinal timeline.
    event = record_timeline_event(
        db,
        pid,
        "lab_result",
        f"Report processed: {analysis.file_name}",
        subtype="report_analysis",
        description=analysis.summary,
        event_metadata={
            **markers,
            "report_analysis_id": analysis.id,
            "abnormal_count": len(findings),
            "comparison_id": analysis.comparison_id,
            "review_id": review_id,
        },
        risk_level=risk["overall_risk_level"],
        requires_review=bool(analysis.requires_clinician_review),
        commit=False,
    )
    db.commit()
    db.refresh(event)
    analysis.timeline_event_id = event.id

    _set_stage(
        db,
        analysis,
        _S.COMPLETED,
        (
            f"Risk {risk['overall_risk_level']}; {med_note} "
            f"{'Clinical review created.' if review_id else 'No review required.'}"
        ),
    )
    return _to_response(analysis)


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------


@router.get("/patient/{patient_id}", response_model=List[cw.ReportListItem])
def list_patient_reports(
    patient_id: int,
    limit: int = 50,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> List[cw.ReportListItem]:
    """List processed and in-flight reports for a patient."""
    pid = resolve_patient_scope(db, current_user, patient_id)
    rows = (
        db.query(models.ReportAnalysis)
        .filter(models.ReportAnalysis.patient_id == pid)
        .order_by(desc(models.ReportAnalysis.created_at))
        .limit(max(1, min(limit, 200)))
        .all()
    )
    return [
        cw.ReportListItem(
            id=r.id,
            file_name=r.file_name,
            status=r.status,
            source=r.source,
            abnormal_count=len(_json_load(r.abnormal_findings, [])),
            requires_clinician_review=bool(r.requires_clinician_review),
            health_record_id=r.health_record_id,
            comparison_id=r.comparison_id,
            created_at=r.created_at,
            completed_at=r.completed_at,
        )
        for r in rows
    ]


@router.get("/{analysis_id}", response_model=cw.ReportAnalysisResponse)
def get_report_analysis(
    analysis_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> cw.ReportAnalysisResponse:
    """Return the full persisted state of one report analysis."""
    analysis = _load_analysis(db, analysis_id, current_user)
    return _to_response(analysis)
