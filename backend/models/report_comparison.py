"""Cross-report comparison model."""
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, Enum, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base, SoftDeleteMixin
import enum


class ComparisonStatus(str, enum.Enum):
    """Status of report comparison."""
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class ReportComparison(Base, SoftDeleteMixin):
    """Comparison between two medical reports."""
    __tablename__ = "report_comparisons"

    __table_args__ = (
        Index("idx_comparison_user_created", "user_id", "created_at"),
        Index("idx_comparison_status", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    report_a_id = Column(Integer, ForeignKey("health_records.id"), index=True, nullable=False)  # Older report
    report_b_id = Column(Integer, ForeignKey("health_records.id"), index=True, nullable=False)  # Newer report
    status = Column(String, default="pending", nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)

    # Comparison results
    what_changed = Column(Text, nullable=True)  # JSON summary of changes
    what_stayed_stable = Column(Text, nullable=True)
    what_became_abnormal = Column(Text, nullable=True)
    what_improved = Column(Text, nullable=True)
    what_worsened = Column(Text, nullable=True)
    requires_clinician_attention = Column(Boolean, default=False, nullable=False)

    # Risk assessment
    risk_trend = Column(String, nullable=True)  # "improving", "stable", "worsening"
    overall_risk_score = Column(Float, nullable=True)  # 0-100 scale

    # Relationships
    user = relationship("User", back_populates="report_comparisons")
    report_a = relationship("HealthRecord", foreign_keys=[report_a_id], back_populates="comparisons_as_a")
    report_b = relationship("HealthRecord", foreign_keys=[report_b_id], back_populates="comparisons_as_b")

    def to_summary(self) -> dict:
        """Convert to summary dict for display."""
        return {
            "id": self.id,
            "status": self.status,
            "created_at": self.created_at.iso() if self.created_at else None,
            "requires_clinician_attention": self.requires_clinician_attention,
            "risk_trend": self.risk_trend,
            "overall_risk_score": self.overall_risk_score,
        }