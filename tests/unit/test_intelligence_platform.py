"""
Tests for the AI Healthcare Intelligence Platform.

Covers:
- Patient context building
- Longitudinal change detection
- Cross-report comparison
- Risk engine
- Agent collaboration / debate
- Safety layer
- Care gap detection
- Intelligence engine integration
"""
import os

os.environ.setdefault("SECRET_KEY", "test_secret_key_for_dev_1234567890")
os.environ.setdefault("TESTING", "true")

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models
from backend.database import Base
from backend.intelligence_engine import (
    AgentCollaboration,
    AgentOpinion,
    CareGapEngine,
    ChangeDetectionEngine,
    PatientContextBuilder,
    RiskEngine,
    SafetyLayer,
)


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def _make_user(db, username="patient1", role="patient", allergies="Penicillin", ailments="Type 2 Diabetes"):
    user = models.User(
        username=username,
        hashed_password="x",
        role=role,
        full_name=username,
        allergies=allergies,
        existing_ailments=ailments,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _add_timeline(db, user_id, key, value, days_ago, event_type="lab_result"):
    ev = models.PatientTimelineEvent(
        user_id=user_id,
        event_type=event_type,
        title=f"{key}={value}",
        date_time=datetime.now(timezone.utc).replace(microsecond=0),
        event_metadata={key: value},
    )
    ev.date_time = ev.date_time.fromordinal(ev.date_time.toordinal() - days_ago)
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


def test_patient_context_builds_with_demographics(db):
    u = _make_user(db)
    ctx = PatientContextBuilder.build(db, u.id)
    assert ctx.patient_id == u.id
    assert "diabetes" in " ".join(ctx.conditions).lower()


def test_change_detection_detects_worsening_hba1c(db):
    u = _make_user(db)
    _add_timeline(db, u.id, "hbA1c", 6.7, days_ago=120)
    _add_timeline(db, u.id, "hbA1c", 8.4, days_ago=10)
    result = ChangeDetectionEngine.detect(db, u.id)
    hba1c = next((c for c in result.changes if c.key == "hbA1c"), None)
    assert hba1c is not None
    assert hba1c.direction == "worsening"
    assert hba1c.abnormal_now is True
    assert hba1c.delta == 1.7


def test_change_detection_marks_new_abnormal(db):
    u = _make_user(db)
    _add_timeline(db, u.id, "spo2", 88.0, days_ago=5)
    result = ChangeDetectionEngine.detect(db, u.id)
    spo2 = next((c for c in result.changes if c.key == "spo2"), None)
    assert spo2 is not None
    assert spo2.direction == "new"
    assert spo2.abnormal_now is True


def test_report_comparison_engine_detects_changes(db):
    u = _make_user(db)
    ra = models.HealthRecord(user_id=u.id, record_type="diabetes", data={"hbA1c": 6.7, "glucose": 110})
    rb = models.HealthRecord(user_id=u.id, record_type="diabetes", data={"hbA1c": 8.4, "glucose": 140})
    db.add_all([ra, rb])
    db.commit()
    result = ReportComparisonEngine.compare(db, u.id, ra.id, rb.id)
    assert result["requires_clinician_attention"] is True
    assert len(result["what_changed"]["items"]) >= 1
    assert result["risk_trend"] in ("worsening", "stable", "improving")


def test_risk_engine_flags_diabetes_history(db):
    u = _make_user(db, ailments="Type 2 Diabetes Mellitus")
    risk = RiskEngine.assess(db, u.id)
    cats = [r["risk_category"] for r in risk["risks"]]
    assert "diabetes" in cats
    assert risk["overall_risk_level"] in ("low", "medium", "high")


def test_risk_engine_low_for_healthy(db):
    u = _make_user(db, ailments="", allergies="")
    risk = RiskEngine.assess(db, u.id)
    assert risk["overall_risk_level"] == "low"


def test_safety_layer_escalates_emergency(db):
    u = _make_user(db)
    ctx = PatientContextBuilder.build(db, u.id)
    res = SafetyLayer.evaluate("I have chest pain and cannot breathe", ctx)
    assert res["level"] == "critical"
    assert res["requires_escalation"] is True
    assert len(res["emergency_triggers"]) > 0


def test_safety_layer_detects_allergy_contradiction(db):
    u = _make_user(db, allergies="Penicillin", ailments="")
    ctx = PatientContextBuilder.build(db, u.id)
    ctx.medications = ["Amoxicillin (Penicillin)"]
    res = SafetyLayer.evaluate("What should I take?", ctx)
    assert res["level"] == "high"
    assert any("Penicillin" in c for c in res["contradictions"])


def test_agent_debate_returns_opinions(db):
    u = _make_user(db, ailments="Type 2 Diabetes")
    result = AgentCollaboration.debate(db, u.id, "Why is my HbA1c rising?")
    assert len(result["opinions"]) >= 1
    assert all("interpretation" in o for o in result["opinions"])
    assert "supervisor_summary" in result
    # Verify opinions are AgentOpinion-shaped dicts
    opinions = [AgentOpinion(**o) for o in result["opinions"]]
    assert all(0.0 <= o.confidence <= 1.0 for o in opinions)


def test_care_gap_overdue_followup(db):
    u = _make_user(db)
    old = datetime.now(timezone.utc).replace(microsecond=0)
    old = old.fromordinal(old.toordinal() - 200)
    enc = models.Encounter(patient_id=u.id, doctor_id=1, encounter_type="OPD", status="closed", started_at=old)
    db.add(enc)
    db.commit()
    gaps = CareGapEngine.detect(db, u.id)
    assert any(g["gap_type"] == "overdue_followup" for g in gaps)


def test_intelligence_profile_aggregation(db):
    u = _make_user(db, ailments="Type 2 Diabetes")
    _add_timeline(db, u.id, "hbA1c", 6.7, days_ago=120)
    _add_timeline(db, u.id, "hbA1c", 8.4, days_ago=10)
    from backend.intelligence_engine import build_intelligence_profile
    profile = build_intelligence_profile(db, u.id)
    assert profile["patient_id"] == u.id
    assert "current_conditions" in profile
    assert len(profile["long_term_trends"]) >= 1
