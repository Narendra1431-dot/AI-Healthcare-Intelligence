"""Pydantic schemas for the AI Healthcare Intelligence Platform.

These schemas power the longitudinal patient timeline, cross-report
comparison, risk engine, agent collaboration, evidence verification,
clinical review, care-gap detection, and notification features.

All schemas follow strict typing and validation rules. They never expose
PII in error paths and are designed to be consumed by a privacy-aware SPA.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator
import json

from .appointments import AppointmentResponse
from .intelligence import ClinicalAlertResponse
from .pharmacy import PrescriptionResponse
from .clinical_workflow import ReportListItem


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class TimelineEventType(str, Enum):
    VISIT = "visit"
    DIAGNOSIS = "diagnosis"
    MEDICATION = "medication"
    LAB_RESULT = "lab_result"
    IMAGING = "imaging"
    PROCEDURE = "procedure"
    SYMPTOM = "symptom"
    VITAL = "vital"
    APPOINTMENT = "appointment"
    RISK_ASSESSMENT = "risk_assessment"
    CARE_GAP = "care_gap"


class RiskCategory(str, Enum):
    CARDIOVASCULAR = "cardiovascular"
    DIABETES = "diabetes"
    KIDNEY = "kidney"
    LIVER = "liver"
    MEDICATION = "medication"
    ABNORMAL_LAB = "abnormal_lab"
    MISSED_FOLLOWUP = "missed_followup"
    DETERIORATION = "deterioration"
    GENERAL = "general"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AgentType(str, Enum):
    SUPERVISOR = "supervisor"
    PATIENT_CONTEXT = "patient_context"
    CLINICAL_REASONING = "clinical_reasoning"
    MEDICAL_EVIDENCE = "medical_evidence"
    MEDICAL_REPORT = "medical_report"
    MEDICATION_SAFETY = "medication_safety"
    MEDICAL_IMAGING = "medical_imaging"
    RISK_SAFETY = "risk_safety"
    DOCTOR_REVIEW = "doctor_review"
    PATIENT_INTELLIGENCE = "patient_intelligence"


class AgentStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class EvidenceType(str, Enum):
    LAB_RESULT = "lab_result"
    IMAGING_FINDING = "imaging_finding"
    CLINICAL_GUIDELINE = "clinical_guideline"
    PEER_REVIEWED_ARTICLE = "peer_reviewed_article"
    DRUG_LABEL = "drug_label"
    PATIENT_DATA = "patient_data"
    MODEL_OUTPUT = "model_output"
    PREVIOUS_REPORT = "previous_report"


class EvidenceStatus(str, Enum):
    VERIFIED = "verified"
    UNVERIFIED = "unverified"
    PENDING = "pending"
    DISPUTED = "disputed"


class CareGapType(str, Enum):
    OVERDUE_FOLLOWUP = "overdue_followup"
    MISSING_LAB_FOLLOWUP = "missing_lab_followup"
    UNRESOLVED_ABNORMAL_REPORT = "unresolved_abnormal_report"
    MEDICATION_REVIEW_DUE = "medication_review_due"
    APPOINTMENT_GAP = "appointment_gap"
    INCOMPLETE_WORKFLOW = "incomplete_workflow"


class CareGapStatus(str, Enum):
    DETECTED = "detected"
    IN_REVIEW = "in_review"
    RESOLVED = "resolved"
    ESCALATED = "escalated"


class ReviewStatus(str, Enum):
    PENDING = "pending"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    FOLLOW_UP_REQUIRED = "follow_up_required"
    FLAGGED = "flagged"


class ReviewPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class ComparisonStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class SafetyLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


# ---------------------------------------------------------------------------
# Longitudinal Timeline
# ---------------------------------------------------------------------------


class TimelineEventCreate(BaseModel):
    event_type: TimelineEventType
    title: str = Field(..., min_length=1, max_length=240)
    subtype: Optional[str] = None
    description: Optional[str] = None
    date_time: datetime
    event_metadata: Optional[Dict[str, Any]] = None
    risk_level: Optional[str] = None
    requires_review: bool = False


class TimelineEventResponse(BaseModel):
    id: int
    user_id: int
    event_type: str
    subtype: Optional[str] = None
    title: str
    description: Optional[str] = None
    date_time: datetime
    event_metadata: Optional[Dict[str, Any]] = None
    risk_level: Optional[str] = None
    requires_review: bool = False
    model_config = ConfigDict(from_attributes=True)


class TimelineFilter(BaseModel):
    event_types: Optional[List[TimelineEventType]] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    risk_only: bool = False
    search: Optional[str] = None


# ---------------------------------------------------------------------------
# Change Detection (longitudinal values)
# ---------------------------------------------------------------------------


class ValueChange(BaseModel):
    key: str
    label: str
    unit: Optional[str] = None
    previous_value: Optional[float] = None
    current_value: Optional[float] = None
    previous_date: Optional[str] = None
    current_date: Optional[str] = None
    delta: Optional[float] = None
    delta_percent: Optional[float] = None
    direction: str = "stable"  # "improving" | "worsening" | "stable" | "new" | "resolved"
    abnormal_now: bool = False
    abnormal_previous: bool = False
    reference_range: Optional[str] = None
    severity: str = "info"  # "info" | "warning" | "critical"
    note: Optional[str] = None


class ChangeDetectionResponse(BaseModel):
    patient_id: int
    generated_at: datetime
    changes: List[ValueChange]
    abnormal_events: List[ValueChange]
    major_changes: List[ValueChange]
    summary: str


# ---------------------------------------------------------------------------
# Cross-Report Comparison
# ---------------------------------------------------------------------------


class ReportComparisonRequest(BaseModel):
    report_a_id: int
    report_b_id: int
    notes: Optional[str] = None


class ComparisonSection(BaseModel):
    items: List[Dict[str, Any]] = Field(default_factory=list)
    summary: str = ""


class ReportComparisonResponse(BaseModel):
    id: int
    user_id: int
    report_a_id: int
    report_b_id: int
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    what_changed: ComparisonSection = Field(default_factory=ComparisonSection)
    what_stayed_stable: ComparisonSection = Field(default_factory=ComparisonSection)
    what_became_abnormal: ComparisonSection = Field(default_factory=ComparisonSection)
    what_improved: ComparisonSection = Field(default_factory=ComparisonSection)
    what_worsened: ComparisonSection = Field(default_factory=ComparisonSection)
    requires_clinician_attention: bool = False
    risk_trend: Optional[str] = None
    overall_risk_score: Optional[float] = None
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Risk Assessment
# ---------------------------------------------------------------------------


class RiskAssessmentCreate(BaseModel):
    risk_category: RiskCategory
    risk_level: RiskLevel
    score: float = Field(..., ge=0, le=100)
    confidence: Optional[float] = Field(None, ge=0, le=1)
    contributing_factors: Optional[List[str]] = None
    trend: Optional[str] = None
    reason: Optional[str] = None
    recommended_review_level: Optional[str] = None


class RiskAssessmentResponse(BaseModel):
    id: int
    user_id: int
    risk_category: str
    risk_level: str
    score: float
    confidence: Optional[float] = None
    contributing_factors: Optional[List[str]] = None
    trend: Optional[str] = None
    reason: Optional[str] = None
    recommended_review_level: Optional[str] = None
    assessed_at: datetime
    model_config = ConfigDict(from_attributes=True)

    @field_validator("contributing_factors", mode="before")
    @classmethod
    def parse_contributing_factors(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v


class RiskOverviewResponse(BaseModel):
    patient_id: int
    generated_at: datetime
    risks: List[RiskAssessmentResponse]
    safety_events: List[Dict[str, Any]] = Field(default_factory=list)
    overall_risk_level: str = "low"
    recommended_review_level: str = "routine"
    summary: str


# ---------------------------------------------------------------------------
# Agent Collaboration / Reasoning Trace
# ---------------------------------------------------------------------------


class AgentFindingCreate(BaseModel):
    category: str
    title: str
    description: Optional[str] = None
    confidence: Optional[float] = Field(None, ge=0, le=1)
    evidence_source: Optional[str] = None
    is_conflicting: bool = False


class AgentRunCreate(BaseModel):
    agent_type: AgentType
    patient_id: Optional[int] = None
    input_query: Optional[str] = None


class AgentFindingResponse(BaseModel):
    id: int
    agent_run_id: int
    category: str
    title: str
    description: Optional[str] = None
    confidence: Optional[float] = None
    evidence_source: Optional[str] = None
    is_conflicting: bool = False
    model_config = ConfigDict(from_attributes=True)


class AgentRunResponse(BaseModel):
    id: int
    user_id: int
    agent_type: str
    patient_id: Optional[int] = None
    status: str
    input_query: Optional[str] = None
    output_summary: Optional[str] = None
    output_details: Optional[Dict[str, Any]] = None
    execution_time_ms: Optional[int] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    findings: List[AgentFindingResponse] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)


class AgentDebateRequest(BaseModel):
    patient_id: int
    question: str = Field(..., min_length=1)
    specialists: Optional[List[str]] = None


class AgentOpinion(BaseModel):
    specialist: str
    interpretation: str
    evidence: List[str] = Field(default_factory=list)
    confidence: float = Field(..., ge=0, le=1)
    concerns: List[str] = Field(default_factory=list)


class AgentDebateResponse(BaseModel):
    patient_id: int
    question: str
    opinions: List[AgentOpinion]
    consensus: Optional[str] = None
    disagreements: List[Dict[str, Any]] = Field(default_factory=list)
    requires_clinician_review: bool = False
    supervisor_summary: str
    generated_at: datetime


# ---------------------------------------------------------------------------
# Evidence Reference
# ---------------------------------------------------------------------------


class EvidenceReferenceCreate(BaseModel):
    evidence_type: EvidenceType
    title: str
    source: Optional[str] = None
    citation: Optional[str] = None
    relevance_score: Optional[float] = Field(None, ge=0, le=1)
    confidence: Optional[float] = Field(None, ge=0, le=1)
    extraction_date: Optional[datetime] = None
    related_findings: Optional[str] = None


class EvidenceReferenceResponse(BaseModel):
    id: int
    user_id: int
    evidence_type: str
    title: str
    source: Optional[str] = None
    citation: Optional[str] = None
    relevance_score: Optional[float] = None
    confidence: Optional[float] = None
    status: str
    extraction_date: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Care Gaps
# ---------------------------------------------------------------------------


class CareGapResponse(BaseModel):
    id: int
    user_id: int
    gap_type: str
    patient_id: Optional[int] = None
    detected_by: Optional[int] = None
    status: str
    title: str
    description: Optional[str] = None
    severity: str = "medium"
    due_date: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    detected_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Clinical Review (Human-in-the-loop)
# ---------------------------------------------------------------------------


class ClinicalReviewCreate(BaseModel):
    patient_id: int
    ai_run_id: Optional[int] = None
    ai_summary: Optional[str] = None
    ai_evidence: Optional[str] = None
    ai_opinions: Optional[Any] = None
    ai_conflicts: Optional[Any] = None
    ai_risk_level: Optional[str] = None
    ai_confidence: Optional[float] = Field(None, ge=0, le=1)
    priority: ReviewPriority = ReviewPriority.MEDIUM


class ClinicalReviewUpdate(BaseModel):
    status: Optional[ReviewStatus] = None
    reviewer_notes: Optional[str] = None
    final_decision: Optional[str] = None
    reviewed_at: Optional[datetime] = None


class ClinicalReviewResponse(BaseModel):
    id: int
    user_id: int
    patient_id: int
    ai_run_id: Optional[int] = None
    ai_summary: Optional[str] = None
    ai_evidence: Optional[str] = None
    ai_risk_level: Optional[str] = None
    ai_confidence: Optional[float] = None
    status: str
    priority: str
    reviewer_notes: Optional[str] = None
    final_decision: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Safety Events
# ---------------------------------------------------------------------------


class SafetyEventResponse(BaseModel):
    id: int
    user_id: int
    patient_id: Optional[int] = None
    level: str
    category: str
    message: str
    triggered_by: Optional[str] = None
    requires_escalation: bool = False
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    title: str
    body: Optional[str] = None
    category: Optional[str] = None
    severity: str = "info"
    read: bool = False
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Patient Intelligence Profile
# ---------------------------------------------------------------------------


class PatientIntelligenceProfile(BaseModel):
    patient_id: int
    generated_at: datetime
    overview: Dict[str, Any] = Field(default_factory=dict)
    current_conditions: List[str] = Field(default_factory=list)
    active_medications: List[str] = Field(default_factory=list)
    allergies: List[str] = Field(default_factory=list)
    recent_labs: List[Dict[str, Any]] = Field(default_factory=list)
    imaging: List[Dict[str, Any]] = Field(default_factory=list)
    risk_indicators: List[Dict[str, Any]] = Field(default_factory=list)
    recent_encounters: List[Dict[str, Any]] = Field(default_factory=list)
    long_term_trends: List[ValueChange] = Field(default_factory=list)
    care_gaps: List[Dict[str, Any]] = Field(default_factory=list)
    upcoming_followups: List[Dict[str, Any]] = Field(default_factory=list)
    ai_summary: Optional[str] = None
    ai_confidence: Optional[float] = None
    doctor_notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Doctor Dashboard
# ---------------------------------------------------------------------------


class DoctorDashboardResponse(BaseModel):
    generated_at: datetime
    high_priority_patients: List[Dict[str, Any]] = Field(default_factory=list)
    abnormal_lab_alerts: List[Dict[str, Any]] = Field(default_factory=list)
    recent_patient_changes: List[Dict[str, Any]] = Field(default_factory=list)
    medication_safety_alerts: List[Dict[str, Any]] = Field(default_factory=list)
    pending_ai_reviews: List[Dict[str, Any]] = Field(default_factory=list)
    unresolved_ai_conflicts: List[Dict[str, Any]] = Field(default_factory=list)
    upcoming_appointments: List[Dict[str, Any]] = Field(default_factory=list)
    report_review_queue: List[Dict[str, Any]] = Field(default_factory=list)
    patient_risk_overview: List[Dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# AI Assistant structured answer
# ---------------------------------------------------------------------------


class AIAssistantAnswer(BaseModel):
    summary: str
    relevant_findings: List[str] = Field(default_factory=list)
    evidence: List[str] = Field(default_factory=list)
    risk_and_uncertainty: str
    recommended_next_action: str
    doctor_review_required: bool = False
    disclaimer: str
    agent_trace: Optional[List[Dict[str, Any]]] = None


# ---------------------------------------------------------------------------
# Medication Safety
# ---------------------------------------------------------------------------


class MedicationInteraction(BaseModel):
    medication_a: str
    medication_b: str
    severity: str
    mechanism: str
    verification: str


class DuplicateTherapy(BaseModel):
    drug_class: str
    medications: List[str]
    severity: str
    note: str
    verification: str


class MedicationContraindication(BaseModel):
    allergy: str
    medication: str
    severity: str
    note: str
    verification: str


class DosageConcern(BaseModel):
    medication: str
    severity: str
    note: str
    verification: str


class MedicationSafetyResponse(BaseModel):
    patient_id: int
    medications: List[str] = Field(default_factory=list)
    interactions: List[MedicationInteraction] = Field(default_factory=list)
    duplicate_therapies: List[DuplicateTherapy] = Field(default_factory=list)
    contraindications: List[MedicationContraindication] = Field(default_factory=list)
    dosage_concerns: List[DosageConcern] = Field(default_factory=list)
    overall_level: str = "low"
    requires_clinician_review: bool = False
    disclaimer: str


# ---------------------------------------------------------------------------
# Patient Dashboard (aggregated single-shot response)
# ---------------------------------------------------------------------------


class PatientDashboardResponse(BaseModel):
    """Single aggregated response powering the patient portal dashboard.

    Consolidates the unified intelligence profile, prescriptions (with items),
    upcoming appointments, recent reports, active alerts, risk overview,
    and longitudinal timeline into one request, eliminating duplicate API calls.
    """

    patient_id: int
    generated_at: datetime
    profile: PatientIntelligenceProfile
    prescriptions: List[PrescriptionResponse] = Field(default_factory=list)
    appointments: List[AppointmentResponse] = Field(default_factory=list)
    reports: List[ReportListItem] = Field(default_factory=list)
    alerts: List[ClinicalAlertResponse] = Field(default_factory=list)
    care_gaps: List[CareGapResponse] = Field(default_factory=list)
    risk_overview: RiskOverviewResponse
    timeline: List[TimelineEventResponse] = Field(default_factory=list)
