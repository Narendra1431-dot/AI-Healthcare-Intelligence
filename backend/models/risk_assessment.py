"""Risk assessment model for patient risk scores."""
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base, SoftDeleteMixin
import enum


class RiskCategory(str, enum.Enum):
    """Categories of risk assessment."""
    CARDIOVASCULAR = "cardiovascular"
    DIABETES = "diabetes"
    KIDNEY = "kidney"
    LIVER = "liver"
    MEDICATION = "medication"
    ABNORMAL_LAB = "abnormal_lab"
    MISSED_FOLLOWUP = "missed_followup"
    DETERIORATION = "deterioration"
    GENERAL = "general"


class RiskLevel(str, enum.Enum):
    """Risk level classifications."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RiskAssessment(Base, SoftDeleteMixin):
    """Risk assessment for a patient."""
    __tablename__ = "risk_assessments"

    __table_args__ = (
        Index("idx_risk_user_created", "user_id", "assessed_at"),
        Index("idx_risk_category_level", "risk_category", "risk_level"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    risk_category = Column(String, nullable=False)
    risk_level = Column(String, nullable=False)
    score = Column(Float, nullable=False)  # 0-100 scale
    confidence = Column(Float, nullable=True)  # 0-1 scale
    contributing_factors = Column(Text, nullable=True)  # JSON string
    trend = Column(String, nullable=True)  # "improving", "stable", "worsening", "new"
    reason = Column(Text, nullable=True)
    recommended_review_level = Column(String, nullable=True)  # "routine", "urgent", "emergency"
    assessed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    user = relationship("User", back_populates="risk_assessments")

    def to_summary(self) -> dict:
        """Convert to summary dict for display."""
        return {
            "id": self.id,
            "risk_category": self.risk_category,
            "risk_level": self.risk_level,
            "score": self.score,
            "confidence": float(self.confidence) if self.confidence else None,
            "trend": self.trend,
            "recommended_review_level": self.recommended_review_level,
            "assessed_at": self.assessed_at.iso() if self.assessed_at else None,
        }