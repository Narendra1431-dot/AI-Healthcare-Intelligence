"""Pydantic schemas for the completed clinical workflow endpoints.

Covers the report ingestion pipeline, care-gap state transitions, clinical
review queue/actions, aggregated patient timeline, and persisted agent
collaboration runs.

All schemas are additive; existing intelligence schemas stay in
``intelligence_features.py``.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Report workflow
# ---------------------------------------------------------------------------


class ReportStage(str, Enum):
    """Persisted report pipeline stages (mirrors ``ReportAnalysisStatus``)."""

    UPLOADED = "uploaded"
    EXTRACTING = "extracting"
    EXTRACTED = "extracted"
    ANALYZING = "analyzing"
    ANALYZED = "analyzed"
    COMPARING = "comparing"
    COMPARED = "compared"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"


class ReportStageEntry(BaseModel):
    """One recorded stage transition."""

    stage: str
    at: str
    detail: Optional[str] = None


class AbnormalFinding(BaseModel):
    """A marker outside its non-diagnostic screening reference range."""

    marker: str
    label: str
    value: float
    unit: Optional[str] = None
    reference_range: Optional[str] = None
    direction: str = "high"  # "high" | "low"
    severity: str = "warning"  # "info" | "warning" | "critical"
    patient_explanation: str


class ReportAnalysisResponse(BaseModel):
    """Full report workflow state as stored in the database."""

    id: int
    patient_id: int
    uploaded_by: Optional[int] = None
    file_name: str
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    source: str
    status: str
    stage_history: List[ReportStageEntry] = Field(default_factory=list)
    error_detail: Optional[str] = None
    extracted_values: Dict[str, Any] = Field(default_factory=dict)
    abnormal_findings: List[AbnormalFinding] = Field(default_factory=list)
    summary: Optional[str] = None
    requires_clinician_review: bool = False
    health_record_id: Optional[int] = None
    comparison_id: Optional[int] = None
    review_id: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    disclaimer: str
    model_config = ConfigDict(from_attributes=True)


class ReportListItem(BaseModel):
    """Compact report list row for a patient's report workspace."""

    id: int
    file_name: str
    status: str
    source: str
    abnormal_count: int = 0
    requires_clinician_review: bool = False
    health_record_id: Optional[int] = None
    comparison_id: Optional[int] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Care gaps
# ---------------------------------------------------------------------------


class CareGapStatusUpdate(str, Enum):
    """Allowed care-gap state transitions from the UI."""

    DETECTED = "detected"
    IN_REVIEW = "in_review"
    RESOLVED = "resolved"
    ESCALATED = "escalated"


class CareGapUpdateRequest(BaseModel):
    """Care-gap transition payload."""

    status: CareGapStatusUpdate
    resolution_notes: Optional[str] = Field(None, max_length=2000)


class CareGapQueueItem(BaseModel):
    """Care gap enriched with the patient label for cross-patient queues."""

    id: int
    patient_id: int
    patient_label: str
    gap_type: str
    title: str
    description: Optional[str] = None
    severity: str
    status: str
    resolution_notes: Optional[str] = None
    detected_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Clinical review
# ---------------------------------------------------------------------------


class ReviewAction(str, Enum):
    """Doctor decisions persisted against a clinical review."""

    START_REVIEW = "start_review"
    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_FOLLOW_UP = "request_follow_up"
    ADD_NOTE = "add_note"


class ReviewActionRequest(BaseModel):
    """Clinical review action payload."""

    action: ReviewAction
    note: Optional[str] = Field(None, max_length=4000)


class ReviewQueueItem(BaseModel):
    """Clinical review row for the cross-patient review queue."""

    id: int
    patient_id: int
    patient_label: str
    status: str
    priority: str
    ai_summary: Optional[str] = None
    ai_risk_level: Optional[str] = None
    ai_confidence: Optional[float] = None
    final_decision: Optional[str] = None
    reviewer_notes: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None


class ReviewAgentOpinion(BaseModel):
    """Safe, structured agent opinion attached to a review."""

    specialist: str
    interpretation: str
    evidence: List[str] = Field(default_factory=list)
    confidence: float = 0.0
    concerns: List[str] = Field(default_factory=list)


class ClinicalReviewDetail(BaseModel):
    """Everything a clinician needs to decide on one review."""

    id: int
    patient_id: int
    patient_label: str
    status: str
    priority: str
    ai_summary: Optional[str] = None
    ai_evidence: Optional[str] = None
    ai_risk_level: Optional[str] = None
    ai_confidence: Optional[float] = None
    ai_opinions: List[ReviewAgentOpinion] = Field(default_factory=list)
    ai_conflicts: List[Dict[str, Any]] = Field(default_factory=list)
    reviewer_notes: Optional[str] = None
    final_decision: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    linked_findings: List[Dict[str, Any]] = Field(default_factory=list)
    evidence_references: List[Dict[str, Any]] = Field(default_factory=list)
    risk_snapshot: Dict[str, Any] = Field(default_factory=dict)
    disclaimer: str


# ---------------------------------------------------------------------------
# Aggregated timeline
# ---------------------------------------------------------------------------


class AggregatedTimelineItem(BaseModel):
    """One longitudinal event derived from a real clinical record."""

    id: str
    source: str  # "timeline_event" | "encounter" | "lab" | ...
    category: str  # encounter | diagnosis | medication | lab | vital | report | risk | safety | care_gap | review | appointment
    title: str
    description: Optional[str] = None
    date_time: datetime
    risk_level: Optional[str] = None
    requires_review: bool = False
    status: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    patient_summary: Optional[str] = None
    link: Optional[str] = None


class AggregatedTimelineResponse(BaseModel):
    """Aggregated timeline payload with the categories actually present."""

    patient_id: int
    generated_at: datetime
    total: int
    categories: List[str] = Field(default_factory=list)
    items: List[AggregatedTimelineItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Agent collaboration
# ---------------------------------------------------------------------------


class AgentCollaborationRequest(BaseModel):
    """Request to run and persist a supervised agent collaboration."""

    patient_id: int
    question: Optional[str] = Field(None, max_length=500)
    specialists: Optional[List[str]] = None
    create_review: bool = True


class AgentFindingItem(BaseModel):
    """Persisted agent finding (task/finding/confidence/evidence/status)."""

    id: int
    category: str
    title: str
    description: Optional[str] = None
    confidence: Optional[float] = None
    evidence_source: Optional[str] = None
    is_conflicting: bool = False


class AgentStageItem(BaseModel):
    """One node of the supervised agent pipeline."""

    run_id: int
    agent_type: str
    stage: str
    task: str
    status: str
    summary: Optional[str] = None
    confidence: Optional[float] = None
    escalated: bool = False
    execution_time_ms: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    findings: List[AgentFindingItem] = Field(default_factory=list)


class AgentDisagreement(BaseModel):
    """Explicit, reviewable disagreement between two agents."""

    topic: str
    opinion_a: str
    opinion_b: str
    agent_a: str
    agent_b: str
    evidence: List[str] = Field(default_factory=list)
    confidence_a: Optional[float] = None
    confidence_b: Optional[float] = None
    review_required: bool = True


class AgentCollaborationResponse(BaseModel):
    """Persisted collaboration result, safe for clinician display."""

    patient_id: int
    supervisor_run_id: Optional[int] = None
    question: str
    generated_at: datetime
    stages: List[AgentStageItem] = Field(default_factory=list)
    disagreements: List[AgentDisagreement] = Field(default_factory=list)
    requires_clinician_review: bool = False
    supervisor_summary: str
    review_id: Optional[int] = None
    uncertainty_note: str
    disclaimer: str
