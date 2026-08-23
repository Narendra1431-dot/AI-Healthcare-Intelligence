"""Clinical workflow API — care-gap and clinical-review state persistence.

Completes the human-in-the-loop loop (UI -> API -> engine -> database -> UI):

Care gaps
    ``GET   /intelligence/care-gap-queue``        cross-patient queue
    ``PATCH /intelligence/care-gap/{gap_id}``     detected -> in_review -> resolved / escalated

Clinical review
    ``GET   /intelligence/review-queue``          cross-patient review queue
    ``GET   /intelligence/review/{review_id}``    full decision context
    ``POST  /intelligence/review/{review_id}/action``
                                                  start / approve / reject /
                                                  request follow-up / add note

Every transition persists to the owning entity and appends a patient timeline
event, so the UI can always refresh from backend state.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from . import auth, database, models
from .clinical_access import (
    MEDICAL_DISCLAIMER,
    accessible_patient_ids,
    patient_label,
    patient_labels,
    record_timeline_event,
    require_clinician,
    resolve_patient_scope,
)
from .intelligence_engine import CareGapEngine, RiskEngine, SafetyLayer
from .schemas import clinical_workflow as cw

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/intelligence", tags=["Clinical Workflow"])

_GAP_FLOW: Dict[str, tuple[str, ...]] = {
    "detected": ("in_review", "resolved", "escalated"),
    "in_review": ("resolved", "escalated", "detected"),
    "escalated": ("in_review", "resolved"),
    "resolved": ("in_review",),
}


def _json_load(value: Optional[str], default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return default


def _append_note(existing: Optional[str], note: str, author: models.User) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    entry = f"[{stamp}] {author.role or 'clinician'} #{author.id}: {note.strip()}"
    return f"{existing}\n{entry}" if existing else entry


# ---------------------------------------------------------------------------
# Care gaps
# ---------------------------------------------------------------------------


@router.get("/care-gap-queue", response_model=List[cw.CareGapQueueItem])
def care_gap_queue(
    status: Optional[str] = Query(None, description="Filter by care-gap status"),
    limit: int = Query(100, ge=1, le=300),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> List[cw.CareGapQueueItem]:
    """Return care gaps across every patient the caller may access.

    Detection runs first for each accessible patient so newly appearing gaps are
    persisted before the queue is returned.
    """
    require_clinician(current_user)
    patient_ids = accessible_patient_ids(db, current_user, limit=40)
    for pid in patient_ids:
        _sync_detected_gaps(db, pid, current_user.id)
    db.commit()

    query = db.query(models.CareGap).filter(models.CareGap.user_id.in_(patient_ids or [-1]))
    if status:
        query = query.filter(models.CareGap.status == status)
    rows = query.order_by(desc(models.CareGap.detected_at)).limit(limit).all()
    labels = patient_labels(db, [r.user_id for r in rows if r.user_id])
    return [
        cw.CareGapQueueItem(
            id=r.id,
            patient_id=r.user_id,
            patient_label=labels.get(r.user_id, f"Patient #{r.user_id}"),
            gap_type=r.gap_type,
            title=r.title,
            description=r.description,
            severity=r.severity,
            status=r.status,
            resolution_notes=r.resolution_notes,
            detected_at=r.detected_at,
            resolved_at=r.resolved_at,
        )
        for r in rows
    ]


def _sync_detected_gaps(db: Session, patient_id: int, detected_by: int) -> None:
    """Persist newly detected care gaps for a patient without duplicating."""
    detected = CareGapEngine.detect(db, patient_id)
    existing = (
        db.query(models.CareGap)
        .filter(
            models.CareGap.user_id == patient_id,
            models.CareGap.status.in_(["detected", "in_review", "escalated"]),
        )
        .all()
    )
    existing_keys = {(g.gap_type, g.title) for g in existing}
    for gap in detected:
        if (gap["gap_type"], gap["title"]) not in existing_keys:
            db.add(
                models.CareGap(
                    user_id=patient_id,
                    gap_type=gap["gap_type"],
                    detected_by=detected_by,
                    status="detected",
                    title=gap["title"],
                    severity=gap["severity"],
                )
            )


@router.patch("/care-gap/{gap_id}", response_model=cw.CareGapQueueItem)
def update_care_gap(
    gap_id: int,
    payload: cw.CareGapUpdateRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> cw.CareGapQueueItem:
    """Persist a care-gap state transition and record it on the timeline.

    Args:
        gap_id: Care gap to transition.
        payload: Target status and optional resolution notes.

    Returns:
        The updated care gap.

    Raises:
        HTTPException: 403 non-clinician, 404 unknown gap, 409 invalid transition.
    """
    require_clinician(current_user)
    gap = db.query(models.CareGap).filter(models.CareGap.id == gap_id).first()
    if not gap:
        raise HTTPException(status_code=404, detail="Care gap not found")

    pid = gap.user_id
    resolve_patient_scope(db, current_user, pid)

    target = payload.status.value
    allowed = _GAP_FLOW.get(gap.status or "detected", ())
    if target != gap.status and target not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot move care gap from '{gap.status}' to '{target}'.",
        )

    gap.status = target
    if payload.resolution_notes:
        gap.resolution_notes = _append_note(gap.resolution_notes, payload.resolution_notes, current_user)
    gap.resolved_at = datetime.now(timezone.utc) if target == "resolved" else None

    record_timeline_event(
        db,
        pid,
        "care_gap",
        f"Care gap {target.replace('_', ' ')}: {gap.title}",
        subtype=f"care_gap_{target}",
        description=payload.resolution_notes or gap.description,
        event_metadata={
            "care_gap_id": gap.id,
            "gap_type": gap.gap_type,
            "status": target,
            "severity": gap.severity,
        },
        risk_level=gap.severity,
        requires_review=target in ("detected", "escalated"),
        commit=False,
    )
    db.commit()
    db.refresh(gap)

    return cw.CareGapQueueItem(
        id=gap.id,
        patient_id=pid,
        patient_label=patient_label(db, pid),
        gap_type=gap.gap_type,
        title=gap.title,
        description=gap.description,
        severity=gap.severity,
        status=gap.status,
        resolution_notes=gap.resolution_notes,
        detected_at=gap.detected_at,
        resolved_at=gap.resolved_at,
    )


# ---------------------------------------------------------------------------
# Clinical review queue
# ---------------------------------------------------------------------------


@router.get("/review-queue", response_model=List[cw.ReviewQueueItem])
def review_queue(
    status: Optional[str] = Query(None, description="pending | in_review | approved | rejected | follow_up_required"),
    limit: int = Query(100, ge=1, le=300),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> List[cw.ReviewQueueItem]:
    """Return the clinical review queue across accessible patients."""
    require_clinician(current_user)
    patient_ids = accessible_patient_ids(db, current_user, limit=60)
    query = db.query(models.ClinicalReview).filter(
        models.ClinicalReview.patient_id.in_(patient_ids or [-1])
    )
    if status:
        query = query.filter(models.ClinicalReview.status == status)
    rows = query.order_by(desc(models.ClinicalReview.created_at)).limit(limit).all()
    labels = patient_labels(db, [r.patient_id for r in rows])
    return [
        cw.ReviewQueueItem(
            id=r.id,
            patient_id=r.patient_id,
            patient_label=labels.get(r.patient_id, f"Patient #{r.patient_id}"),
            status=r.status,
            priority=r.priority,
            ai_summary=r.ai_summary,
            ai_risk_level=r.ai_risk_level,
            ai_confidence=r.ai_confidence,
            final_decision=r.final_decision,
            reviewer_notes=r.reviewer_notes,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at,
        )
        for r in rows
    ]


@router.get("/review/{review_id}", response_model=cw.ClinicalReviewDetail)
def get_review_detail(
    review_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> cw.ClinicalReviewDetail:
    """Return one review with its agent opinions, evidence and risk snapshot."""
    review = db.query(models.ClinicalReview).filter(models.ClinicalReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    pid = resolve_patient_scope(db, current_user, review.patient_id)

    opinions_raw = _json_load(review.ai_opinions, [])
    opinions: List[cw.ReviewAgentOpinion] = []
    if isinstance(opinions_raw, list):
        for item in opinions_raw:
            if isinstance(item, dict) and item.get("specialist"):
                opinions.append(
                    cw.ReviewAgentOpinion(
                        specialist=str(item.get("specialist")),
                        interpretation=str(item.get("interpretation") or ""),
                        evidence=[str(e) for e in (item.get("evidence") or [])],
                        confidence=float(item.get("confidence") or 0.0),
                        concerns=[str(c) for c in (item.get("concerns") or [])],
                    )
                )

    conflicts_raw = _json_load(review.ai_conflicts, [])
    conflicts = [c for c in conflicts_raw if isinstance(c, dict)] if isinstance(conflicts_raw, list) else []

    findings: List[Dict[str, Any]] = []
    if review.ai_run_id:
        rows = (
            db.query(models.AgentFinding)
            .filter(models.AgentFinding.agent_run_id == review.ai_run_id)
            .all()
        )
        findings = [
            {
                "id": f.id,
                "category": f.category,
                "title": f.title,
                "description": f.description,
                "confidence": f.confidence,
                "evidence_source": f.evidence_source,
                "is_conflicting": bool(f.is_conflicting),
            }
            for f in rows
        ]

    evidence_rows = (
        db.query(models.EvidenceReference)
        .filter(models.EvidenceReference.user_id == pid)
        .order_by(desc(models.EvidenceReference.extraction_date))
        .limit(10)
        .all()
    )
    risk = RiskEngine.assess(db, pid)

    return cw.ClinicalReviewDetail(
        id=review.id,
        patient_id=pid,
        patient_label=patient_label(db, pid),
        status=review.status,
        priority=review.priority,
        ai_summary=review.ai_summary,
        ai_evidence=review.ai_evidence,
        ai_risk_level=review.ai_risk_level,
        ai_confidence=review.ai_confidence,
        ai_opinions=opinions,
        ai_conflicts=conflicts,
        reviewer_notes=review.reviewer_notes,
        final_decision=review.final_decision,
        created_at=review.created_at,
        reviewed_at=review.reviewed_at,
        linked_findings=findings,
        evidence_references=[
            {
                "id": e.id,
                "title": e.title,
                "evidence_type": e.evidence_type,
                "source": e.source,
                "citation": e.citation,
                "status": e.status,
                "confidence": e.confidence,
            }
            for e in evidence_rows
        ],
        risk_snapshot={
            "overall_risk_level": risk["overall_risk_level"],
            "recommended_review_level": risk["recommended_review_level"],
            "categories": [
                {
                    "risk_category": r["risk_category"],
                    "risk_level": r["risk_level"],
                    "score": r["score"],
                }
                for r in risk["risks"]
            ],
            "uncertainty": SafetyLayer.uncertainty_note(),
        },
        disclaimer=MEDICAL_DISCLAIMER,
    )


@router.post("/review/{review_id}/action", response_model=cw.ClinicalReviewDetail)
def act_on_review(
    review_id: int,
    payload: cw.ReviewActionRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
) -> cw.ClinicalReviewDetail:
    """Persist a clinician decision on a clinical review.

    Args:
        review_id: Review being acted on.
        payload: Action (start/approve/reject/request follow-up/add note) plus
            an optional clinical note.

    Returns:
        The refreshed review detail read back from the database.

    Raises:
        HTTPException: 403 non-clinician, 404 unknown review, 400 missing note.
    """
    require_clinician(current_user)
    review = db.query(models.ClinicalReview).filter(models.ClinicalReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    pid = resolve_patient_scope(db, current_user, review.patient_id)

    action = payload.action
    note = (payload.note or "").strip()
    if action is cw.ReviewAction.ADD_NOTE and not note:
        raise HTTPException(status_code=400, detail="A clinical note is required for this action.")

    now = datetime.now(timezone.utc)
    if action is cw.ReviewAction.START_REVIEW:
        review.status = "in_review"
    elif action is cw.ReviewAction.APPROVE:
        review.status = "approved"
        review.final_decision = "approve"
        review.reviewed_at = now
    elif action is cw.ReviewAction.REJECT:
        review.status = "rejected"
        review.final_decision = "reject"
        review.reviewed_at = now
    elif action is cw.ReviewAction.REQUEST_FOLLOW_UP:
        review.status = "follow_up_required"
        review.final_decision = "request_follow_up"
        review.reviewed_at = now
    elif action is cw.ReviewAction.ADD_NOTE and review.status == "pending":
        review.status = "in_review"

    if note:
        review.reviewer_notes = _append_note(review.reviewer_notes, note, current_user)
    review.user_id = review.user_id or current_user.id
    review.reviewed_at_timestamp = now

    if action is not cw.ReviewAction.ADD_NOTE:
        record_timeline_event(
            db,
            pid,
            "risk_assessment",
            f"Clinical review {review.status.replace('_', ' ')}",
            subtype="clinical_review",
            description=note or review.ai_summary,
            event_metadata={
                "review_id": review.id,
                "status": review.status,
                "decision": review.final_decision,
                "priority": review.priority,
            },
            risk_level=review.ai_risk_level,
            requires_review=review.status in ("pending", "in_review", "follow_up_required"),
            commit=False,
        )
    db.commit()
    db.refresh(review)
    return get_review_detail(review_id=review.id, db=db, current_user=current_user)
