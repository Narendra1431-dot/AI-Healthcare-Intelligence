"""Clinical access control and shared clinical-workflow helpers.

Single source of truth for patient-scoped authorization across the clinical
intelligence workflow (timeline, reports, risk, medication safety, care gaps,
clinical reviews, agent collaboration).

Rules enforced here:

* ``patient`` role  -> may only access their own record (403 otherwise).
* ``doctor``/``nurse`` -> may access patients inside their care relationship
  (encounter, appointment, admission, prescription, existing review) and, when
  no care relationship rows exist at all for that patient, the shared
  demo/synthetic panel. Access to a *different clinician's* explicitly-owned
  patient is denied.
* ``admin`` -> administrative access to any existing patient.
* Unknown / non-existent patient ids -> 404.

The module also owns :func:`record_timeline_event`, the only supported way for
workflow services to append longitudinal events, so every persisted workflow
action (report completion, care-gap transition, clinical review decision)
shows up on the patient timeline.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional, Sequence

from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import models

CLINICIAN_ROLES: tuple[str, ...] = ("doctor", "nurse", "admin")
"""Roles allowed to act on clinical review / care-gap workflow entities."""

PATIENT_NOT_FOUND_DETAIL = "Patient not found"
PATIENT_FORBIDDEN_DETAIL = "Patients may only access their own records."
CLINICIAN_REQUIRED_DETAIL = "Clinician access required."
NOT_AUTHORIZED_DETAIL = "You are not authorized to access this patient record."

MEDICAL_DISCLAIMER = (
    "This AI-generated content is for informational and clinical decision-support "
    "purposes only. It is not a medical diagnosis. Always consult a qualified "
    "clinician for diagnosis, treatment, or emergencies."
)


def require_clinician(current_user: models.User) -> models.User:
    """Ensure the caller holds a clinician role.

    Args:
        current_user: Authenticated user from the auth dependency.

    Returns:
        The same user when authorized.

    Raises:
        HTTPException: 403 when the caller is not a clinician.
    """
    if current_user.role not in CLINICIAN_ROLES:
        raise HTTPException(status_code=403, detail=CLINICIAN_REQUIRED_DETAIL)
    return current_user


def _patient_exists(db: Session, patient_id: int) -> bool:
    return (
        db.query(models.User.id)
        .filter(models.User.id == patient_id)
        .first()
        is not None
    )


def _has_care_relationship(db: Session, clinician_id: int, patient_id: int) -> bool:
    """Return ``True`` when the clinician has any documented link to the patient."""
    checks = (
        db.query(models.Encounter.id).filter(
            models.Encounter.patient_id == patient_id,
            models.Encounter.doctor_id == clinician_id,
        ),
        db.query(models.Appointment.id).filter(
            models.Appointment.user_id == patient_id,
            models.Appointment.doctor_id == clinician_id,
        ),
        db.query(models.Prescription.id).filter(
            models.Prescription.patient_id == patient_id,
            models.Prescription.doctor_id == clinician_id,
        ),
        db.query(models.ClinicalReview.id).filter(
            models.ClinicalReview.patient_id == patient_id,
            models.ClinicalReview.user_id == clinician_id,
        ),
    )
    return any(q.first() is not None for q in checks)


def _patient_is_unassigned(db: Session, patient_id: int) -> bool:
    """Return ``True`` when no clinician owns this patient yet.

    Unassigned (typically synthetic/demo) patients stay visible to every
    clinician so a zero-configuration local install remains usable, matching
    the historical behaviour of the intelligence routes.
    """
    owned = (
        db.query(models.Encounter.id)
        .filter(
            models.Encounter.patient_id == patient_id,
            models.Encounter.doctor_id.isnot(None),
        )
        .first()
    )
    if owned is not None:
        return False
    appt = (
        db.query(models.Appointment.id)
        .filter(
            models.Appointment.user_id == patient_id,
            models.Appointment.doctor_id.isnot(None),
        )
        .first()
    )
    return appt is None


def resolve_patient_scope(
    db: Session,
    current_user: models.User,
    patient_id: Optional[int],
) -> int:
    """Resolve and authorize the patient id the caller may operate on.

    Args:
        db: Active database session.
        current_user: Authenticated caller.
        patient_id: Requested patient id. ``None`` resolves to the caller.

    Returns:
        The authorized patient id.

    Raises:
        HTTPException: 404 when the patient does not exist, 403 when the caller
            may not access that patient.
    """
    if patient_id is None:
        return current_user.id

    if current_user.role == "patient":
        if patient_id != current_user.id:
            raise HTTPException(status_code=403, detail=PATIENT_FORBIDDEN_DETAIL)
        return patient_id

    if not _patient_exists(db, patient_id):
        raise HTTPException(status_code=404, detail=PATIENT_NOT_FOUND_DETAIL)

    if current_user.role == "admin":
        return patient_id

    if current_user.role in ("doctor", "nurse"):
        if _has_care_relationship(db, current_user.id, patient_id):
            return patient_id
        if _patient_is_unassigned(db, patient_id):
            return patient_id
        raise HTTPException(status_code=403, detail=NOT_AUTHORIZED_DETAIL)

    # Other staff roles (pharmacist, billing) keep read scope for existing
    # patients; write endpoints separately require a clinician role.
    return patient_id


def accessible_patient_ids(db: Session, current_user: models.User, limit: int = 100) -> list[int]:
    """List patient ids the caller may see in panel/queue views.

    Args:
        db: Active database session.
        current_user: Authenticated caller.
        limit: Maximum number of ids to return.

    Returns:
        Ordered list of patient ids (most recently linked first).
    """
    if current_user.role == "patient":
        return [current_user.id]

    if current_user.role == "admin":
        rows = (
            db.query(models.User.id)
            .filter(models.User.role == "patient")
            .order_by(models.User.id.desc())
            .limit(limit)
            .all()
        )
        return [r[0] for r in rows]

    ids: list[int] = []

    enc_rows = (
        db.query(models.Encounter.patient_id)
        .filter(models.Encounter.doctor_id == current_user.id)
        .order_by(models.Encounter.started_at.desc())
        .limit(limit * 2)
        .all()
    )
    for (pid,) in enc_rows:
        if pid and pid not in ids:
            ids.append(pid)

    appt_rows = (
        db.query(models.Appointment.user_id)
        .filter(models.Appointment.doctor_id == current_user.id)
        .order_by(models.Appointment.date_time.desc())
        .limit(limit * 2)
        .all()
    )
    for (pid,) in appt_rows:
        if pid and pid not in ids:
            ids.append(pid)

    review_rows = (
        db.query(models.ClinicalReview.patient_id)
        .filter(models.ClinicalReview.user_id == current_user.id)
        .limit(limit * 2)
        .all()
    )
    for (pid,) in review_rows:
        if pid and pid not in ids:
            ids.append(pid)

    if not ids:
        # Zero-configuration fallback: unassigned (synthetic) patients only.
        rows = (
            db.query(models.User.id)
            .filter(models.User.role == "patient")
            .order_by(models.User.id.desc())
            .limit(limit * 2)
            .all()
        )
        for (pid,) in rows:
            if _patient_is_unassigned(db, pid) and pid not in ids:
                ids.append(pid)

    return ids[:limit]


def patient_label(db: Session, patient_id: int) -> str:
    """Return a display label for an authorized patient.

    Falls back to a non-identifying label when no name is stored. Callers must
    already be authorized for this patient; the label is never logged.
    """
    user = db.query(models.User).filter(models.User.id == patient_id).first()
    if not user:
        return f"Patient #{patient_id}"
    return (user.full_name or user.username or f"Patient #{patient_id}").strip()


def patient_labels(db: Session, patient_ids: Sequence[int]) -> Dict[int, str]:
    """Batch variant of :func:`patient_label`."""
    if not patient_ids:
        return {}
    rows = db.query(models.User).filter(models.User.id.in_(list(patient_ids))).all()
    out: Dict[int, str] = {}
    for user in rows:
        out[user.id] = (user.full_name or user.username or f"Patient #{user.id}").strip()
    for pid in patient_ids:
        out.setdefault(pid, f"Patient #{pid}")
    return out


def record_timeline_event(
    db: Session,
    patient_id: int,
    event_type: str,
    title: str,
    *,
    subtype: Optional[str] = None,
    description: Optional[str] = None,
    event_metadata: Optional[Dict[str, Any]] = None,
    risk_level: Optional[str] = None,
    requires_review: bool = False,
    date_time: Optional[datetime] = None,
    commit: bool = True,
) -> models.PatientTimelineEvent:
    """Append a longitudinal timeline event for a patient.

    Args:
        db: Active database session.
        patient_id: Patient the event belongs to.
        event_type: One of the ``patient_timeline_events`` allowed types.
        title: Short human-readable title.
        subtype: Optional workflow subtype (e.g. ``care_gap_resolved``).
        description: Optional longer description.
        event_metadata: Optional JSON-serialisable metadata (values, ids).
        risk_level: Optional risk level label.
        requires_review: Whether a clinician still needs to review the event.
        date_time: Event timestamp; defaults to now (UTC).
        commit: Commit the session when ``True``.

    Returns:
        The persisted timeline event.
    """
    event = models.PatientTimelineEvent(
        user_id=patient_id,
        event_type=event_type,
        subtype=subtype,
        title=title[:240],
        description=description,
        date_time=date_time or datetime.now(timezone.utc),
        event_metadata=event_metadata,
        risk_level=risk_level,
        requires_review=requires_review,
    )
    db.add(event)
    if commit:
        db.commit()
        db.refresh(event)
    return event
