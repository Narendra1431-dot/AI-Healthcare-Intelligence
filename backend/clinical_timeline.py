"""Aggregated longitudinal patient timeline API.

The stored ``patient_timeline_events`` table only holds events that a workflow
explicitly recorded. This module additionally derives timeline entries from the
real clinical records already in the database so the timeline is complete:

encounters, diagnostic results (labs), vitals, prescriptions (medications),
reports, risk assessments, safety alerts, care gaps, clinical reviews and
appointments.

Nothing is fabricated — every item maps to a persisted row, and the
``source``/``metadata`` fields identify exactly where it came from.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from . import auth, database, models
from .clinical_access import resolve_patient_scope
from .schemas import clinical_workflow as cw

router = APIRouter(prefix="/intelligence/timeline", tags=["Patient Timeline"])

CATEGORIES = (
    "encounter",
    "diagnosis",
    "medication",
    "lab",
    "vital",
    "report",
    "risk",
    "safety",
    "care_gap",
    "review",
    "appointment",
)

_STORED_TYPE_TO_CATEGORY: Dict[str, str] = {
    "visit": "encounter",
    "diagnosis": "diagnosis",
    "medication": "medication",
    "lab_result": "lab",
    "imaging": "report",
    "procedure": "encounter",
    "symptom": "diagnosis",
    "vital": "vital",
    "appointment": "appointment",
    "risk_assessment": "risk",
    "care_gap": "care_gap",
}


def _naive(dt: Optional[datetime]) -> Optional[datetime]:
    """Normalise stored timestamps (mixed naive/aware) for safe comparison."""
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


def _add(
    items: List[cw.AggregatedTimelineItem],
    *,
    item_id: str,
    source: str,
    category: str,
    title: str,
    date_time: Optional[datetime],
    description: Optional[str] = None,
    risk_level: Optional[str] = None,
    requires_review: bool = False,
    status: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    patient_summary: Optional[str] = None,
    link: Optional[str] = None,
) -> None:
    dt = _naive(date_time)
    if dt is None:
        return
    items.append(
        cw.AggregatedTimelineItem(
            id=item_id,
            source=source,
            category=category,
            title=title[:240],
            description=description,
            date_time=dt,
            risk_level=risk_level,
            requires_review=requires_review,
            status=status,
            metadata=metadata or {},
            patient_summary=patient_summary,
            link=link,
        )
    )


@router.get("/{patient_id}/aggregate", response_model=cw.AggregatedTimelineResponse)
def aggregate_timeline(
    patient_id: int,
    categories: Optional[str] = Query(None, description="Comma-separated category filter"),
    days: Optional[int] = Query(None, ge=1, le=3650, description="Only include the last N days"),
    start: Optional[datetime] = Query(None, description="Inclusive start timestamp"),
    end: Optional[datetime] = Query(None, description="Inclusive end timestamp"),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> cw.AggregatedTimelineResponse:
    """Return one chronologically ordered timeline built from real records.

    Args:
        patient_id: Patient whose timeline is requested.
        categories: Optional comma-separated subset of :data:`CATEGORIES`.
        days: Optional rolling window in days.
        start: Optional inclusive lower bound.
        end: Optional inclusive upper bound.
        limit: Maximum number of items returned (most recent first).

    Returns:
        Aggregated timeline payload including the categories actually present.

    Raises:
        HTTPException: 403/404 from patient scope resolution.
    """
    pid = resolve_patient_scope(db, current_user, patient_id)
    wanted = (
        {c.strip() for c in categories.split(",") if c.strip()} if categories else set(CATEGORIES)
    )
    items: List[cw.AggregatedTimelineItem] = []

    # 1. Explicitly recorded workflow events -------------------------------
    stored = (
        db.query(models.PatientTimelineEvent)
        .filter(
            models.PatientTimelineEvent.user_id == pid,
            models.PatientTimelineEvent.deleted_at.is_(None),
        )
        .order_by(desc(models.PatientTimelineEvent.date_time))
        .limit(300)
        .all()
    )
    for ev in stored:
        category = _STORED_TYPE_TO_CATEGORY.get(ev.event_type, "encounter")
        if (ev.subtype or "").startswith("clinical_review"):
            category = "review"
        if (ev.subtype or "") == "report_analysis":
            category = "report"
        _add(
            items,
            item_id=f"event-{ev.id}",
            source="timeline_event",
            category=category,
            title=ev.title,
            description=ev.description,
            date_time=ev.date_time,
            risk_level=ev.risk_level,
            requires_review=bool(ev.requires_review),
            metadata=ev.event_metadata if isinstance(ev.event_metadata, dict) else {},
        )

    # 2. Encounters ---------------------------------------------------------
    if "encounter" in wanted:
        for enc in (
            db.query(models.Encounter)
            .filter(
                models.Encounter.patient_id == pid,
                models.Encounter.deleted_at.is_(None),
            )
            .order_by(desc(models.Encounter.started_at))
            .limit(50)
            .all()
        ):
            _add(
                items,
                item_id=f"encounter-{enc.id}",
                source="encounter",
                category="encounter",
                title=f"{enc.encounter_type or 'Encounter'} ({enc.status or 'unknown'})",
                description=enc.reason,
                date_time=enc.started_at,
                status=enc.status,
                metadata={"encounter_id": enc.id, "priority": enc.priority},
                patient_summary=f"You had a{'n' if (enc.encounter_type or '').lower().startswith(('a','e','i','o','u')) else ''} {enc.encounter_type or 'visit'} visit.",
            )

    # 3. Labs / diagnostics -------------------------------------------------
    if "lab" in wanted:
        for lab in (
            db.query(models.DiagnosticResult)
            .filter(
                models.DiagnosticResult.patient_id == pid,
                models.DiagnosticResult.deleted_at.is_(None),
            )
            .order_by(desc(models.DiagnosticResult.created_at))
            .limit(80)
            .all()
        ):
            abnormal = bool(lab.abnormal_flag)
            _add(
                items,
                item_id=f"lab-{lab.id}",
                source="diagnostic_result",
                category="lab",
                title=f"{(lab.title or lab.result_type or 'Diagnostic result')}"
                + (" — flagged abnormal" if abnormal else ""),
                description=lab.summary,
                date_time=lab.created_at,
                risk_level="high" if abnormal else None,
                requires_review=abnormal
                and (lab.review_status or "pending_review")
                in ("pending_review", "needs_follow_up"),
                status=lab.review_status,
                metadata={"diagnostic_result_id": lab.id, "abnormal_flag": lab.abnormal_flag},
                patient_summary=(
                    f"A {lab.result_type or 'test'} result was recorded and flagged for your clinician to review."
                    if abnormal
                    else f"A {lab.result_type or 'test'} result was recorded."
                ),
            )

    # 4. Vitals -------------------------------------------------------------
    if "vital" in wanted:
        for vit in (
            db.query(models.VitalObservation)
            .filter(
                models.VitalObservation.patient_id == pid,
                models.VitalObservation.deleted_at.is_(None),
            )
            .order_by(desc(models.VitalObservation.observed_at))
            .limit(60)
            .all()
        ):
            parts = []
            if vit.heart_rate:
                parts.append(f"HR {vit.heart_rate}")
            if vit.systolic_bp and vit.diastolic_bp:
                parts.append(f"BP {vit.systolic_bp}/{vit.diastolic_bp}")
            if vit.spo2:
                parts.append(f"SpO2 {vit.spo2}%")
            if vit.temperature_c:
                parts.append(f"Temp {vit.temperature_c}°C")
            _add(
                items,
                item_id=f"vital-{vit.id}",
                source="vital_observation",
                category="vital",
                title="Vital signs recorded",
                description=", ".join(parts) or None,
                date_time=vit.observed_at,
                metadata={
                    "vital_id": vit.id,
                    "heart_rate": vit.heart_rate,
                    "systolic_bp": vit.systolic_bp,
                    "diastolic_bp": vit.diastolic_bp,
                    "spo2": vit.spo2,
                },
                patient_summary="Your vital signs were measured.",
            )

    # 5. Medications --------------------------------------------------------
    if "medication" in wanted:
        for rx in (
            db.query(models.Prescription)
            .filter(
                models.Prescription.patient_id == pid,
                models.Prescription.deleted_at.is_(None),
            )
            .order_by(desc(models.Prescription.created_at))
            .limit(40)
            .all()
        ):
            names = [i.medication_name for i in (rx.items or []) if i.medication_name]
            _add(
                items,
                item_id=f"rx-{rx.id}",
                source="prescription",
                category="medication",
                title=f"Prescription ({rx.status or 'active'}): {', '.join(names[:4]) or 'no items'}",
                description=rx.diagnosis_context,
                date_time=rx.created_at,
                status=rx.status,
                metadata={"prescription_id": rx.id, "medications": names},
                patient_summary=(
                    f"A prescription was recorded ({', '.join(names[:3])})."
                    if names
                    else "A prescription record was created."
                ),
            )

    # 6. Reports ------------------------------------------------------------
    if "report" in wanted:
        for analysis in (
            db.query(models.ReportAnalysis)
            .filter(
                models.ReportAnalysis.patient_id == pid,
                models.ReportAnalysis.deleted_at.is_(None),
            )
            .order_by(desc(models.ReportAnalysis.created_at))
            .limit(40)
            .all()
        ):
            abnormal_count = 0
            try:
                abnormal_count = len(json.loads(analysis.abnormal_findings or "[]"))
            except (ValueError, TypeError):
                abnormal_count = 0
            _add(
                items,
                item_id=f"report-{analysis.id}",
                source="report_analysis",
                category="report",
                title=f"Report {analysis.status}: {analysis.file_name}",
                description=analysis.summary or analysis.error_detail,
                date_time=analysis.created_at,
                status=analysis.status,
                requires_review=bool(analysis.requires_clinician_review),
                metadata={
                    "report_analysis_id": analysis.id,
                    "abnormal_count": abnormal_count,
                    "comparison_id": analysis.comparison_id,
                    "review_id": analysis.review_id,
                },
                patient_summary=(
                    "A report you uploaded was processed."
                    if analysis.status == "completed"
                    else f"A report is {analysis.status}."
                ),
                link=f"/reports?patient={pid}&analysis={analysis.id}",
            )

    # 7. Risk assessments ---------------------------------------------------
    if "risk" in wanted:
        for risk in (
            db.query(models.RiskAssessment)
            .filter(
                models.RiskAssessment.user_id == pid,
                models.RiskAssessment.deleted_at.is_(None),
            )
            .order_by(desc(models.RiskAssessment.assessed_at))
            .limit(60)
            .all()
        ):
            _add(
                items,
                item_id=f"risk-{risk.id}",
                source="risk_assessment",
                category="risk",
                title=f"{risk.risk_category} risk: {risk.risk_level} ({risk.score:.0f})",
                description=risk.reason,
                date_time=risk.assessed_at,
                risk_level=risk.risk_level,
                requires_review=risk.risk_level in ("high", "critical"),
                metadata={"risk_id": risk.id, "trend": risk.trend},
                patient_summary=(
                    "Your care team's screening tools updated a health-risk indicator."
                ),
            )

    # 8. Safety alerts ------------------------------------------------------
    if "safety" in wanted:
        for alert in (
            db.query(models.ClinicalAlert)
            .filter(models.ClinicalAlert.patient_id == pid)
            .order_by(desc(models.ClinicalAlert.created_at))
            .limit(40)
            .all()
        ):
            _add(
                items,
                item_id=f"alert-{alert.id}",
                source="clinical_alert",
                category="safety",
                title=f"{alert.alert_type}: {alert.message}"[:200],
                date_time=alert.created_at,
                risk_level=(alert.severity or "").lower(),
                requires_review=not bool(alert.is_acknowledged),
                status="acknowledged" if alert.is_acknowledged else "open",
                metadata={"alert_id": alert.id, "severity": alert.severity},
                patient_summary="A safety check was raised for your care team to review.",
            )

    # 9. Care gaps ----------------------------------------------------------
    if "care_gap" in wanted:
        for gap in (
            db.query(models.CareGap)
            .filter(models.CareGap.user_id == pid, models.CareGap.deleted_at.is_(None))
            .order_by(desc(models.CareGap.detected_at))
            .limit(40)
            .all()
        ):
            _add(
                items,
                item_id=f"gap-{gap.id}",
                source="care_gap",
                category="care_gap",
                title=f"Care gap ({gap.status}): {gap.title}",
                description=gap.resolution_notes or gap.description,
                date_time=gap.resolved_at or gap.detected_at,
                risk_level=gap.severity,
                requires_review=gap.status in ("detected", "escalated"),
                status=gap.status,
                metadata={"care_gap_id": gap.id, "gap_type": gap.gap_type},
                patient_summary="A recommended follow-up step was tracked for your care.",
            )

    # 10. Clinical reviews --------------------------------------------------
    if "review" in wanted:
        for review in (
            db.query(models.ClinicalReview)
            .filter(
                models.ClinicalReview.patient_id == pid,
                models.ClinicalReview.deleted_at.is_(None),
            )
            .order_by(desc(models.ClinicalReview.created_at))
            .limit(40)
            .all()
        ):
            _add(
                items,
                item_id=f"review-{review.id}",
                source="clinical_review",
                category="review",
                title=f"Clinical review ({review.status})",
                description=review.reviewer_notes or review.ai_summary,
                date_time=review.reviewed_at or review.created_at,
                risk_level=review.ai_risk_level,
                requires_review=review.status in ("pending", "in_review", "follow_up_required"),
                status=review.status,
                metadata={"review_id": review.id, "priority": review.priority},
                patient_summary=(
                    "Your clinician reviewed an AI-assisted summary."
                    if review.status in ("approved", "rejected")
                    else "An AI-assisted summary is waiting for clinician review."
                ),
            )

    # 11. Appointments ------------------------------------------------------
    if "appointment" in wanted:
        for appt in (
            db.query(models.Appointment)
            .filter(
                models.Appointment.user_id == pid,
                models.Appointment.deleted_at.is_(None),
            )
            .order_by(desc(models.Appointment.date_time))
            .limit(40)
            .all()
        ):
            _add(
                items,
                item_id=f"appt-{appt.id}",
                source="appointment",
                category="appointment",
                title=f"Appointment ({appt.status}): {appt.specialist or 'Consultation'}",
                description=appt.reason,
                date_time=appt.date_time,
                status=appt.status,
                metadata={"appointment_id": appt.id},
                patient_summary=f"Appointment with {appt.specialist or 'your care team'} ({appt.status}).",
            )

    # Filtering ------------------------------------------------------------
    items = [i for i in items if i.category in wanted]
    lower = _naive(start)
    upper = _naive(end)
    if days:
        window_start = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
        lower = max(lower, window_start) if lower else window_start
    if lower:
        items = [i for i in items if i.date_time >= lower]
    if upper:
        items = [i for i in items if i.date_time <= upper]

    items.sort(key=lambda i: i.date_time, reverse=True)
    present = sorted({i.category for i in items})
    return cw.AggregatedTimelineResponse(
        patient_id=pid,
        generated_at=datetime.now(timezone.utc),
        total=len(items),
        categories=present,
        items=items[:limit],
    )
