"""Longitudinal patient health timeline events."""
from datetime import datetime, timezone
from typing import Optional, Any

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql.sqltypes import JSON

from ..database import Base, SoftDeleteMixin
import enum


class TimelineEventType(str, enum.Enum):
    """Types of longitudinal timeline events."""
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


class TimelineEventStatus(str, enum.Enum):
    """Status of timeline events."""
    ACTIVE = "active"
    RESOLVED = "resolved"
    ARCHIVED = "archived"


class PatientTimelineEvent(Base, SoftDeleteMixin):
    """Longitudinal patient health timeline event."""
    __tablename__ = "patient_timeline_events"

    __table_args__ = (
        Index(
            "idx_timeline_user_event_type",
            "user_id",
            "event_type",
            "created_at",
        ),
        Index("idx_timeline_user_created", "user_id", "created_at"),
        Index("idx_timeline_event_type", "event_type"),
        CheckConstraint(
            """event_type IN (
                'visit', 'diagnosis', 'medication', 'lab_result',
                'imaging', 'procedure', 'symptom', 'vital',
                'appointment', 'risk_assessment', 'care_gap'
            )""",
            name="check_timeline_event_type",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    event_type = Column(String, nullable=False)
    subtype = Column(String, nullable=True)  # e.g., "lab_test", "imaging_study"
    title = Column(String, nullable=False)  # Human-readable title
    description = Column(Text, nullable=True)
    date_time = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Event-specific data stored as JSON
    event_metadata = Column("metadata", JSON, nullable=True)  # e.g., lab values, vital ranges, diagnosis codes

    # Risk flagging
    risk_level = Column(String, nullable=True)  # "LOW", "MEDIUM", "HIGH"
    requires_review = Column(Boolean, default=False, nullable=False)

    # Relationships
    user = relationship("User", back_populates="timeline_events")

    def to_summary(self) -> dict:
        """Convert to summary dict for display."""
        return {
            "id": self.id,
            "event_type": self.event_type,
            "title": self.title,
            "date": self.date_time.iso() if self.date_time else None,
            "risk_level": self.risk_level,
            "requires_review": self.requires_review,
        }