"""Care gap detection model."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import CheckConstraint, Column, DateTime, Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base, SoftDeleteMixin
import enum


class CareGapType(str, enum.Enum):
    """Types of care gaps."""
    OVERDUE_FOLLOWUP = "overdue_followup"
    MISSING_LAB_FOLLOWUP = "missing_lab_followup"
    UNRESOLVED_ABNORMAL_REPORT = "unresolved_abnormal_report"
    MEDICATION_REVIEW_DUE = "medication_review_due"
    APPOINTMENT_GAP = "appointment_gap"
    INCOMPLETE_WORKFLOW = "incomplete_workflow"


class CareGapStatus(str, enum.Enum):
    """Status of care gap detection."""
    DETECTED = "detected"
    IN_REVIEW = "in_review"
    RESOLVED = "resolved"
    ESCALATED = "escalated"


class CareGap(Base, SoftDeleteMixin):
    """Detected care gaps in patient workflow."""
    __tablename__ = "care_gaps"

    __table_args__ = (
        Index("idx_caregap_user_created", "user_id", "detected_at"),
        Index("idx_caregap_type_status", "gap_type", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)  # Patient
    gap_type = Column(String, nullable=False)
    patient_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)  # Attending clinician
    detected_by = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)  # Who detected it
    status = Column(String, default="detected", nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(String, default="medium", nullable=False)  # "low", "medium", "high"
    due_date = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolution_notes = Column(Text, nullable=True)
    detected_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    user = relationship("User", back_populates="care_gaps", foreign_keys=[user_id])
    patient = relationship("User", foreign_keys=[patient_id], back_populates="care_gaps_by_patient")
    detected_by_user = relationship("User", foreign_keys=[detected_by], backref="detected_care_gaps")

    def to_summary(self) -> dict:
        """Convert to summary dict for display."""
        return {
            "id": self.id,
            "gap_type": self.gap_type,
            "title": self.title,
            "severity": self.severity,
            "status": self.status,
            "due_date": self.due_date.iso() if self.due_date else None,
            "detected_at": self.detected_at.iso() if self.detected_at else None,
            "resolved_at": self.resolved_at.iso() if self.resolved_at else None,
        }