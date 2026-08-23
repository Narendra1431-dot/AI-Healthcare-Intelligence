"""Report ingestion / analysis workflow model.

Tracks the real, persisted state machine of a clinical report as it moves
through the pipeline:

``uploaded`` -> ``extracting`` -> ``extracted`` -> ``analyzing`` -> ``analyzed``
-> ``comparing`` -> ``compared`` -> ``verifying`` -> ``completed`` (or ``failed``)

Each transition is written to the database by the report workflow service so the
UI never has to simulate progress. The uploaded payload is stored encrypted and
cleared as soon as the pipeline completes or fails.
"""
from datetime import datetime, timezone

import enum

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy_utils import StringEncryptedType
from sqlalchemy_utils.types.encrypted.encrypted_type import AesEngine

from ..database import Base, SoftDeleteMixin, get_encryption_key


class ReportAnalysisStatus(str, enum.Enum):
    """Persisted report pipeline states."""

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


class ReportAnalysis(Base, SoftDeleteMixin):
    """A single uploaded clinical report and its processing state."""

    __tablename__ = "report_analyses"

    __table_args__ = (
        Index("idx_report_analysis_patient_created", "patient_id", "created_at"),
        Index("idx_report_analysis_status", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)

    file_name = Column(String, nullable=False)
    content_type = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    source = Column(String, default="structured_upload", nullable=False)

    status = Column(String, default=ReportAnalysisStatus.UPLOADED.value, nullable=False, index=True)
    stage_history = Column(Text, nullable=True)  # JSON list of {stage, at, detail}
    error_detail = Column(String, nullable=True)

    # Encrypted transient payload — cleared once the pipeline finishes.
    raw_payload = Column(StringEncryptedType(Text, get_encryption_key, AesEngine, "pkcs5"), nullable=True)

    extracted_values = Column(Text, nullable=True)  # JSON dict of normalized marker -> value
    abnormal_findings = Column(Text, nullable=True)  # JSON list of finding dicts
    summary = Column(Text, nullable=True)
    requires_clinician_review = Column(Boolean, default=False, nullable=False)

    health_record_id = Column(Integer, ForeignKey("health_records.id"), nullable=True, index=True)
    comparison_id = Column(Integer, ForeignKey("report_comparisons.id"), nullable=True, index=True)
    review_id = Column(Integer, ForeignKey("clinical_reviews.id"), nullable=True, index=True)
    timeline_event_id = Column(Integer, ForeignKey("patient_timeline_events.id"), nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    completed_at = Column(DateTime, nullable=True)
