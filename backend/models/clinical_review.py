"""Clinical review model for human-in-the-loop workflow."""
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import Float, CheckConstraint, Column, DateTime, Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base, SoftDeleteMixin
import enum


class ReviewStatus(str, enum.Enum):
    """Status of clinical review."""
    PENDING = "pending"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    FOLLOW_UP_REQUIRED = "follow_up_required"
    FLAGGED = "flagged"


class ReviewPriority(str, enum.Enum):
    """Priority of clinical review."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class ClinicalReview(Base, SoftDeleteMixin):
    """Clinical review workflow for AI output human approval."""
    __tablename__ = "clinical_reviews"

    __table_args__ = (
        Index("idx_clinical_review_user_created", "user_id", "created_at"),
        Index("idx_clinical_review_status_priority", "status", "priority"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)  # Reviewing clinician
    patient_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)  # Patient being reviewed
    ai_run_id = Column(Integer, ForeignKey("agent_runs.id"), index=True, nullable=True)  # Associated agent run

    # AI output being reviewed
    ai_summary = Column(Text, nullable=True)  # AI-generated clinical summary
    ai_evidence = Column(Text, nullable=True)  # AI-provided evidence
    ai_opinions = Column(Text, nullable=True)  # AI agent opinions (JSON)
    ai_conflicts = Column(Text, nullable=True)  # Any conflicts between agents (JSON)
    ai_risk_level = Column(String, nullable=True)  # "LOW", "MEDIUM", "HIGH", "CRITICAL"
    ai_confidence = Column(Float, nullable=True)  # 0-1 scale

    # Review details
    status = Column(String, default="pending", nullable=False, index=True)
    priority = Column(String, default="medium", nullable=False)
    reviewer_notes = Column(Text, nullable=True)
    final_decision = Column(String, nullable=True)  # "approve", "reject", "request_changes"
    reviewed_at = Column(DateTime, nullable=True)

    # Timing
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    reviewed_at_timestamp = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", foreign_keys=[user_id], back_populates="clinical_reviews")
    patient = relationship("User", foreign_keys=[patient_id], back_populates="clinical_reviews_as_patient")
    agent_run = relationship("AgentRun", back_populates="clinical_review")

    def to_summary(self) -> dict:
        """Convert to summary dict for display."""
        return {
            "id": self.id,
            "status": self.status,
            "priority": self.priority,
            "ai_risk_level": self.ai_risk_level,
            "final_decision": self.final_decision,
            "reviewed_at": self.reviewed_at.iso() if self.reviewed_at else None,
            "created_at": self.created_at.iso() if self.created_at else None,
        }