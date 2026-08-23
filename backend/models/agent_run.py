"""Agent execution run model."""
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base, SoftDeleteMixin
import enum


class AgentStatus(str, enum.Enum):
    """Agent execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AgentType(str, enum.Enum):
    """Types of AI agents."""
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


class AgentFinding(Base, SoftDeleteMixin):
    """Individual finding from an agent analysis."""
    __tablename__ = "agent_findings"

    __table_args__ = (
        Index("idx_agentfinding_agent_run", "agent_run_id"),
        Index("idx_agentfinding_category", "category"),
    )

    id = Column(Integer, primary_key=True, index=True)
    agent_run_id = Column(Integer, ForeignKey("agent_runs.id"), index=True, nullable=False)
    category = Column(String, nullable=False)  # e.g., "findings", "concerns", "evidence"
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    confidence = Column(Float, nullable=True)  # 0-1 scale
    evidence_source = Column(String, nullable=True)  # Source citation
    is_conflicting = Column(Boolean, default=False, nullable=False)

    # Relationships
    agent_run = relationship("AgentRun", back_populates="findings")


class AgentRun(Base, SoftDeleteMixin):
    """Individual agent execution run."""
    __tablename__ = "agent_runs"

    __table_args__ = (
        Index("idx_agentrun_user_created", "user_id", "started_at"),
        Index("idx_agentrun_status_type", "status", "agent_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    agent_type = Column(String, nullable=False)
    patient_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    status = Column(String, default="pending", nullable=False, index=True)
    input_query = Column(Text, nullable=True)  # The query that triggered the agent
    output_summary = Column(Text, nullable=True)  # Summary of agent output
    output_details = Column(Text, nullable=True)  # Full detailed output (JSON)
    execution_time_ms = Column(Integer, nullable=True)  # How long it took
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", foreign_keys="[AgentRun.user_id]", back_populates="agent_runs")
    patient = relationship("User", foreign_keys=[patient_id], back_populates="agent_runs_by_patient")
    findings = relationship("AgentFinding", back_populates="agent_run", cascade="all, delete-orphan")
    clinical_review = relationship("ClinicalReview", back_populates="agent_run", uselist=False)

    def to_summary(self) -> dict:
        """Convert to summary dict for display."""
        return {
            "id": self.id,
            "agent_type": self.agent_type,
            "status": self.status,
            "execution_time_ms": self.execution_time_ms,
            "started_at": self.started_at.iso() if self.started_at else None,
            "completed_at": self.completed_at.iso() if self.completed_at else None,
            "has_output": self.output_summary is not None,
        }