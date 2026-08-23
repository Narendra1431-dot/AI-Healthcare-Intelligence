"""Seed synthetic DEMO data so the clinical workflow is end-to-end testable.

Every row created here is clearly labelled ``(Synthetic)`` / ``SYNTHETIC DEMO``
so it can never be mistaken for real patient data. The script is idempotent:
re-running it will not duplicate users or clinical records.

Run from the project root::

    python scripts/seed_demo_data.py

It uses ``DATABASE_URL`` (the same database the backend serves). For a local
zero-config install that is ``healthcare.db``.
"""
from __future__ import annotations

import os
import sys
import json
from datetime import datetime, timedelta, timezone

# Allow running as `python scripts/seed_demo_data.py` from repo root.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from backend import auth, models  # noqa: E402
from backend.database import get_db_context  # noqa: E402

DEMO_PASSWORD = os.getenv("DEMO_SEED_PASSWORD", "demo1234")

ROLE_DEMO_USERNAME = {
    "admin": "demo_admin",
    "doctor": "demo_doctor",
    "nurse": "demo_nurse",
    "patient": "demo_patient",
}


def _exists(db, username: str) -> models.User | None:
    return db.query(models.User).filter(models.User.username == username).first()


def _ensure_user(db, role: str, full_name: str, specialization: str | None = None):
    username = ROLE_DEMO_USERNAME.get(role, f"demo_{role}")
    existing = _exists(db, username)
    if existing:
        print(f"  • user exists: {username} ({role})")
        return existing
    user = models.User(
        username=username,
        hashed_password=auth.get_password_hash(DEMO_PASSWORD),
        email=f"{username}@synthetic.demo.local",
        role=role,
        full_name=full_name,
        allow_data_collection=0,
        about_me="SYNTHETIC DEMO DATA — not a real person. For testing only.",
        specialization=specialization,
    )
    db.add(user)
    db.flush()
    print(f"  • created user: {username} ({role}) id={user.id}")
    return user


def _add_labs(db, pid, did, now, month_ago, abnormal_flags: dict[str, int]):
    """Add diagnostic results. Idempotent: only creates missing result types."""
    for result_type, abnormal_flag in abnormal_flags.items():
        existing = db.query(models.DiagnosticResult).filter(
            models.DiagnosticResult.patient_id == pid,
            models.DiagnosticResult.result_type == result_type,
        ).first()
        if not existing:
            db.add(models.DiagnosticResult(
                patient_id=pid, doctor_id=did, result_type=result_type,
                title=result_type,
                summary=result_type,
                abnormal_flag=abnormal_flag, review_status="pending_review", created_at=month_ago,
            ))
    print(f"  • diagnostic labs created ({sum(1 for _ in abnormal_flags)} result types)")


def _add_health_records(db, pid, did, now, month_ago, hbA1c=None, ldl=None, sbp=None):
    """Add health records for report comparison / risk."""
    hbA1c_val = hbA1c or 8.2
    glucose_val = hbA1c_val * 28 + 40
    ldl_val = ldl or 150
    sbp_val = sbp or 130
    db.add(models.HealthRecord(
        user_id=pid, record_type="diabetes",
        data=json.dumps({"hbA1c": hbA1c_val, "glucose": glucose_val}),
        prediction="Synthetic screening record",
        timestamp=month_ago,
    ))
    db.add(models.HealthRecord(
        user_id=pid, record_type="heart",
        data=json.dumps({"systolic_bp": sbp_val, "ldl": ldl_val}),
        prediction="Synthetic screening record",
        timestamp=month_ago,
    ))
    print("  • health records created")


def _add_vitals(db, pid, did, now, month_ago, hr=82, sbp=135, dbp=85, spo2=97, temp=36.8):
    """Add vital observations. Idempotent: only creates if no vitals exist for this patient."""
    existing = db.query(models.VitalObservation).filter(
        models.VitalObservation.patient_id == pid,
    ).first()
    if not existing:
        db.add(models.VitalObservation(
            patient_id=pid, recorded_by_id=did, source="manual",
            heart_rate=hr, systolic_bp=sbp, diastolic_bp=dbp, spo2=spo2,
            temperature_c=temp, observed_at=month_ago,
        ))
        print("  • vitals created")


def _add_prescription(db, pid, did, meds: list[dict]):
    """Add prescription with medications."""
    if db.query(models.Prescription).filter(models.Prescription.patient_id == pid).count() == 0:
        rx = models.Prescription(
            patient_id=pid, doctor_id=did,
            diagnosis_context="Synthetic clinical case", status="active",
        )
        rx.items = [
            models.PrescriptionItem(
                medication_name=m["name"], dosage=m["dosage"], frequency=m["frequency"],
                quantity_prescribed=m.get("quantity", 30), status=m.get("status", "pending"),
            )
            for m in meds
        ]
        db.add(rx)
        print(f"  • prescription created ({len(meds)} items)")


def _add_appointment(db, pid, did, now, date_offset_days=7):
    """Add appointment."""
    if db.query(models.Appointment).filter(models.Appointment.user_id == pid).count() == 0:
        db.add(models.Appointment(
            user_id=pid, doctor_id=did, specialist="General Medicine",
            reason="Follow-up synthetic review (synthetic)",
            status="Scheduled", date_time=now + timedelta(days=date_offset_days),
        ))
        print("  • appointment created")


def _add_timeline_event(db, pid, did, now, month_ago, event_type="diagnosis", subtype="condition",
                        title="Synthetic condition", risk_level="medium", requires_review=False,
                        metadata=None, date=None):
    """Add timeline event."""
    if db.query(models.PatientTimelineEvent).filter(
        models.PatientTimelineEvent.user_id == pid,
        models.PatientTimelineEvent.event_type == event_type,
    ).count() == 0:
        db.add(models.PatientTimelineEvent(
            user_id=pid, event_type=event_type, subtype=subtype,
            title=title,
            description="Recorded from synthetic demo seed.",
            date_time=date if date else month_ago,
            risk_level=risk_level, requires_review=requires_review,
            event_metadata=metadata or {"synthetic": True},
        ))
        print(f"  • timeline event created: {title}")


def _add_care_gap(db, pid, did, gap_type, title, severity="medium"):
    """Add a care gap if not already present."""
    existing = db.query(models.CareGap).filter(
        models.CareGap.patient_id == pid,
        models.CareGap.gap_type == gap_type,
        models.CareGap.status.in_(["detected", "in_review"]),
    ).first()
    if not existing:
        db.add(models.CareGap(
            user_id=pid, gap_type=gap_type, patient_id=pid,
            detected_by=did, status="detected", title=title, severity=severity,
        ))
        print(f"  • care gap created: {title}")


def _add_risk_assessment(db, pid, risk_category, risk_level, score, contributing_factors=None):
    """Add a risk assessment if not already present."""
    existing = db.query(models.RiskAssessment).filter(
        models.RiskAssessment.user_id == pid,
        models.RiskAssessment.risk_category == risk_category,
    ).first()
    if not existing:
        db.add(models.RiskAssessment(
            user_id=pid, risk_category=risk_category, risk_level=risk_level,
            score=score, confidence=0.7,
            contributing_factors=contributing_factors or json.dumps([]),
            recommended_review_level="routine",
        ))
        print(f"  • risk assessment created: {risk_category} {risk_level}")


def _add_clinical_review(db, pid, did, priority="medium", ai_summary="Synthetic AI finding", ai_evidence="Synthetic evidence"):
    """Add a pending clinical review if not already present."""
    existing = db.query(models.ClinicalReview).filter(
        models.ClinicalReview.patient_id == pid,
        models.ClinicalReview.status == "pending",
    ).first()
    if not existing:
        db.add(models.ClinicalReview(
            user_id=did, patient_id=pid, ai_summary=ai_summary,
            ai_evidence=ai_evidence, ai_risk_level="medium",
            ai_confidence=0.65, priority=priority, status="pending",
        ))
        print(f"  • clinical review created: {priority}")


def _add_agent_run(db, pid, did, agent_type="risk"):
    """Add an agent run if not already present."""
    existing = db.query(models.AgentRun).filter(
        models.AgentRun.patient_id == pid,
        models.AgentRun.agent_type == agent_type,
    ).first()
    if not existing:
        db.add(models.AgentRun(
            user_id=did, agent_type=agent_type, patient_id=pid,
            input_query=f"Synthetic {agent_type} analysis", status="completed",
            started_at=datetime.now(timezone.utc), completed_at=datetime.now(timezone.utc),
        ))
        print(f"  • agent run created: {agent_type}")


def _add_evidence(db, pid, did, evidence_type="lab_result", title="Synthetic Lab Finding"):
    """Add evidence reference if not already present."""
    existing = db.query(models.EvidenceReference).filter(
        models.EvidenceReference.user_id == pid,
        models.EvidenceReference.evidence_type == evidence_type,
    ).first()
    if not existing:
        db.add(models.EvidenceReference(
            user_id=did, evidence_type=evidence_type, title=title,
            source="synthetic_demo", citation="Synthetic Demo Data",
            relevance_score=0.8, confidence=0.7, status="pending",
        ))
        print(f"  • evidence created: {title}")


def add_scenario_A(db, pid, did, now, month_ago):
    """Scenario A: Longitudinal diabetes case with abnormal labs, risk, care gap, review."""
    print("\n  === Scenario A: Longitudinal Diabetes ===")
    _add_labs(db, pid, did, now, month_ago, {
        "HbA1c": 1,
        "Fasting Glucose": 1,
        "LDL Cholesterol": 1,
        "Creatinine": 0,
    })
    _add_health_records(db, pid, did, now, month_ago, hbA1c=8.2, ldl=150, sbp=130)
    _add_vitals(db, pid, did, now, month_ago, hr=82, sbp=135, dbp=85, spo2=97, temp=36.8)
    _add_prescription(db, pid, did, [
        {"name": "Metformin", "dosage": "500 mg", "frequency": "Twice daily", "quantity": 60, "status": "pending"},
    ])
    _add_appointment(db, pid, did, now, 7)
    _add_timeline_event(db, pid, did, now, month_ago, title="Type 2 Diabetes (synthetic)", risk_level="medium")
    _add_risk_assessment(db, pid, "diabetes", "high", 78,
                        "Documented diabetes-related history; abnormal HbA1c 8.2; glucose 140 mg/dL")
    _add_care_gap(db, pid, did, "overdue_followup", "Overdue diabetes follow-up", severity="high")
    _add_clinical_review(db, pid, did, "high",
                        ai_summary="Persistent hyperglycemia requiring intervention",
                        ai_evidence="HbA1c 8.2% above target")
    _add_agent_run(db, pid, did, "risk")
    _add_evidence(db, pid, did, "lab_result", "HbA1c elevation finding")


def add_scenario_B(db, pid, did, now, month_ago):
    """Scenario B: Cardiovascular risk case."""
    print("\n  === Scenario B: Cardiovascular Risk ===")
    _add_labs(db, pid, did, now, month_ago, {
        "LDL Cholesterol": 1,
        "HDL Cholesterol": 0,
        "Total Cholesterol": 1,
        "Triglycerides": 0,
    })
    _add_health_records(db, pid, did, now, month_ago, hbA1c=6.5, ldl=180, sbp=155)
    _add_vitals(db, pid, did, now, month_ago, hr=88, sbp=155, dbp=92, spo2=96, temp=37.0)
    _add_prescription(db, pid, did, [
        {"name": "Lisinopril", "dosage": "10 mg", "frequency": "Once daily", "quantity": 30, "status": "pending"},
        {"name": "Atorvastatin", "dosage": "20 mg", "frequency": "Once daily", "quantity": 30, "status": "pending"},
    ])
    _add_appointment(db, pid, did, now, 14)
    _add_timeline_event(db, pid, did, now, month_ago, title="Elevated Cholesterol (synthetic)", risk_level="high")
    _add_risk_assessment(db, pid, "cardiovascular", "high", 72,
                        "Documented cardiovascular history; LDL 180 mg/dL; total cholesterol 240 mg/dL")
    _add_care_gap(db, pid, did, "medication_review_due", "Medication review due", severity="medium")
    _add_clinical_review(db, pid, did, "medium",
                        ai_summary="Cardiovascular risk assessment pending",
                        ai_evidence="Lipid panel abnormalities")
    _add_agent_run(db, pid, did, "risk")
    _add_evidence(db, pid, did, "lab_result", "Lipid abnormality finding")


def add_scenario_C(db, pid, did, now, month_ago):
    """Scenario C: Kidney/lab trend case."""
    print("\n  === Scenario C: Kidney/Lab Trend ===")
    _add_labs(db, pid, did, now, month_ago, {
        "Creatinine": 1,
        "eGFR": 0,
        "Urine Protein": 1,
        "Potassium": 1,
    })
    _add_health_records(db, pid, did, now, month_ago, hbA1c=5.8, ldl=120, sbp=125)
    _add_vitals(db, pid, did, now, month_ago, hr=76, sbp=125, dbp=78, spo2=98, temp=36.5)
    _add_prescription(db, pid, did, [
        {"name": "Lisinopril", "dosage": "10 mg", "frequency": "Once daily", "quantity": 30, "status": "active"},
    ])
    _add_appointment(db, pid, did, now, 30)
    _add_timeline_event(db, pid, did, now, month_ago, title="Chronic Kidney Monitoring (synthetic)", risk_level="medium")
    _add_risk_assessment(db, pid, "kidney", "medium", 55,
                        "Documented kidney-related history; creatinine elevated; eGFR monitoring required")
    _add_care_gap(db, pid, did, "missing_lab_followup", "Missing kidney function follow-up", severity="medium")
    _add_clinical_review(db, pid, did, "medium",
                        ai_summary="Kidney function trend analysis",
                        ai_evidence="Creatinine trend over 3 months")
    _add_agent_run(db, pid, did, "risk")
    _add_evidence(db, pid, did, "lab_result", "Renal function lab result")


def add_scenario_D(db, pid, did, now, month_ago):
    """Scenario D: Medication safety case."""
    print("\n  === Scenario D: Medication Safety ===")
    _add_labs(db, pid, did, now, month_ago, {
        "HbA1c": 0,
        "Fasting Glucose": 0,
        "Creatinine": 0,
    })
    _add_health_records(db, pid, did, now, month_ago, hbA1c=5.5, ldl=95, sbp=118)
    _add_vitals(db, pid, did, now, month_ago, hr=78, sbp=118, dbp=74, spo2=99, temp=36.4)
    _add_prescription(db, pid, did, [
        {"name": "Metformin", "dosage": "500 mg", "frequency": "Twice daily", "quantity": 60, "status": "pending"},
        {"name": "Lisinopril", "dosage": "10 mg", "frequency": "Once daily", "quantity": 30, "status": "pending"},
        {"name": "Aspirin", "dosage": "81 mg", "frequency": "Once daily", "quantity": 30, "status": "pending"},
    ])
    _add_appointment(db, pid, did, now, 3)
    _add_timeline_event(db, pid, did, now, month_ago, title="Medication reconciliation (synthetic)", risk_level="low")
    _add_risk_assessment(db, pid, "medication", "high", 68,
                        "Multiple medication interactions potential; 3 active prescriptions reviewed")
    _add_care_gap(db, pid, did, "medication_review_due", "Medication safety review", severity="high")
    _add_clinical_review(db, pid, did, "urgent",
                        ai_summary="Medication interaction screening",
                        ai_evidence="3-drug interaction screen: Metformin + Lisinopril + Aspirin")
    _add_agent_run(db, pid, did, "medication_safety")
    _add_evidence(db, pid, did, "medication", "Polypharmacy review")


def add_scenario_E(db, pid, did, now, month_ago):
    """Scenario E: Report comparison / longitudinal change case."""
    print("\n  === Scenario E: Report Comparison / Longitudinal Change ===")
    _add_labs(db, pid, did, now, month_ago, {
        "HbA1c": 0,
        "Fasting Glucose": 0,
    })
    _add_health_records(db, pid, did, now, month_ago,
                        hbA1c=5.3, ldl=90, sbp=120)
    _add_vitals(db, pid, did, now, month_ago, hr=74, sbp=120, dbp=76, spo2=99, temp=36.3)
    _add_prescription(db, pid, did, [
        {"name": "Metformin", "dosage": "500 mg", "frequency": "Twice daily", "quantity": 60, "status": "active"},
    ])
    _add_appointment(db, pid, did, now, 14)
    # Old lab from 3 months ago (normal)
    old_lab_date = (now - timedelta(days=90)).isoformat()[:10]
    _add_timeline_event(db, pid, did, now - timedelta(days=90), now - timedelta(days=90),
                        event_type="lab_result", subtype="baseline",
                        title="Baseline HbA1c Normal (synthetic)", risk_level="low",
                        metadata={"date": old_lab_date, "hbA1c": 5.3})
    # New lab from 1 month ago (abnormal)
    new_lab_date = month_ago.isoformat()[:10]
    _add_timeline_event(db, pid, did, now, month_ago,
                        event_type="lab_result", subtype="follow-up",
                        title="Follow-up HbA1c Elevated (synthetic)", risk_level="high",
                        metadata={"date": new_lab_date, "hbA1c": 8.1})
    _add_risk_assessment(db, pid, "diabetes", "medium", 52,
                        "Longitudinal change: HbA1c increased from 5.3% to 8.1% over 3 months")
    _add_care_gap(db, pid, did, "overdue_followup", "Follow-up diabetes review", severity="medium")
    _add_clinical_review(db, pid, did, "medium",
                        ai_summary="Longitudinal HbA1c trend analysis",
                        ai_evidence="Baseline vs follow-up comparison")
    _add_agent_run(db, pid, did, "risk")
    _add_evidence(db, pid, did, "lab_result", "Longitudinal HbA1c comparison")


def seed():
    with get_db_context() as db:
        models.Base.metadata.create_all(bind=db.get_bind())
        print("Seeding synthetic DEMO users...")
        admin = _ensure_user(db, "admin", "Demo Administrator (Synthetic)")
        doctor = _ensure_user(db, "doctor", "Dr. Demo Clinician (Synthetic)", "General Medicine")
        nurse = _ensure_user(db, "nurse", "Demo Nurse (Synthetic)")
        patient = _ensure_user(
            db,
            "patient",
            "Demo Patient (Synthetic)",
        )
        # Enrich the patient profile (all synthetic).
        patient.allergies = "Penicillin (synthetic marker only)"
        patient.existing_ailments = "Type 2 Diabetes (synthetic)"
        patient.gender = "other"
        patient.blood_type = "O+"
        db.flush()
        pid, did = patient.id, doctor.id
        print(f"Seeding clinical records for patient id={pid}...")

        now = datetime.now(timezone.utc)
        month_ago = now - timedelta(days=30)

        # ── Encounter linking patient <-> doctor (enables clinician access).
        enc = db.query(models.Encounter).filter(
            models.Encounter.patient_id == pid,
            models.Encounter.doctor_id == did,
        ).first()
        if not enc:
            enc = models.Encounter(
                patient_id=pid,
                doctor_id=did,
                encounter_type="OPD",
                reason="Routine diabetes review (synthetic)",
                priority="routine",
                status="closed",
                started_at=month_ago,
            )
            db.add(enc)
            db.flush()
            print("  • encounter created")

        # Add all 5 scenarios for the demo patient
        add_scenario_A(db, pid, did, now, month_ago)
        add_scenario_B(db, pid, did, now, month_ago)
        add_scenario_C(db, pid, did, now, month_ago)
        add_scenario_D(db, pid, did, now, month_ago)
        add_scenario_E(db, pid, did, now, month_ago)

        db.commit()
        print("\nSeed complete.")
        print(f"Login credentials (synthetic): username / password = <role> / {DEMO_PASSWORD}")
        print("  demo_admin, demo_doctor, demo_nurse, demo_patient")


if __name__ == "__main__":
    seed()