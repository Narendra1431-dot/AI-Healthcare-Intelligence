"""Enhanced synthetic DEMO data seed with 12 patients and all 8 clinical scenarios.

Extends the original seed_demo_data.py to include:
- 12 synthetic patients (instead of 1)
- All 8 clinical scenarios (A-H)
- Coherent data relationships across patients
- Proper is_synthetic and data_source markers
- Bed assignments, appointments, care gaps, risk assessments, clinical reviews, agent runs, evidence

Run from the project root::
    python scripts/seed_demo_data_enhanced.py

All data created is clearly labelled ``(Synthetic)`` / ``SYNTHETIC DEMO``
so it can never be mistaken for real patient data. The script is idempotent:
re-running it will not duplicate users or clinical records.
"""

from __future__ import annotations

import os
import sys
import json
from datetime import datetime, timedelta, timezone

# Allow running as `python scripts/seed_demo_data_enhanced.py` from repo root.
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


def _exists(db, username: str):
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


# ── 12 Synthetic Patients ────────────────────────────────────────────────

PATIENTS = [
    # Patient 0: demo_patient - shared base (original seed patient)
    {
        "id": 0,
        "username": "demo_patient",
        "full_name": "Demo Patient (Synthetic)",
        "demographics": {
            "age": 54,
            "gender": "other",
            "blood_type": "O+",
            "allergies": ["Penicillin"],
        },
        "diagnoses": ["Type 2 Diabetes", "Hypertension"],
        "scenarios": ["A", "B", "C", "E"],
    },
    # Patient 1: Diabetes specialist case
    {
        "id": 1,
        "username": "patient_diabetes",
        "full_name": "John Diabetes (Synthetic)",
        "demographics": {
            "age": 62,
            "gender": "male",
            "blood_type": "A+",
            "allergies": [],
        },
        "diagnoses": ["Type 2 Diabetes"],
        "scenarios": ["A"],
    },
    # Patient 2: Cardiovascular case
    {
        "id": 2,
        "username": "patient_cvd",
        "full_name": "Maria Cardiovascular (Synthetic)",
        "demographics": {
            "age": 71,
            "gender": "female",
            "blood_type": "B+",
            "allergies": ["Aspirin"],
        },
        "diagnoses": ["Cardiovascular Disease"],
        "scenarios": ["B"],
    },
    # Patient 3: Kidney/Lab trend case
    {
        "id": 3,
        "username": "patient_kidney",
        "full_name": "Robert Kidney (Synthetic)",
        "demographics": {
            "age": 68,
            "gender": "male",
            "blood_type": "AB+",
            "allergies": ["Iodine"],
        },
        "diagnoses": ["Chronic Kidney Disease"],
        "scenarios": ["C"],
    },
    # Patient 4: Medication safety case
    {
        "id": 4,
        "username": "patient_meds",
        "full_name": "Linda Medication (Synthetic)",
        "demographics": {
            "age": 59,
            "gender": "female",
            "blood_type": "O-",
            "allergies": ["Penicillin"],
        },
        "diagnoses": ["Multiple Conditions"],
        "scenarios": ["D"],
    },
    # Patient 5: Abnormal report comparison
    {
        "id": 5,
        "username": "patient_reports",
        "full_name": "Susan Reports (Synthetic)",
        "demographics": {
            "age": 45,
            "gender": "female",
            "blood_type": "A-",
            "allergies": [],
        },
        "diagnoses": ["Monitoring Required"],
        "scenarios": ["E"],
    },
    # Patient 6: Follow-up gap case
    {
        "id": 6,
        "username": "patient_gap",
        "full_name": "Kevin Follow-up (Synthetic)",
        "demographics": {
            "age": 41,
            "gender": "male",
            "blood_type": "B-",
            "allergies": [],
        },
        "diagnoses": ["Routine Monitoring"],
        "scenarios": ["F"],
    },
    # Patient 7: Appointment workflow case
    {
        "id": 7,
        "username": "patient_appointments",
        "full_name": "Amy Appointments (Synthetic)",
        "demographics": {
            "age": 57,
            "gender": "female",
            "blood_type": "O+",
            "allergies": ["Shellfish"],
        },
        "diagnoses": ["Wellness"],
        "scenarios": ["G"],
    },
    # Patient 8: Hospital bed workflow case
    {
        "id": 8,
        "username": "patient_beds",
        "full_name": "Bed Patient (Synthetic)",
        "demographics": {
            "age": 60,
            "gender": "male",
            "blood_type": "A+",
            "allergies": [],
        },
        "diagnoses": ["Observation"],
        "scenarios": ["H"],
    },
    # Patient 9: Combined diabetes + kidney
    {
        "id": 9,
        "username": "patient_combined1",
        "full_name": "Diabetes Kidney (Synthetic)",
        "demographics": {
            "age": 65,
            "gender": "female",
            "blood_type": "AB+",
            "allergies": ["Metformin"],
        },
        "diagnoses": ["Type 2 Diabetes", "Chronic Kidney Disease"],
        "scenarios": ["A", "C"],
    },
    # Patient 10: Combined cardiovascular + medication
    {
        "id": 10,
        "username": "patient_combined2",
        "full_name": "Cardio Meds (Synthetic)",
        "demographics": {
            "age": 75,
            "gender": "male",
            "blood_type": "B+",
            "allergies": ["Aspirin"],
        },
        "diagnoses": ["Cardiovascular Disease", "Hypertension"],
        "scenarios": ["B", "D"],
    },
    # Patient 11: Full spectrum case
    {
        "id": 11,
        "username": "patient_full",
        "full_name": "Full Spectrum (Synthetic)",
        "demographics": {
            "age": 60,
            "gender": "other",
            "blood_type": "O+",
            "allergies": ["Penicillin"],
        },
        "diagnoses": ["Multiple Conditions"],
        "scenarios": ["A", "B", "C", "D", "E", "F", "G", "H"],
    },
]


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


def _add_vitals(db, pid, did, now, obs_date, hr=82, sbp=135, dbp=85, spo2=97, temp=36.8):
    """Add vital observations. Idempotent: only creates if no vitals exist for this patient/date."""
    # Check for existing vitals with same patient_id and observed_at to avoid unique constraint violation
    existing = db.query(models.VitalObservation).filter(
        models.VitalObservation.patient_id == pid,
        models.VitalObservation.observed_at == obs_date,
    ).first()
    if not existing:
        db.add(models.VitalObservation(
            patient_id=pid, recorded_by_id=did, source="manual",
            heart_rate=hr, systolic_bp=sbp, diastolic_bp=dbp, spo2=spo2,
            temperature_c=temp, observed_at=obs_date,
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


def _add_timeline_event(db, pid, did, now, event_date, event_type="diagnosis", subtype="condition",
                        title="Synthetic condition", risk_level="medium", requires_review=False,
                        metadata=None):
    """Add timeline event."""
    if db.query(models.PatientTimelineEvent).filter(
        models.PatientTimelineEvent.user_id == pid,
        models.PatientTimelineEvent.event_type == event_type,
    ).count() == 0:
        db.add(models.PatientTimelineEvent(
            user_id=pid, event_type=event_type, subtype=subtype,
            title=title,
            description="Recorded from synthetic demo seed.",
            date_time=event_date,
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


# ── Scenario functions ─────────────────────────────────────────────────

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
    # Use unique dates for vitals per scenario
    _add_vitals(db, pid, did, now, month_ago - timedelta(days=3), hr=82, sbp=135, dbp=85, spo2=97, temp=36.8)
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
    _add_vitals(db, pid, did, now, month_ago - timedelta(days=5), hr=88, sbp=155, dbp=92, spo2=96, temp=37.0)
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
    _add_vitals(db, pid, did, now, month_ago - timedelta(days=7), hr=76, sbp=125, dbp=78, spo2=98, temp=36.5)
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
    _add_vitals(db, pid, did, now, month_ago - timedelta(days=2), hr=78, sbp=118, dbp=74, spo2=99, temp=36.4)
    _add_prescription(db, pid, did, [
        {"name": "Metformin", "dosage": "500 mg", "frequency": "Twice daily", "quantity": 60, "status": "pending"},
        {"name": "Lisinopril", "dosage": "10 mg", "frequency": "Once daily", "quantity": 30, "status": "pending"},
        {"name": "Aspirin", "dosage": "81 mg", "frequency": "Once daily", "quantity": 30, "status": "pending"},
    ])
    _add_appointment(db, pid, did, now, 3)
    _add_timeline_event(db, pid, did, now, month_ago - timedelta(days=1), title="Medication reconciliation (synthetic)", risk_level="low")
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
    _add_vitals(db, pid, did, now, month_ago - timedelta(days=4), hr=74, sbp=120, dbp=76, spo2=99, temp=36.3)
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


def add_scenario_F(db, pid, did, now, month_ago):
    """Scenario F: Follow-up gap case."""
    print("\n  === Scenario F: Follow-up Gap ===")
    _add_labs(db, pid, did, now, month_ago, {
        "HbA1c": 0,
        "Fasting Glucose": 0,
    })
    _add_health_records(db, pid, did, now, month_ago, hbA1c=5.6, ldl=110, sbp=128)
    _add_vitals(db, pid, did, now, month_ago - timedelta(days=6), hr=72, sbp=128, dbp=76, spo2=98, temp=36.6)
    _add_prescription(db, pid, did, [
        {"name": "Lisinopril", "dosage": "10 mg", "frequency": "Once daily", "quantity": 30, "status": "active"},
    ])
    _add_appointment(db, pid, did, now, 30)
    # Mark a completed encounter with follow-up due
    _add_timeline_event(db, pid, did, now - timedelta(days=200), now - timedelta(days=200),
                        event_type="visit", subtype="follow-up",
                        title="Routine follow-up completed (synthetic)", risk_level="low",
                        metadata={"followup_due": "2026-02-01"})
    _add_risk_assessment(db, pid, "diabetes", "medium", 45,
                        "Post-encounter monitoring; follow-up overdue")
    _add_care_gap(db, pid, did, "overdue_followup", "Required follow-up missing", severity="high")
    _add_clinical_review(db, pid, did, "medium",
                        ai_summary="Follow-up gap assessment",
                        ai_evidence="Encounter completed 200 days ago; no follow-up scheduled")
    _add_agent_run(db, pid, did, "risk")
    _add_evidence(db, pid, did, "lab_result", "Post-visit lab follow-up required")


def add_scenario_G(db, pid, did, now, month_ago):
    """Scenario G: Appointment workflow case."""
    print("\n  === Scenario G: Appointment Workflow ===")
    _add_labs(db, pid, did, now, month_ago, {
        "HbA1c": 0,
        "Fasting Glucose": 0,
    })
    _add_health_records(db, pid, did, now, month_ago, hbA1c=5.7, ldl=105, sbp=126)
    _add_vitals(db, pid, did, now, month_ago - timedelta(days=8), hr=70, sbp=126, dbp=74, spo2=98, temp=36.5)
    _add_prescription(db, pid, did, [
        {"name": "Metformin", "dosage": "500 mg", "frequency": "Twice daily", "quantity": 60, "status": "active"},
    ])
    # Scheduled appointment
    _add_appointment(db, pid, did, now, 14)
    _add_timeline_event(db, pid, did, now, month_ago, title="Scheduled follow-up appointment (synthetic)", risk_level="low")
    _add_risk_assessment(db, pid, "diabetes", "low", 35,
                        "Well-controlled diabetes; routine monitoring sufficient")
    _add_clinical_review(db, pid, did, "low",
                        ai_summary="Routine diabetes follow-up",
                        ai_evidence="Stable HbA1c 5.7%")
    _add_agent_run(db, pid, did, "risk")
    _add_evidence(db, pid, did, "lab_result", "Routine lab monitoring")


def add_scenario_H(db, pid, did, now, month_ago):
    """Scenario H: Hospital bed workflow case."""
    print("\n  === Scenario H: Hospital Bed Workflow ===")
    _add_labs(db, pid, did, now, month_ago, {
        "HbA1c": 0,
        "Fasting Glucose": 0,
    })
    _add_health_records(db, pid, did, now, month_ago, hbA1c=6.0, ldl=115, sbp=122)
    _add_vitals(db, pid, did, now, month_ago - timedelta(days=9), hr=72, sbp=122, dbp=74, spo2=98, temp=36.6)
    _add_prescription(db, pid, did, [
        {"name": "Lisinopril", "dosage": "10 mg", "frequency": "Once daily", "quantity": 30, "status": "active"},
    ])
    # Add bed assignment related timeline and encounters
    _add_timeline_event(db, pid, did, now, month_ago - timedelta(days=3), event_type="admission", subtype="bed_placement",
                        title="Hospital admission for observation (synthetic)", risk_level="low",
                        metadata={"ward": "Cardiac Care Unit", "bed_assigned": "CAR-01"})
    _add_risk_assessment(db, pid, "cardiovascular", "medium", 50,
                        "Admitted for observation; cardiac monitoring indicated")
    _add_clinical_review(db, pid, did, "low",
                        ai_summary="Bed assignment and admission review",
                        ai_evidence="Patient admitted to CCU for observation")
    _add_agent_run(db, pid, did, "risk")