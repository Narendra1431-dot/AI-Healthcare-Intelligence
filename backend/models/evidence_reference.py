"""Evidence reference model for medical citations."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Float, CheckConstraint, Column, DateTime, Enum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from ..database import Base, SoftDeleteMixin
import enum


class EvidenceType(str, enum.Enum):
    """Types of medical evidence."""
    LAB_RESULT = "lab_result"
    IMAGING_FINDING = "imaging_finding"
    CLINICAL_GUIDELINE = "clinical_guideline"
    PEER_REVIEWED_ARTICLE = "peer_reviewed_article"
    DRUG_LABEL = "drug_label"
    PATIENT_DATA = "patient_data"
    MODEL_OUTPUT = "model_output"
    PREVIOUS_REPORT = "previous_report"


class EvidenceStatus(str, enum.Enum):
    """Status of evidence verification."""
    VERIFIED = "verified"
    UNVERIFIED = "unverified"
    PENDING = "pending"
    DISPUTED = "disputed"


class EvidenceReference(Base, SoftDeleteMixin):
    """Reference to medical evidence source."""
    __tablename__ = "evidence_references"

    __table_args__ = (
        Index("idx_evidence_user_created", "user_id", "extraction_date"),
        Index("idx_evidence_type", "evidence_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    evidence_type = Column(String, nullable=False)
    title = Column(String, nullable=False)  # Title or description
    source = Column(String, nullable=True)  # URL, DOI, or reference
    citation = Column(String, nullable=True)  # Full citation
    relevance_score = Column(Float, nullable=True)  # 0-1 scale how relevant
    confidence = Column(Float, nullable=True)  # 0-1 scale how trustworthy
    extraction_date = Column(DateTime, nullable=True)  # When evidence was extracted
    status = Column(String, default="pending", nullable=False, index=True)
    related_findings = Column(Text, nullable=True)  # JSON - which agent findings this supports

    # Relationships
    user = relationship("User", back_populates="evidence_references")

    def to_summary(self) -> dict:
        """Convert to summary dict for display."""
        return {
            "id": self.id,
            "evidence_type": self.evidence_type,
            "title": self.title[:80] + "..." if len(self.title) > 80 else self.title,
            "source": self.source,
            "relevance_score": float(self.relevance_score) if self.relevance_score else None,
            "confidence": float(self.confidence) if self.confidence else None,
            "status": self.status,
        }