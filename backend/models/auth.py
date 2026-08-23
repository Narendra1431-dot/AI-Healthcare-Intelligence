"""Authentication and user-related ORM models."""
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy_utils import StringEncryptedType
from sqlalchemy_utils.types.encrypted.encrypted_type import AesEngine

from ..database import Base, SoftDeleteMixin, get_encryption_key


class User(Base, SoftDeleteMixin):
    __tablename__ = "users"

    __table_args__ = (
        CheckConstraint("role IN ('patient', 'doctor', 'nurse', 'pharmacist', 'billing', 'admin')", name="check_user_role"),
    )

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    role = Column(String, default="patient")  # patient, doctor, nurse, pharmacist, billing, admin
    # Account activation flag. Disabled accounts cannot authenticate (RBAC enforcement).
    is_active = Column(Integer, default=1, nullable=False)  # 0=False, 1=True

    # Profile Data (Encrypted PII)
    email = Column(StringEncryptedType(String, get_encryption_key, AesEngine, 'pkcs5'), nullable=True, unique=True, index=True)
    full_name = Column(StringEncryptedType(String, get_encryption_key, AesEngine, 'pkcs5'), nullable=True)
    gender = Column(StringEncryptedType(String, get_encryption_key, AesEngine, 'pkcs5'), nullable=True)
    blood_type = Column(StringEncryptedType(String, get_encryption_key, AesEngine, 'pkcs5'), nullable=True)
    dob = Column(StringEncryptedType(String, get_encryption_key, AesEngine, 'pkcs5'), nullable=True)
    height = Column(Float, nullable=True)
    weight = Column(Float, nullable=True)
    existing_ailments = Column(StringEncryptedType(Text, get_encryption_key, AesEngine, 'pkcs5'), nullable=True)
    allergies = Column(StringEncryptedType(Text, get_encryption_key, AesEngine, 'pkcs5'), nullable=True)
    profile_picture = Column(Text, nullable=True)  # Base64 string
    about_me = Column(Text, nullable=True)  # Custom About Info

    # Lifestyle Data (The 4 Pillars)
    diet = Column(String, nullable=True)  # Vegan, Keto, etc.
    activity_level = Column(String, nullable=True)  # Sedentary, Active, etc.
    sleep_hours = Column(Float, nullable=True)
    stress_level = Column(String, nullable=True)  # Low, Medium, High

    # Privacy
    allow_data_collection = Column(Integer, default=1)  # 0=False, 1=True
    facility_id = Column(Integer, ForeignKey("hospital_facilities.id"), nullable=True, index=True)

    # Subscription / Monetization
    plan_tier = Column(String, default="free")  # free, pro, clinic
    subscription_expiry = Column(DateTime, nullable=True)
    razorpay_customer_id = Column(String, nullable=True, index=True)

    # Doctor Specific
    consultation_fee = Column(Float, default=500.0)
    specialization = Column(String, nullable=True)

    # AI Memory
    psych_profile = Column(StringEncryptedType(Text, get_encryption_key, AesEngine, 'pkcs5'), nullable=True)  # Long term memory summary

    # Two-Factor Authentication (Optional)
    totp_secret = Column(StringEncryptedType(String, get_encryption_key, AesEngine, 'pkcs5'), nullable=True)
    is_totp_enabled = Column(Integer, default=0) # 0=False, 1=True

    facility = relationship("HospitalFacility")
    health_records = relationship("HealthRecord", back_populates="owner")
    chat_logs = relationship("ChatLog", back_populates="owner")
    appointments = relationship("Appointment", back_populates="owner", foreign_keys="[Appointment.user_id]")
    timeline_events = relationship("PatientTimelineEvent", back_populates="user", cascade="all, delete-orphan")
    report_comparisons = relationship("ReportComparison", back_populates="user", order_by="ReportComparison.created_at.desc()")
    risk_assessments = relationship("RiskAssessment", back_populates="user", order_by="RiskAssessment.assessed_at.desc()")
    agent_runs = relationship("AgentRun", foreign_keys="[AgentRun.user_id]", back_populates="user", order_by="AgentRun.started_at.desc()")
    agent_runs_by_patient = relationship("AgentRun", foreign_keys="[AgentRun.patient_id]", back_populates="patient", order_by="AgentRun.started_at.desc()")
    evidence_references = relationship("EvidenceReference", back_populates="user", order_by="EvidenceReference.extraction_date.desc()")
    care_gaps = relationship("CareGap", foreign_keys="[CareGap.user_id]", back_populates="user", order_by="CareGap.detected_at.desc()")
    care_gaps_by_patient = relationship("CareGap", foreign_keys="[CareGap.patient_id]", back_populates="patient", order_by="CareGap.detected_at.desc()")
    clinical_reviews = relationship("ClinicalReview", foreign_keys="[ClinicalReview.user_id]", back_populates="user", order_by="ClinicalReview.created_at.desc()")
    clinical_reviews_as_patient = relationship("ClinicalReview", foreign_keys="[ClinicalReview.patient_id]", back_populates="patient", order_by="ClinicalReview.created_at.desc()")