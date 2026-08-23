"""Tests for the AI Healthcare Intelligence Platform engines and APIs.

These tests exercise the deterministic, provider-free cores of the platform:
patient context, longitudinal change detection, cross-report comparison,
risk engine, medication safety, safety escalation, agent collaboration,
care-gap detection, and their REST endpoints. No external LLM/embedding calls
are made.
"""
import json
from datetime import datetime, timedelta, timezone

import pytest

from backend import auth, models
from backend.intelligence_engine import (
    AgentCollaboration,
    CareGapEngine,
    ChangeDetectionEngine,
    MedicationSafetyEngine,
    PatientContextBuilder,
    ReportComparisonEngine,
    RiskEngine,
    SafetyLayer,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(db, username, role="doctor", allergies=None, ailments=None):
    u = models.User(
        username=username,
        hashed_password=auth.get_password_hash("password123"),
        role=role,
    )
    if allergies is not None:
        u.allergies = allergies
    if ailments is not None:
        u.existing_ailments = ailments
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _headers(username):
    token = auth.create_access_token({"sub": username})
    return {"Authorization": f"Bearer {token}"}


def _seed_prescriptions(db, patient_id, meds, missing_fields=None):
    rx = models.Prescription(patient_id=patient_id, status="active")
    db.add(rx)
    db.commit()
    db.refresh(rx)
    missing_fields = missing_fields or {}
    for name in meds:
        item = models.PrescriptionItem(
            prescription_id=rx.id,
            medication_name=name,
            dosage=missing_fields.get(name, {}).get("dosage", "10mg"),
            frequency=missing_fields.get(name, {}).get("frequency", "daily"),
            status=missing_fields.get(name, {}).get("status", "pending"),
        )
        db.add(item)
    db.commit()
    return rx


# ---------------------------------------------------------------------------
# Patient Context
# ---------------------------------------------------------------------------

def test_patient_context_populates_medications(db_session):
    patient = _make_user(db_session, "ctx_pt", role="patient")
    _seed_prescriptions(db_session, patient.id, ["atorvastatin", "metformin"])

    ctx = PatientContextBuilder.build(db_session, patient.id)
    assert "atorvastatin" in ctx.medications
    assert "metformin" in ctx.medications
    # De-duplication preserves content
    assert len(ctx.medications) == 2


# ---------------------------------------------------------------------------
# Medication Safety Engine (pure screening)
# ---------------------------------------------------------------------------

def test_medication_safety_detects_interactions():
    res = MedicationSafetyEngine.screen(["warfarin", "ibuprofen", "aspirin"], [])
    assert len(res["interactions"]) >= 1
    assert res["overall_level"] == "high"
    assert res["requires_clinician_review"] is True
    # Every interaction must carry a verification note (no autonomous prescribing)
    assert all("verification" in i for i in res["interactions"])
    assert all(i["severity"] in ("low", "medium", "high") for i in res["interactions"])


def test_medication_safety_detects_duplicate_therapy():
    res = MedicationSafetyEngine.screen(["atorvastatin", "rosuvastatin"], [])
    assert any(d["drug_class"] == "statin" for d in res["duplicate_therapies"])


def test_medication_safety_detects_allergy_contraindication():
    res = MedicationSafetyEngine.screen(["amoxicillin"], ["penicillin"])
    assert len(res["contraindications"]) >= 1
    assert res["contraindications"][0]["severity"] == "high"


def test_medication_safety_no_false_positive_for_unrelated():
    res = MedicationSafetyEngine.screen(["metformin", "lisinopril"], [])
    assert res["overall_level"] == "low"
    assert res["requires_clinician_review"] is False


def test_medication_safety_dosage_concern_via_analyze(db_session):
    patient = _make_user(db_session, "dose_pt", role="patient")
    _seed_prescriptions(
        db_session, patient.id, ["metformin"],
        missing_fields={"metformin": {"dosage": "", "frequency": "daily"}},
    )
    result = MedicationSafetyEngine.analyze(db_session, patient.id)
    assert any(d["medication"] == "metformin" for d in result.dosage_concerns)


# ---------------------------------------------------------------------------
# Risk Engine
# ---------------------------------------------------------------------------

def test_risk_engine_includes_medication_category(db_session):
    patient = _make_user(db_session, "risk_pt", role="patient")
    _seed_prescriptions(db_session, patient.id, ["warfarin", "ibuprofen"])
    risk = RiskEngine.assess(db_session, patient.id)
    med = next((r for r in risk["risks"] if r["risk_category"] == "medication"), None)
    assert med is not None
    assert med["risk_level"] == "high"
    assert "interaction" in " ".join(med["contributing_factors"]).lower()


# ---------------------------------------------------------------------------
# Care Gap Engine
# ---------------------------------------------------------------------------

def test_care_gap_covers_all_requested_types(db_session):
    patient = _make_user(db_session, "gap_pt", role="patient")
    now = datetime.now(timezone.utc)

    # Old encounter -> overdue_followup
    enc = models.Encounter(patient_id=patient.id, started_at=now - timedelta(days=200))
    db_session.add(enc)

    # Abnormal, unreviewed lab -> unresolved_abnormal_report + missing_lab_followup
    lab = models.DiagnosticResult(
        patient_id=patient.id,
        result_type="HbA1c",
        abnormal_flag="H",
        review_status="pending",
    )
    db_session.add(lab)

    # Pending prescription item -> incomplete_workflow
    _seed_prescriptions(db_session, patient.id, ["metformin"])

    db_session.commit()

    gaps = CareGapEngine.detect(db_session, patient.id)
    types = {g["gap_type"] for g in gaps}
    assert "overdue_followup" in types
    assert "unresolved_abnormal_report" in types
    assert "missing_lab_followup" in types
    assert "incomplete_workflow" in types


def test_care_gap_appointment_gap(db_session):
    patient = _make_user(db_session, "gap_appt", role="patient")
    now = datetime.now(timezone.utc)
    appt = models.Appointment(
        user_id=patient.id, date_time=now - timedelta(days=400), status="Completed"
    )
    db_session.add(appt)
    db_session.commit()
    gaps = CareGapEngine.detect(db_session, patient.id)
    assert any(g["gap_type"] == "appointment_gap" for g in gaps)


# ---------------------------------------------------------------------------
# Longitudinal Change Detection
# ---------------------------------------------------------------------------

def test_change_detection_flags_worsening_hba1c(db_session):
    patient = _make_user(db_session, "cd_pt", role="patient")
    base = datetime.now(timezone.utc)
    e1 = models.PatientTimelineEvent(
        user_id=patient.id, event_type="lab_result", title="HbA1c",
        date_time=base - timedelta(days=30),
        event_metadata={"hbA1c": 7.0},
    )
    e2 = models.PatientTimelineEvent(
        user_id=patient.id, event_type="lab_result", title="HbA1c",
        date_time=base,
        event_metadata={"hbA1c": 8.4},
    )
    db_session.add_all([e1, e2])
    db_session.commit()

    result = ChangeDetectionEngine.detect(db_session, patient.id)
    hba1c = next((c for c in result.changes if c.key == "hbA1c"), None)
    assert hba1c is not None
    assert hba1c.direction == "worsening"
    assert hba1c.abnormal_now is True
    assert hba1c.abnormal_previous is True


# ---------------------------------------------------------------------------
# Cross-Report Comparison
# ---------------------------------------------------------------------------

def test_report_comparison_categorizes(db_session):
    patient = _make_user(db_session, "rc_pt", role="patient")
    ra = models.HealthRecord(
        user_id=patient.id, record_type="diabetes",
        data=json.dumps({"hbA1c": 6.7, "ldl": 130}),
    )
    rb = models.HealthRecord(
        user_id=patient.id, record_type="diabetes",
        data=json.dumps({"hbA1c": 8.4, "ldl": 95}),
    )
    db_session.add_all([ra, rb])
    db_session.commit()
    db_session.refresh(ra)
    db_session.refresh(rb)

    result = ReportComparisonEngine.compare(db_session, patient.id, ra.id, rb.id)
    assert result["what_changed"]["items"]
    assert result["what_worsened"]["items"]  # hbA1c worsened
    assert result["what_improved"]["items"]  # ldl improved
    assert result["requires_clinician_attention"] is True


# ---------------------------------------------------------------------------
# Safety Layer
# ---------------------------------------------------------------------------

def test_safety_escalation_emergency():
    res = SafetyLayer.evaluate("I have chest pain and can't breathe")
    assert res["level"] == "critical"
    assert res["requires_escalation"] is True
    assert res["emergency_triggers"]


def test_safety_no_false_escalation():
    res = SafetyLayer.evaluate("What does an HbA1c of 6.7 mean?")
    assert res["level"] == "low"
    assert res["requires_escalation"] is False


# ---------------------------------------------------------------------------
# Agent Collaboration
# ---------------------------------------------------------------------------

def test_agent_collaboration_structure(db_session):
    patient = _make_user(db_session, "collab_pt", role="patient")
    result = AgentCollaboration.debate(db_session, patient.id, "Why is my HbA1c high?")
    assert "opinions" in result
    assert len(result["opinions"]) >= 1
    for op in result["opinions"]:
        assert "specialist" in op
        assert "interpretation" in op
        assert "confidence" in op
        assert "evidence" in op
        assert "concerns" in op
    assert isinstance(result["requires_clinician_review"], bool)
    assert "supervisor_summary" in result


# ---------------------------------------------------------------------------
# API Tests
# ---------------------------------------------------------------------------

def test_api_medication_safety_endpoint(client, db_session):
    patient = _make_user(db_session, "api_med_pt", role="patient")
    _seed_prescriptions(db_session, patient.id, ["warfarin", "ibuprofen"])
    doc = _make_user(db_session, "api_med_doc", role="doctor")

    resp = client.get(
        f"/v1/intelligence/medication-safety/{patient.id}",
        headers=_headers("api_med_doc"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["overall_level"] in ("medium", "high")
    assert len(body["interactions"]) >= 1
    assert body["requires_clinician_review"] is True


def test_api_patient_cannot_access_other_patient(client, db_session):
    a = _make_user(db_session, "api_pa", role="patient")
    b = _make_user(db_session, "api_pb", role="patient")
    resp = client.get(
        f"/v1/intelligence/medication-safety/{b.id}",
        headers=_headers("api_pa"),
    )
    assert resp.status_code == 403


def test_api_timeline_changes_endpoint(client, db_session):
    patient = _make_user(db_session, "api_cd", role="patient")
    base = datetime.now(timezone.utc)
    db_session.add_all([
        models.PatientTimelineEvent(
            user_id=patient.id, event_type="lab_result", title="HbA1c",
            date_time=base - timedelta(days=30), event_metadata={"hbA1c": 6.7},
        ),
        models.PatientTimelineEvent(
            user_id=patient.id, event_type="lab_result", title="HbA1c",
            date_time=base, event_metadata={"hbA1c": 8.4},
        ),
    ])
    db_session.commit()

    resp = client.get(
        f"/v1/intelligence/timeline/{patient.id}/changes",
        headers=_headers("api_cd"),
    )
    assert resp.status_code == 200
    assert any(c["key"] == "hbA1c" and c["direction"] == "worsening" for c in resp.json()["changes"])


def test_api_safety_evaluate_endpoint(client, db_session):
    doc = _make_user(db_session, "api_safety", role="doctor")
    resp = client.post(
        "/v1/intelligence/safety/evaluate",
        json={"query": "severe bleeding and I can't breathe", "patient_id": None},
        headers=_headers("api_safety"),
    )
    assert resp.status_code == 200
    assert resp.json()["level"] == "critical"


def test_api_care_gaps_endpoint(client, db_session):
    patient = _make_user(db_session, "api_gap", role="patient")
    now = datetime.now(timezone.utc)
    db_session.add(models.DiagnosticResult(
        patient_id=patient.id, result_type="HbA1c",
        abnormal_flag="H", review_status="pending",
    ))
    db_session.add(models.Encounter(patient_id=patient.id, started_at=now - timedelta(days=200)))
    db_session.commit()

    resp = client.get(
        f"/v1/intelligence/care-gaps/{patient.id}",
        headers=_headers("api_gap"),
    )
    assert resp.status_code == 200
    types = {g["gap_type"] for g in resp.json()}
    assert "unresolved_abnormal_report" in types
    assert "overdue_followup" in types


# ---------------------------------------------------------------------------
# Patient Dashboard (aggregated endpoint)
# ---------------------------------------------------------------------------

def _seed_patient_dashboard_data(db_session, patient):
    """Seed a full set of patient-scoped data for dashboard tests."""
    now = datetime.now(timezone.utc)

    # Appointment
    db_session.add(models.Appointment(
        user_id=patient.id,
        specialist="Dr. Smith",
        date_time=now + timedelta(days=3),
        reason="Routine checkup",
        status="Scheduled",
    ))

    # Prescription with item
    rx = models.Prescription(patient_id=patient.id, status="active")
    db_session.add(rx)
    db_session.commit()
    db_session.refresh(rx)
    db_session.add(models.PrescriptionItem(
        prescription_id=rx.id,
        medication_name="Metformin",
        dosage="500mg",
        frequency="daily",
        duration="30 days",
        instructions="Take with food",
    ))

    # Report
    db_session.add(models.ReportAnalysis(
        patient_id=patient.id,
        file_name="blood_work.pdf",
        status="completed",
        source="upload",
        requires_clinician_review=False,
    ))

    # Care gap
    db_session.add(models.CareGap(
        user_id=patient.id,
        patient_id=patient.id,
        gap_type="overdue_followup",
        status="detected",
        title="Overdue annual physical",
        severity="medium",
        description="Annual physical overdue by 30 days",
    ))

    # Risk assessment
    db_session.add(models.RiskAssessment(
        user_id=patient.id,
        risk_category="diabetes",
        risk_level="medium",
        score=65.0,
        assessed_at=now,
    ))

    # Timeline events
    db_session.add(models.PatientTimelineEvent(
        user_id=patient.id,
        event_type="lab_result",
        title="HbA1c Lab",
        description="Blood sugar panel",
        date_time=now - timedelta(days=5),
    ))
    db_session.add(models.PatientTimelineEvent(
        user_id=patient.id,
        event_type="visit",
        title="Clinic Visit",
        description="Routine consultation",
        date_time=now - timedelta(days=10),
    ))

    db_session.commit()


def test_api_patient_dashboard_authenticated_patient(client, db_session):
    patient = _make_user(db_session, "dash_pt", role="patient")
    _seed_patient_dashboard_data(db_session, patient)

    resp = client.get(
        "/v1/intelligence/patient-dashboard",
        headers=_headers("dash_pt"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["patient_id"] == patient.id
    assert "generated_at" in body
    # Profile contains AI summary and patient conditions
    assert "profile" in body
    assert "risk_overview" in body
    assert "care_gaps" in body
    assert "timeline" in body


def test_api_patient_dashboard_patient_isolation(client, db_session):
    """Patient A must not see Patient B's data — the endpoint returns 403
    when a patient_id query param does not match the authenticated user."""
    patient_a = _make_user(db_session, "dash_iso_a", role="patient")
    patient_b = _make_user(db_session, "dash_iso_b", role="patient")
    _seed_patient_dashboard_data(db_session, patient_b)

    # Patient A tries to read a different patient's dashboard via query param
    resp = client.get(
        f"/v1/intelligence/patient-dashboard?patient_id={patient_b.id}",
        headers=_headers("dash_iso_a"),
    )
    assert resp.status_code == 403


def test_api_patient_dashboard_unauthorized_no_token(client, db_session):
    resp = client.get("/v1/intelligence/patient-dashboard")
    assert resp.status_code == 401


def test_api_patient_dashboard_correct_appointments(client, db_session):
    patient = _make_user(db_session, "dash_appt", role="patient")
    _seed_patient_dashboard_data(db_session, patient)

    resp = client.get(
        "/v1/intelligence/patient-dashboard",
        headers=_headers("dash_appt"),
    )
    assert resp.status_code == 200
    appts = resp.json()["appointments"]
    assert len(appts) == 1
    assert appts[0]["specialist"] == "Dr. Smith"
    assert appts[0]["status"] == "Scheduled"
    assert appts[0]["user_id"] == patient.id


def test_api_patient_dashboard_correct_reports(client, db_session):
    patient = _make_user(db_session, "dash_rpt", role="patient")
    _seed_patient_dashboard_data(db_session, patient)

    resp = client.get(
        "/v1/intelligence/patient-dashboard",
        headers=_headers("dash_rpt"),
    )
    assert resp.status_code == 200
    reports = resp.json()["reports"]
    assert len(reports) == 1
    assert reports[0]["file_name"] == "blood_work.pdf"
    assert reports[0]["status"] == "completed"


def test_api_patient_dashboard_correct_medications(client, db_session):
    patient = _make_user(db_session, "dash_med", role="patient")
    _seed_patient_dashboard_data(db_session, patient)

    resp = client.get(
        "/v1/intelligence/patient-dashboard",
        headers=_headers("dash_med"),
    )
    assert resp.status_code == 200
    prescriptions = resp.json()["prescriptions"]
    assert len(prescriptions) == 1
    rx = prescriptions[0]
    assert rx["status"] == "active"
    assert len(rx["items"]) == 1
    assert rx["items"][0]["medication_name"] == "Metformin"
    assert rx["items"][0]["dosage"] == "500mg"


def test_api_patient_dashboard_correct_care_gaps(client, db_session):
    patient = _make_user(db_session, "dash_gap", role="patient")
    _seed_patient_dashboard_data(db_session, patient)

    resp = client.get(
        "/v1/intelligence/patient-dashboard",
        headers=_headers("dash_gap"),
    )
    assert resp.status_code == 200
    gaps = resp.json()["care_gaps"]
    assert len(gaps) >= 1
    gap = next(g for g in gaps if g["title"] == "Overdue annual physical")
    assert gap["status"] == "detected"
    assert gap["severity"] == "medium"


def test_api_patient_dashboard_correct_timeline(client, db_session):
    patient = _make_user(db_session, "dash_tl", role="patient")
    _seed_patient_dashboard_data(db_session, patient)

    resp = client.get(
        "/v1/intelligence/patient-dashboard",
        headers=_headers("dash_tl"),
    )
    assert resp.status_code == 200
    timeline = resp.json()["timeline"]
    titles = {e["title"] for e in timeline}
    assert "HbA1c Lab" in titles
    assert "Clinic Visit" in titles
    for e in timeline:
        assert e["user_id"] == patient.id

