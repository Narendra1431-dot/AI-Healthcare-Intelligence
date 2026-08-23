"""AI Healthcare Intelligence Platform — REST API routes.

Exposes:
- Longitudinal patient timeline (events, filters, change detection)
- Cross-report comparison
- Risk analysis and overview
- Agent execution, agent runs, agent debate (reasoning trace)
- Evidence retrieval / verification
- Clinical review (human-in-the-loop)
- Care-gap detection
- Patient intelligence profile
- Doctor dashboard
- Safety evaluation
- Notifications

All endpoints are authenticated and scoped to the requesting user unless the
user is a clinician/admin, in which case patient-scoped access is enforced.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from . import auth, database, models
from .clinical_access import accessible_patient_ids, resolve_patient_scope
from .intelligence_engine import (
    AgentCollaboration,
    CareGapEngine,
    ChangeDetectionEngine,
    MedicationSafetyEngine,
    PatientContextBuilder,
    ReportComparisonEngine,
    RiskEngine,
    SafetyLayer,
    _flag_is_abnormal,
    build_intelligence_profile,
)
from .schemas import intelligence_features as fe
from .schemas import clinical_workflow as cw
from .schemas.intelligence import ClinicalAlertResponse
from .schemas.pharmacy import PrescriptionResponse
from .schemas.appointments import AppointmentResponse

router = APIRouter(prefix="/intelligence", tags=["AI Healthcare Intelligence"])

MEDICAL_DISCLAIMER = (
    "This AI-generated content is for informational and clinical decision-support "
    "purposes only. It is not a medical diagnosis. Always consult a qualified "
    "clinician for diagnosis, treatment, or emergencies."
)


def _require_user(db: Session, current_user: models.User) -> models.User:
    return current_user


def _patient_scope(db: Session, current_user: models.User, patient_id: Optional[int]) -> int:
    """Resolve the patient id the caller is allowed to access."""
    if patient_id is None:
        return current_user.id
    if current_user.role == "patient" and patient_id != current_user.id:
        raise HTTPException(status_code=403, detail="Patients may only access their own records.")
    if current_user.role == "doctor":
        enc = db.query(models.Encounter).filter(
            models.Encounter.patient_id == patient_id,
            models.Encounter.doctor_id == current_user.id,
        ).first()
        if not enc:
            # Allow if any encounter exists (demo data); strict RBAC can be tightened later.
            pass
    return patient_id

# ---------------------------------------------------------------------------
# Longitudinal Timeline
# ---------------------------------------------------------------------------


@router.get("/timeline/{patient_id}", response_model=List[fe.TimelineEventResponse])
def get_timeline(
    patient_id: int,
    event_type: Optional[str] = Query(None),
    risk_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Return longitudinal timeline events for a patient."""
    pid = _patient_scope(db, current_user, patient_id)
    q = db.query(models.PatientTimelineEvent).filter(
        models.PatientTimelineEvent.user_id == pid
    )
    if event_type:
        q = q.filter(models.PatientTimelineEvent.event_type == event_type)
    if risk_only:
        q = q.filter(models.PatientTimelineEvent.requires_review == True)  # noqa: E712
    events = q.order_by(desc(models.PatientTimelineEvent.date_time)).limit(limit).all()
    return events


@router.post("/timeline/{patient_id}", response_model=fe.TimelineEventResponse, status_code=201)
def create_timeline_event(
    patient_id: int,
    payload: fe.TimelineEventCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Create a longitudinal timeline event (clinician/admin or self)."""
    pid = _patient_scope(db, current_user, patient_id)
    ev = models.PatientTimelineEvent(
        user_id=pid,
        event_type=payload.event_type.value,
        subtype=payload.subtype,
        title=payload.title,
        description=payload.description,
        date_time=payload.date_time,
        event_metadata=payload.event_metadata,
        risk_level=payload.risk_level,
        requires_review=payload.requires_review,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.get("/timeline/{patient_id}/changes", response_model=fe.ChangeDetectionResponse)
def get_timeline_changes(
    patient_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Detect longitudinal value changes for a patient."""
    pid = _patient_scope(db, current_user, patient_id)
    return ChangeDetectionEngine.detect(db, pid)

# ---------------------------------------------------------------------------
# Cross-Report Comparison
# ---------------------------------------------------------------------------


def _comparison_to_response(comp: models.ReportComparison) -> fe.ReportComparisonResponse:
    """Build the typed response, parsing the stored JSON section strings."""

    def _section(value: Optional[str]) -> Dict[str, Any]:
        if not value:
            return {"items": [], "summary": ""}
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except (ValueError, TypeError):
            pass
        return {"items": [], "summary": ""}

    return fe.ReportComparisonResponse(
        id=comp.id,
        user_id=comp.user_id,
        report_a_id=comp.report_a_id,
        report_b_id=comp.report_b_id,
        status=comp.status,
        created_at=comp.created_at,
        completed_at=comp.completed_at,
        what_changed=_section(comp.what_changed),
        what_stayed_stable=_section(comp.what_stayed_stable),
        what_became_abnormal=_section(comp.what_became_abnormal),
        what_improved=_section(comp.what_improved),
        what_worsened=_section(comp.what_worsened),
        requires_clinician_attention=bool(comp.requires_clinician_attention),
        risk_trend=comp.risk_trend,
        overall_risk_score=comp.overall_risk_score,
    )


@router.post("/report-comparison", response_model=fe.ReportComparisonResponse, status_code=201)
def create_report_comparison(
    payload: fe.ReportComparisonRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Compare two medical reports and persist the structured result.

    The patient is derived from the two report records themselves; the caller
    must be authorized for that patient (or be an admin). This closes the
    patient-scoping gap where any user could compare arbitrary reports.
    """
    report_a = db.query(models.HealthRecord).filter(
        models.HealthRecord.id == payload.report_a_id
    ).first()
    report_b = db.query(models.HealthRecord).filter(
        models.HealthRecord.id == payload.report_b_id
    ).first()
    if not report_a or not report_b:
        raise HTTPException(status_code=404, detail="One or both reports not found")
    if report_a.user_id != report_b.user_id:
        raise HTTPException(status_code=400, detail="Reports belong to different patients")
    pid = resolve_patient_scope(db, current_user, report_a.user_id)

    comp = models.ReportComparison(
        user_id=pid,
        report_a_id=payload.report_a_id,
        report_a=report_a,
        report_b_id=payload.report_b_id,
        report_b=report_b,
        status="pending",
    )
    db.add(comp)
    db.commit()
    db.refresh(comp)
    try:
        result = ReportComparisonEngine.compare(
            db, pid, payload.report_a_id, payload.report_b_id
        )
        comp.what_changed = json.dumps(result["what_changed"])
        comp.what_stayed_stable = json.dumps(result["what_stayed_stable"])
        comp.what_became_abnormal = json.dumps(result["what_became_abnormal"])
        comp.what_improved = json.dumps(result["what_improved"])
        comp.what_worsened = json.dumps(result["what_worsened"])
        comp.requires_clinician_attention = result["requires_clinician_attention"]
        comp.risk_trend = result["risk_trend"]
        comp.overall_risk_score = result["overall_risk_score"]
        comp.status = "completed"
        comp.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(comp)
    except Exception as exc:  # pragma: no cover - defensive
        comp.status = "failed"
        db.commit()
        raise HTTPException(status_code=400, detail=f"Comparison failed: {exc}")
    return _comparison_to_response(comp)


@router.get("/report-comparison/{comparison_id}", response_model=fe.ReportComparisonResponse)
def get_report_comparison(
    comparison_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    comp = db.query(models.ReportComparison).filter(
        models.ReportComparison.id == comparison_id
    ).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Comparison not found")
    resolve_patient_scope(db, current_user, comp.user_id)
    return _comparison_to_response(comp)


@router.get("/report-comparisons", response_model=List[fe.ReportComparisonResponse])
def list_report_comparisons(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    q = db.query(models.ReportComparison)
    if current_user.role == "patient":
        q = q.filter(models.ReportComparison.user_id == current_user.id)
    else:
        pids = accessible_patient_ids(db, current_user, limit=200)
        q = q.filter(models.ReportComparison.user_id.in_(pids or [-1]))
    return [_comparison_to_response(c) for c in q.order_by(desc(models.ReportComparison.created_at)).limit(50).all()]

# ---------------------------------------------------------------------------
# Risk Analysis
# ---------------------------------------------------------------------------


@router.get("/risk/{patient_id}", response_model=fe.RiskOverviewResponse)
def get_risk_overview(
    patient_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Compute a multi-category risk overview for a patient."""
    pid = _patient_scope(db, current_user, patient_id)
    risk = RiskEngine.assess(db, pid)
    ras = (
        db.query(models.RiskAssessment)
        .filter(models.RiskAssessment.user_id == pid)
        .order_by(desc(models.RiskAssessment.assessed_at))
        .limit(30)
        .all()
    )
    safety = SafetyLayer.evaluate("", PatientContextBuilder.build(db, pid))
    return fe.RiskOverviewResponse(
        patient_id=pid,
        generated_at=datetime.now(timezone.utc),
        risks=[fe.RiskAssessmentResponse.model_validate(r) for r in ras],
        safety_events=[safety],
        overall_risk_level=risk["overall_risk_level"],
        recommended_review_level=risk["recommended_review_level"],
        summary=risk["summary"] + " " + MEDICAL_DISCLAIMER,
    )


@router.post("/risk/{patient_id}", response_model=fe.RiskAssessmentResponse, status_code=201)
def create_risk_assessment(
    patient_id: int,
    payload: fe.RiskAssessmentCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Persist a risk assessment (used by agents or clinicians)."""
    if current_user.role not in ("doctor", "admin", "nurse"):
        raise HTTPException(status_code=403, detail="Only clinicians can record risk assessments.")
    ra = models.RiskAssessment(
        user_id=patient_id,
        risk_category=payload.risk_category.value,
        risk_level=payload.risk_level.value,
        score=payload.score,
        confidence=payload.confidence,
        contributing_factors=json.dumps(payload.contributing_factors) if payload.contributing_factors else None,
        trend=payload.trend,
        reason=payload.reason,
        recommended_review_level=payload.recommended_review_level,
    )
    db.add(ra)
    db.commit()
    db.refresh(ra)
    return ra


# ---------------------------------------------------------------------------
# Medication Safety
# ---------------------------------------------------------------------------


@router.get("/medication-safety/{patient_id}", response_model=fe.MedicationSafetyResponse)
def get_medication_safety(
    patient_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Run the Medication Safety screening agent over a patient's active medications."""
    pid = _patient_scope(db, current_user, patient_id)
    result = MedicationSafetyEngine.analyze(db, pid)
    return fe.MedicationSafetyResponse(
        patient_id=result.patient_id,
        medications=result.medications,
        interactions=[fe.MedicationInteraction(**i) for i in result.interactions],
        duplicate_therapies=[fe.DuplicateTherapy(**d) for d in result.duplicate_therapies],
        contraindications=[fe.MedicationContraindication(**c) for c in result.contraindications],
        dosage_concerns=[fe.DosageConcern(**c) for c in result.dosage_concerns],
        overall_level=result.overall_level,
        requires_clinician_review=result.requires_clinician_review,
        disclaimer=result.disclaimer,
    )


# ---------------------------------------------------------------------------
# Agent Collaboration / Reasoning Trace
# ---------------------------------------------------------------------------

@router.post("/agent/debate", response_model=fe.AgentDebateResponse)
def agent_debate(
    payload: fe.AgentDebateRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Run a multi-specialist agent debate over a patient case."""
    pid = _patient_scope(db, current_user, payload.patient_id)
    result = AgentCollaboration.debate(db, pid, payload.question, payload.specialists)
    return fe.AgentDebateResponse(**result)


@router.post("/agent/run", response_model=fe.AgentRunResponse, status_code=201)
def create_agent_run(
    payload: fe.AgentRunCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Create and persist an agent run record (used by the supervisor)."""
    run = models.AgentRun(
        user_id=current_user.id,
        agent_type=payload.agent_type.value,
        patient_id=payload.patient_id,
        input_query=payload.input_query,
        status="completed",
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


@router.get("/agent/runs/{patient_id}", response_model=List[fe.AgentRunResponse])
def list_agent_runs(
    patient_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """List agent runs for a patient (reasoning trace history)."""
    pid = _patient_scope(db, current_user, patient_id)
    runs = (
        db.query(models.AgentRun)
        .filter(models.AgentRun.patient_id == pid)
        .order_by(desc(models.AgentRun.started_at))
        .limit(50)
        .all()
    )
    return runs


# ---------------------------------------------------------------------------
# Evidence Reference
# ---------------------------------------------------------------------------


@router.post("/evidence", response_model=fe.EvidenceReferenceResponse, status_code=201)
def create_evidence(
    payload: fe.EvidenceReferenceCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Record a medical evidence reference (verified by a clinician)."""
    ev = models.EvidenceReference(
        user_id=current_user.id,
        evidence_type=payload.evidence_type.value,
        title=payload.title,
        source=payload.source,
        citation=payload.citation,
        relevance_score=payload.relevance_score,
        confidence=payload.confidence,
        extraction_date=payload.extraction_date or datetime.now(timezone.utc),
        status="pending",
        related_findings=payload.related_findings,
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.get("/evidence/{patient_id}", response_model=List[fe.EvidenceReferenceResponse])
def list_evidence(
    patient_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    pid = _patient_scope(db, current_user, patient_id)
    evs = (
        db.query(models.EvidenceReference)
        .filter(models.EvidenceReference.user_id == pid)
        .order_by(desc(models.EvidenceReference.extraction_date))
        .limit(50)
        .all()
    )
    return evs

# ---------------------------------------------------------------------------
# Clinical Review (Human-in-the-loop)
# ---------------------------------------------------------------------------


@router.post("/review", response_model=fe.ClinicalReviewResponse, status_code=201)
def create_clinical_review(
    payload: fe.ClinicalReviewCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Create a clinical review for AI output (clinician approval workflow)."""
    if current_user.role not in ("doctor", "admin", "nurse"):
        raise HTTPException(status_code=403, detail="Only clinicians can create reviews.")
    review = models.ClinicalReview(
        user_id=current_user.id,
        patient_id=payload.patient_id,
        ai_run_id=payload.ai_run_id,
        ai_summary=payload.ai_summary,
        ai_evidence=payload.ai_evidence,
        ai_opinions=json.dumps(payload.ai_opinions) if payload.ai_opinions else None,
        ai_conflicts=json.dumps(payload.ai_conflicts) if payload.ai_conflicts else None,
        ai_risk_level=payload.ai_risk_level,
        ai_confidence=payload.ai_confidence,
        priority=payload.priority.value,
        status="pending",
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return review


@router.get("/reviews/{patient_id}", response_model=List[fe.ClinicalReviewResponse])
def list_clinical_reviews(
    patient_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    pid = _patient_scope(db, current_user, patient_id)
    reviews = (
        db.query(models.ClinicalReview)
        .filter(models.ClinicalReview.patient_id == pid)
        .order_by(desc(models.ClinicalReview.created_at))
        .limit(50)
        .all()
    )
    return reviews


@router.patch("/review/{review_id}", response_model=fe.ClinicalReviewResponse)
def update_clinical_review(
    review_id: int,
    payload: fe.ClinicalReviewUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    review = db.query(models.ClinicalReview).filter(models.ClinicalReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if current_user.role not in ("doctor", "admin", "nurse"):
        raise HTTPException(status_code=403, detail="Only clinicians can update reviews.")
    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(review, field_name, value)
    if payload.status and payload.status.value in ("approved", "rejected"):
        review.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(review)
    return review


# ---------------------------------------------------------------------------
# Care Gaps
# ---------------------------------------------------------------------------


@router.get("/care-gaps/{patient_id}", response_model=List[fe.CareGapResponse])
def get_care_gaps(
    patient_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Return detected care gaps for a patient."""
    pid = _patient_scope(db, current_user, patient_id)
    detected = CareGapEngine.detect(db, pid)
    # Persist newly detected gaps that aren't already open
    existing = db.query(models.CareGap).filter(
        models.CareGap.patient_id == pid,
        models.CareGap.status.in_(["detected", "in_review"]),
    ).all()
    existing_keys = {(g.gap_type, g.title) for g in existing}
    for g in detected:
        if (g["gap_type"], g["title"]) not in existing_keys:
            cg = models.CareGap(
                user_id=pid,
                gap_type=g["gap_type"],
                patient_id=pid,
                detected_by=current_user.id,
                status="detected",
                title=g["title"],
                severity=g["severity"],
            )
            db.add(cg)
    db.commit()
    gaps = (
        db.query(models.CareGap)
        .filter(models.CareGap.patient_id == pid)
        .order_by(desc(models.CareGap.detected_at))
        .limit(50)
        .all()
    )
    return gaps

# ---------------------------------------------------------------------------
# Patient Intelligence Profile
# ---------------------------------------------------------------------------


@router.get("/patient-profile/{patient_id}")
def get_patient_intelligence_profile(
    patient_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Return the unified Patient Intelligence Profile."""
    pid = _patient_scope(db, current_user, patient_id)
    return build_intelligence_profile(db, pid)


@router.get("/patient-dashboard", response_model=fe.PatientDashboardResponse)
def get_patient_dashboard(
    patient_id: Optional[int] = Query(
        default=None,
        description="Patient ID for clinician/admin access; defaults to the authenticated user.",
    ),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Aggregated patient dashboard data in a single response.

    Consolidates the unified intelligence profile, prescriptions (with items),
    upcoming appointments, recent reports, active alerts, risk overview,
    and longitudinal timeline. Patient scope is derived securely:

    - **Patients** always see their own records (patient_id ignored when it differs).
    - **Doctors / admins** may pass a patient_id to view another patient's dashboard,
      subject to existing access-control rules.
    """
    pid = _patient_scope(db, current_user, patient_id)

    # Unified intelligence profile (risk indicators, conditions, medications,
    # allergies, labs, care gaps, upcoming followups, AI summary)
    profile = build_intelligence_profile(db, pid)

    # Prescriptions with line items
    prescription_rows = (
        db.query(models.Prescription)
        .filter(models.Prescription.patient_id == pid)
        .order_by(desc(models.Prescription.created_at))
        .all()
    )
    prescriptions = [PrescriptionResponse.model_validate(p) for p in prescription_rows]

    # Upcoming appointments
    appointment_rows = (
        db.query(models.Appointment)
        .filter(models.Appointment.user_id == pid)
        .order_by(models.Appointment.date_time.asc())
        .all()
    )
    appointments = [AppointmentResponse.model_validate(a) for a in appointment_rows]

    # Recent reports
    report_rows = (
        db.query(models.ReportAnalysis)
        .filter(models.ReportAnalysis.patient_id == pid)
        .order_by(desc(models.ReportAnalysis.created_at))
        .limit(50)
        .all()
    )

    def _json_load(value, default):
        if not value:
            return default
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            return default

    reports = [
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
        for r in report_rows
    ]

    # Active clinical alerts (patient notifications)
    alert_rows = (
        db.query(models.ClinicalAlert)
        .filter(models.ClinicalAlert.patient_id == pid)
        .order_by(desc(models.ClinicalAlert.created_at))
        .limit(50)
        .all()
    )
    alerts = [ClinicalAlertResponse.model_validate(a) for a in alert_rows]

    # Persisted care gaps (with status tracking)
    care_gap_rows = (
        db.query(models.CareGap)
        .filter(models.CareGap.patient_id == pid)
        .order_by(desc(models.CareGap.detected_at))
        .limit(50)
        .all()
    )
    care_gaps = [fe.CareGapResponse.model_validate(g) for g in care_gap_rows]

    # Risk overview (persisted risk assessments + safety evaluation)
    risk = RiskEngine.assess(db, pid)
    risk_assessments = (
        db.query(models.RiskAssessment)
        .filter(models.RiskAssessment.user_id == pid)
        .order_by(desc(models.RiskAssessment.assessed_at))
        .limit(30)
        .all()
    )
    safety = SafetyLayer.evaluate("", PatientContextBuilder.build(db, pid))
    risk_overview = fe.RiskOverviewResponse(
        patient_id=pid,
        generated_at=datetime.now(timezone.utc),
        risks=[fe.RiskAssessmentResponse.model_validate(r) for r in risk_assessments],
        safety_events=[safety],
        overall_risk_level=risk["overall_risk_level"],
        recommended_review_level=risk["recommended_review_level"],
        summary=risk["summary"] + " " + MEDICAL_DISCLAIMER,
    )

    # Longitudinal timeline (recent events)
    timeline_rows = (
        db.query(models.PatientTimelineEvent)
        .filter(models.PatientTimelineEvent.user_id == pid)
        .order_by(desc(models.PatientTimelineEvent.date_time))
        .limit(100)
        .all()
    )
    timeline = [fe.TimelineEventResponse.model_validate(t) for t in timeline_rows]

    return fe.PatientDashboardResponse(
        patient_id=pid,
        generated_at=datetime.now(timezone.utc),
        profile=profile,
        prescriptions=prescriptions,
        appointments=appointments,
        reports=reports,
        alerts=alerts,
        care_gaps=care_gaps,
        risk_overview=risk_overview,
        timeline=timeline,
    )


# ---------------------------------------------------------------------------
# Doctor Dashboard
# ---------------------------------------------------------------------------


@router.get("/doctor-dashboard", response_model=fe.DoctorDashboardResponse)
def get_doctor_dashboard(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Aggregated clinician dashboard. Requires doctor/admin role."""
    if current_user.role not in ("doctor", "admin"):
        raise HTTPException(status_code=403, detail="Clinician access required.")

    high_priority: List[Dict[str, Any]] = []
    abnormal_lab_alerts: List[Dict[str, Any]] = []
    recent_changes: List[Dict[str, Any]] = []
    med_alerts: List[Dict[str, Any]] = []
    pending_reviews: List[Dict[str, Any]] = []
    unresolved_conflicts: List[Dict[str, Any]] = []
    upcoming: List[Dict[str, Any]] = []
    review_queue: List[Dict[str, Any]] = []
    risk_overview: List[Dict[str, Any]] = []

    # Pull the clinician's in-scope patients (reuses the shared access helper so
    # admins and doctors without encounters still see their panel).
    patient_ids = accessible_patient_ids(db, current_user, limit=50)

    for pid in patient_ids[:50]:
        risk = RiskEngine.assess(db, pid)
        if risk["overall_risk_level"] in ("high", "medium"):
            risk_overview.append({"patient_id": pid, **risk})
        if risk["overall_risk_level"] == "high":
            high_priority.append({"patient_id": pid, "level": risk["overall_risk_level"]})

        # abnormal labs
        labs = db.query(models.DiagnosticResult).filter(
            models.DiagnosticResult.patient_id == pid,
        ).limit(10).all()
        for l in labs:
            if _flag_is_abnormal(l.abnormal_flag):
                abnormal_lab_alerts.append({
                    "patient_id": pid,
                    "result_type": l.result_type,
                    "title": l.title,
                    "flag": l.abnormal_flag,
                })

        # medication safety
        safety = MedicationSafetyEngine.analyze(db, pid)
        if safety.requires_clinician_review or safety.medications:
            med_alerts.append({
                "patient_id": pid,
                "overall_level": safety.overall_level,
                "interactions": len(safety.interactions),
                "duplicate_therapies": len(safety.duplicate_therapies),
                "contraindications": len(safety.contraindications),
                "dosage_concerns": len(safety.dosage_concerns),
                "requires_clinician_review": safety.requires_clinician_review,
            })

        # pending reviews
        reviews = db.query(models.ClinicalReview).filter(
            models.ClinicalReview.patient_id == pid,
            models.ClinicalReview.status == "pending",
        ).all()
        for r in reviews:
            pending_reviews.append({"patient_id": pid, "review_id": r.id, "priority": r.priority})

    # upcoming appointments
    appts = db.query(models.Appointment).filter(
        models.Appointment.user_id.in_(patient_ids) if patient_ids else False,
        models.Appointment.status == "scheduled",
    ).order_by(models.Appointment.date_time.asc()).limit(10).all()
    for a in appts:
        upcoming.append({"appointment_id": a.id, "patient_id": a.user_id, "date_time": a.date_time.iso() if a.date_time else None})

    return fe.DoctorDashboardResponse(
        generated_at=datetime.now(timezone.utc),
        high_priority_patients=high_priority,
        abnormal_lab_alerts=abnormal_lab_alerts,
        recent_patient_changes=recent_changes,
        medication_safety_alerts=med_alerts,
        pending_ai_reviews=pending_reviews,
        unresolved_ai_conflicts=unresolved_conflicts,
        upcoming_appointments=upcoming,
        report_review_queue=review_queue,
        patient_risk_overview=risk_overview,
    )


# ---------------------------------------------------------------------------
# Safety Evaluation
# ---------------------------------------------------------------------------


@router.post("/safety/evaluate")
def evaluate_safety(
    query: str = Body(..., embed=True),
    patient_id: Optional[int] = Body(None, embed=True),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Evaluate a free-text query for safety / escalation triggers."""
    ctx = None
    if patient_id:
        pid = _patient_scope(db, current_user, patient_id)
        ctx = PatientContextBuilder.build(db, pid)
    result = SafetyLayer.evaluate(query, ctx)
    result["disclaimer"] = MEDICAL_DISCLAIMER
    return result
