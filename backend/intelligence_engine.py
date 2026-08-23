"""AI Healthcare Intelligence Engine.

This module is the analytical core of the AI Healthcare Intelligence Platform.
It provides deterministic, evidence-aware engines that never fabricate clinical
claims and always returns explicit uncertainty.

Components:
- ``PatientContextBuilder``   — assembles a unified patient view from demographics,
  history, encounters, meds, allergies, labs, imaging, reports, vitals, appointments.
- ``ChangeDetectionEngine``    — longitudinal comparison of tracked values with
  abnormal-range and trend detection.
- ``ReportComparisonEngine``   — cross-report structured comparison.
- ``RiskEngine``               — multi-category risk scoring with confidence/trend.
- ``SafetyLayer``              — escalation rules, uncertainty and contradiction detection.
- ``AgentCollaboration``       — multi-specialist debate with supervisor reconciliation.

All functions are pure / DB-backed and safe to unit test without external providers.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from sqlalchemy import desc
from sqlalchemy.orm import Session

from . import models

# ===========================================================================
# Reference ranges for common lab / vital markers (adult reference ranges).
# These are NON-DIAGNOSTIC screening thresholds used only to FLAG values for
# clinician review. They must never be presented as diagnostic thresholds.
# ===========================================================================
REFERENCE_RANGES: Dict[str, Dict[str, Any]] = {
    "hbA1c": {"min": 4.0, "max": 5.6, "unit": "%", "label": "HbA1c", "high_is_bad": True},
    "glucose": {"min": 70, "max": 100, "unit": "mg/dL", "label": "Fasting Glucose", "high_is_bad": True},
    "systolic_bp": {"min": 90, "max": 120, "unit": "mmHg", "label": "Systolic BP", "high_is_bad": True},
    "diastolic_bp": {"min": 60, "max": 80, "unit": "mmHg", "label": "Diastolic BP", "high_is_bad": True},
    "heart_rate": {"min": 60, "max": 100, "unit": "bpm", "label": "Heart Rate", "high_is_bad": True},
    "spo2": {"min": 95, "max": 100, "unit": "%", "label": "SpO2", "high_is_bad": False},
    "creatinine": {"min": 0.6, "max": 1.3, "unit": "mg/dL", "label": "Creatinine", "high_is_bad": True},
    "egfr": {"min": 90, "max": 200, "unit": "mL/min", "label": "eGFR", "high_is_bad": False},
    "ldl": {"min": 0, "max": 100, "unit": "mg/dL", "label": "LDL Cholesterol", "high_is_bad": True},
    "hdl": {"min": 40, "max": 100, "unit": "mg/dL", "label": "HDL Cholesterol", "high_is_bad": False},
    "total_cholesterol": {"min": 0, "max": 200, "unit": "mg/dL", "label": "Total Cholesterol", "high_is_bad": True},
    "triglycerides": {"min": 0, "max": 150, "unit": "mg/dL", "label": "Triglycerides", "high_is_bad": True},
    "alt": {"min": 7, "max": 56, "unit": "U/L", "label": "ALT", "high_is_bad": True},
    "ast": {"min": 10, "max": 40, "unit": "U/L", "label": "AST", "high_is_bad": True},
    "bun": {"min": 7, "max": 20, "unit": "mg/dL", "label": "BUN", "high_is_bad": True},
    "potassium": {"min": 3.5, "max": 5.1, "unit": "mmol/L", "label": "Potassium", "high_is_bad": True},
    "sodium": {"min": 135, "max": 145, "unit": "mmol/L", "label": "Sodium", "high_is_bad": True},
    "hemoglobin": {"min": 12.0, "max": 17.5, "unit": "g/dL", "label": "Hemoglobin", "high_is_bad": True},
    "wbc": {"min": 4.0, "max": 11.0, "unit": "10^9/L", "label": "WBC", "high_is_bad": True},
    "tsh": {"min": 0.4, "max": 4.0, "unit": "mIU/L", "label": "TSH", "high_is_bad": True},
}

# Synonyms that may appear in uploaded reports / metadata.
SYNONYMS: Dict[str, str] = {
    "a1c": "hbA1c",
    "hba1c": "hbA1c",
    "glucose_fasting": "glucose",
    "fbs": "glucose",
    "sbp": "systolic_bp",
    "dbp": "diastolic_bp",
    "hr": "heart_rate",
    "pulse": "heart_rate",
    "o2": "spo2",
    "oxygen": "spo2",
    "scr": "creatinine",
    "blood_urea_nitrogen": "bun",
    "k": "potassium",
    "na": "sodium",
    "hb": "hemoglobin",
    "hgb": "hemoglobin",
    "wbc_count": "wbc",
}


def _normalize_key(raw: str) -> Optional[str]:
    k = raw.strip().lower().replace(" ", "_").replace("-", "_")
    if k in REFERENCE_RANGES:
        return k
    if k in SYNONYMS:
        return SYNONYMS[k]
    return None


def _is_abnormal(key: str, value: float) -> bool:
    rng = REFERENCE_RANGES.get(key)
    if not rng:
        return False
    return value < rng["min"] or value > rng["max"]


def _flag_is_abnormal(value: Any) -> bool:
    """Type-safe check for an abnormal lab flag stored as int or string."""
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    s = str(value or "").strip().lower()
    return s in ("h", "l", "abnormal", "critical", "1", "true", "yes")


def _to_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = re.sub(r"[^0-9.\-]", "", str(value))
    try:
        return float(s) if s not in ("", "-", ".") else None
    except ValueError:
        return None


# ===========================================================================
# Patient Context
# ===========================================================================


@dataclass
class PatientContext:
    patient_id: int
    demographics: Dict[str, Any] = field(default_factory=dict)
    conditions: List[str] = field(default_factory=list)
    medications: List[str] = field(default_factory=list)
    allergies: List[str] = field(default_factory=list)
    labs: List[Dict[str, Any]] = field(default_factory=list)
    imaging: List[Dict[str, Any]] = field(default_factory=list)
    encounters: List[Dict[str, Any]] = field(default_factory=list)
    appointments: List[Dict[str, Any]] = field(default_factory=list)
    reports: List[Dict[str, Any]] = field(default_factory=list)
    vitals: List[Dict[str, Any]] = field(default_factory=list)
    timeline_events: List[Dict[str, Any]] = field(default_factory=list)
    risk_assessments: List[Dict[str, Any]] = field(default_factory=list)


class PatientContextBuilder:
    """Assembles a complete, privacy-scoped patient context from the database."""

    @staticmethod
    def build(db: Session, patient_id: int) -> PatientContext:
        user = db.query(models.User).filter(models.User.id == patient_id).first()
        ctx = PatientContext(patient_id=patient_id)
        if not user:
            return ctx

        # Demographics — only non-PII-safe summary fields are surfaced here.
        ctx.demographics = {
            "role": getattr(user, "role", None),
            "gender": getattr(user, "gender", None),
            "blood_type": getattr(user, "blood_type", None),
        }
        dob = getattr(user, "dob", None)
        if dob:
            try:
                born = datetime.fromisoformat(str(dob))
                age = (datetime.now(timezone.utc) - born).days // 365
                ctx.demographics["age"] = age
            except (ValueError, TypeError):
                pass

        ctx.conditions = _safe_list(getattr(user, "existing_ailments", None))
        ctx.allergies = _safe_list(getattr(user, "allergies", None))

        # Active medications — derived from prescriptions (items) so downstream
        # medication-safety, pharmacology and risk logic operate on real data.
        try:
            rxs = (
                db.query(models.Prescription)
                .filter(models.Prescription.patient_id == patient_id)
                .all()
            )
            med_names: List[str] = []
            for rx in rxs:
                for item in getattr(rx, "items", []) or []:
                    name = (getattr(item, "medication_name", None) or "").strip()
                    if name:
                        med_names.append(name)
            # de-duplicate while preserving order
            seen = set()
            for m in med_names:
                if m.lower() not in seen:
                    seen.add(m.lower())
                    ctx.medications.append(m)
        except Exception:
            # Defensive: medication population must never break context assembly.
            pass

        # Lab / diagnostic results
        diags = (
            db.query(models.DiagnosticResult)
            .filter(models.DiagnosticResult.patient_id == patient_id)
            .order_by(desc(models.DiagnosticResult.id))
            .limit(50)
            .all()
        )
        ctx.labs = [
            {
                "id": d.id,
                "result_type": d.result_type,
                "abnormal_flag": d.abnormal_flag,
                "review_status": d.review_status,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in diags
        ]

        # Imaging
        studies = (
            db.query(models.DicomStudy)
            .filter(models.DicomStudy.patient_id == patient_id)
            .order_by(desc(models.DicomStudy.id))
            .limit(20)
            .all()
        )
        ctx.imaging = [
            {
                "id": s.id,
                "modality": s.modality,
                "study_uid": s.study_uid,
                "created_at": s.created_at.isoformat() if hasattr(s, "created_at") and s.created_at else None,
            }
            for s in studies
        ]

        # Encounters / admissions
        encs = (
            db.query(models.Encounter)
            .filter(models.Encounter.patient_id == patient_id)
            .order_by(desc(models.Encounter.started_at))
            .limit(20)
            .all()
        )
        ctx.encounters = [
            {
                "id": e.id,
                "encounter_type": e.encounter_type,
                "status": e.status,
                "started_at": e.started_at.isoformat() if e.started_at else None,
            }
            for e in encs
        ]

        # Appointments
        appts = (
            db.query(models.Appointment)
            .filter(models.Appointment.user_id == patient_id)
            .order_by(desc(models.Appointment.date_time))
            .limit(20)
            .all()
        )
        ctx.appointments = [
            {
                "id": a.id,
                "specialist": a.specialist,
                "status": a.status,
                "date_time": a.date_time.isoformat() if a.date_time else None,
            }
            for a in appts
        ]

        # Health records (reports)
        recs = (
            db.query(models.HealthRecord)
            .filter(models.HealthRecord.user_id == patient_id)
            .order_by(desc(models.HealthRecord.id))
            .limit(30)
            .all()
        )
        ctx.reports = [
            {
                "id": r.id,
                "record_type": r.record_type,
                "prediction": r.prediction,
                "created_at": r.timestamp.isoformat() if r.timestamp else None,
            }
            for r in recs
        ]

        # Vitals
        vs = (
            db.query(models.VitalObservation)
            .filter(models.VitalObservation.patient_id == patient_id)
            .order_by(desc(models.VitalObservation.observed_at))
            .limit(30)
            .all()
        )
        ctx.vitals = [
            {
                "id": v.id,
                "heart_rate": v.heart_rate,
                "systolic_bp": v.systolic_bp,
                "diastolic_bp": v.diastolic_bp,
                "spo2": v.spo2,
                "temperature_c": v.temperature_c,
                "observed_at": v.observed_at.isoformat() if v.observed_at else None,
            }
            for v in vs
        ]

        # Timeline events
        evs = (
            db.query(models.PatientTimelineEvent)
            .filter(models.PatientTimelineEvent.user_id == patient_id)
            .order_by(desc(models.PatientTimelineEvent.date_time))
            .limit(100)
            .all()
        )
        ctx.timeline_events = [
            {
                "id": e.id,
                "event_type": e.event_type,
                "title": e.title,
                "subtype": e.subtype,
                "date_time": e.date_time.isoformat() if e.date_time else None,
                "risk_level": e.risk_level,
                "event_metadata": e.event_metadata,
            }
            for e in evs
        ]

        # Risk assessments
        ras = (
            db.query(models.RiskAssessment)
            .filter(models.RiskAssessment.user_id == patient_id)
            .order_by(desc(models.RiskAssessment.assessed_at))
            .limit(30)
            .all()
        )
        ctx.risk_assessments = [
            {
                "id": r.id,
                "risk_category": r.risk_category,
                "risk_level": r.risk_level,
                "score": r.score,
                "assessed_at": r.assessed_at.isoformat() if r.assessed_at else None,
            }
            for r in ras
        ]

        return ctx


def _safe_list(value: Any) -> List[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if v]
    if isinstance(value, str):
        return [p.strip() for p in value.split(",") if p.strip()]
    return []


# ===========================================================================
# Change Detection (Longitudinal)
# ===========================================================================


class ChangeDetectionEngine:
    """Detects value changes over time from timeline events + vitals + labs."""

    @staticmethod
    def detect(db: Session, patient_id: int) -> "ChangeDetectionResponse":
        from .schemas.intelligence_features import (
            ChangeDetectionResponse,
            ValueChange,
        )

        points: Dict[str, List[Dict[str, Any]]] = {}

        # Collect numeric points from timeline event_metadata
        evs = (
            db.query(models.PatientTimelineEvent)
            .filter(models.PatientTimelineEvent.user_id == patient_id)
            .order_by(models.PatientTimelineEvent.date_time.asc())
            .all()
        )
        for e in evs:
            md = e.event_metadata or {}
            for raw_key, val in md.items():
                norm = _normalize_key(raw_key)
                if not norm:
                    continue
                fv = _to_float(val)
                if fv is None:
                    continue
                points.setdefault(norm, []).append(
                    {
                        "date": e.date_time.isoformat() if e.date_time else None,
                        "value": fv,
                        "source": f"timeline:{e.event_type}",
                    }
                )

        # Collect from vitals
        vs = (
            db.query(models.VitalObservation)
            .filter(models.VitalObservation.patient_id == patient_id)
            .order_by(models.VitalObservation.observed_at.asc())
            .all()
        )
        for v in vs:
            for col in ("heart_rate", "systolic_bp", "diastolic_bp", "spo2", "temperature_c"):
                val = getattr(v, col, None)
                if val is None:
                    continue
                fv = _to_float(val)
                if fv is None:
                    continue
                norm = _normalize_key(col)
                if not norm:
                    continue
                points.setdefault(norm, []).append(
                    {
                        "date": v.observed_at.isoformat() if v.observed_at else None,
                        "value": fv,
                        "source": "vitals",
                    }
                )

        changes: List[ValueChange] = []
        for key, series in points.items():
            # sort by date when available
            series = sorted(series, key=lambda p: p["date"] or "")
            if len(series) < 2:
                # Single point → "new" observation if abnormal
                rng = REFERENCE_RANGES.get(key)
                if rng:
                    val = series[0]["value"]
                    abnormal = _is_abnormal(key, val)
                    changes.append(
                        ValueChange(
                            key=key,
                            label=rng["label"],
                            unit=rng["unit"],
                            current_value=val,
                            current_date=series[0]["date"],
                            direction="new",
                            abnormal_now=abnormal,
                            reference_range=f"{rng['min']}–{rng['max']} {rng['unit']}",
                            severity="critical" if abnormal else "info",
                            note="First observed value." if not abnormal else "First observed value is outside reference range.",
                        )
                    )
                continue

            prev = series[-2]
            curr = series[-1]
            pv, cv = prev["value"], curr["value"]
            delta = round(cv - pv, 3)
            delta_pct = round((delta / pv) * 100, 2) if pv not in (0, None) else None
            rng = REFERENCE_RANGES.get(key)
            abnormal_now = _is_abnormal(key, cv) if rng else False
            abnormal_prev = _is_abnormal(key, pv) if rng else False

            # Direction
            if rng and rng.get("high_is_bad", True):
                if delta > 0:
                    direction = "worsening"
                elif delta < 0:
                    direction = "improving"
                else:
                    direction = "stable"
            else:
                # for metrics where higher is better (e.g., SpO2, eGFR, HDL)
                if delta < 0:
                    direction = "worsening"
                elif delta > 0:
                    direction = "improving"
                else:
                    direction = "stable"

            if abnormal_prev and not abnormal_now:
                direction = "resolved"
            if not abnormal_prev and abnormal_now:
                direction = "new"

            severity = "info"
            if abnormal_now and abnormal_prev:
                severity = "critical"
            elif abnormal_now or abnormal_prev:
                severity = "warning"

            # Major change if > 10% delta or crossing abnormal boundary
            is_major = (delta_pct is not None and abs(delta_pct) >= 10) or (abnormal_now != abnormal_prev)
            note = None
            if is_major:
                note = (
                    f"{rng['label'] if rng else key} changed from {pv} to {cv} "
                    f"({delta_pct:+}% if delta_pct else ''). Crossed reference range."
                    if abnormal_now != abnormal_prev
                    else f"{rng['label'] if rng else key} changed {delta_pct:+}% vs previous."
                )

            changes.append(
                ValueChange(
                    key=key,
                    label=rng["label"] if rng else key,
                    unit=rng["unit"] if rng else None,
                    previous_value=pv,
                    current_value=cv,
                    previous_date=prev["date"],
                    current_date=curr["date"],
                    delta=delta,
                    delta_percent=delta_pct,
                    direction=direction,
                    abnormal_now=abnormal_now,
                    abnormal_previous=abnormal_prev,
                    reference_range=f"{rng['min']}–{rng['max']} {rng['unit']}" if rng else None,
                    severity=severity,
                    note=note,
                )
            )

        abnormal_events = [c for c in changes if c.abnormal_now or c.abnormal_previous]
        major = [c for c in changes if c.severity in ("warning", "critical") or c.direction in ("new", "resolved")]

        summary = (
            f"Detected {len(changes)} tracked markers, "
            f"{len(abnormal_events)} with abnormal values, "
            f"{len(major)} notable changes."
        )
        return ChangeDetectionResponse(
            patient_id=patient_id,
            generated_at=datetime.now(timezone.utc),
            changes=changes,
            abnormal_events=abnormal_events,
            major_changes=major,
            summary=summary,
        )


# ===========================================================================
# Cross-Report Comparison
# ===========================================================================


class ReportComparisonEngine:
    """Compares two medical reports (HealthRecords with structured data)."""

    @staticmethod
    def compare(
        db: Session,
        user_id: int,
        report_a_id: int,
        report_b_id: int,
    ) -> Dict[str, Any]:
        a = db.query(models.HealthRecord).filter(models.HealthRecord.id == report_a_id).first()
        b = db.query(models.HealthRecord).filter(models.HealthRecord.id == report_b_id).first()
        if not a or not b:
            raise ValueError("One or both reports not found")

        def _extract(rec: models.HealthRecord) -> Dict[str, Any]:
            data = rec.data
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except (ValueError, TypeError):
                    data = {}
            if not isinstance(data, dict):
                data = {}
            out: Dict[str, Any] = {}
            for raw_key, val in data.items():
                norm = _normalize_key(raw_key)
                if not norm:
                    continue
                fv = _to_float(val)
                if fv is None:
                    out[raw_key] = val
                else:
                    out[norm] = fv
            return out

        da, db2 = _extract(a), _extract(b)
        keys = sorted(set(da.keys()) | set(db2.keys()))

        changed, stable, abnormal, improved, worsened = [], [], [], [], []
        clinician_attention = False
        risk_scores: List[float] = []

        for k in keys:
            va, vb = da.get(k), db2.get(k)
            rng = REFERENCE_RANGES.get(k)
            label = rng["label"] if rng else k
            unit = rng["unit"] if rng else ""

            if va is None and vb is None:
                continue
            if va is None:
                item = {"marker": label, "note": "New marker present in latest report", "value": vb}
                changed.append(item)
                clinician_attention = True
                continue
            if vb is None:
                item = {"marker": label, "note": "Marker absent in latest report", "value": va}
                stable.append(item)
                continue

            fva, fvb = _to_float(va), _to_float(vb)
            ab_a = _is_abnormal(k, fva) if rng else False
            ab_b = _is_abnormal(k, fvb) if rng else False

            if fva == fvb:
                stable.append({"marker": label, "value": fvb, "unit": unit})
                continue

            changed.append(
                {
                    "marker": label,
                    "previous": fva,
                    "current": fvb,
                    "unit": unit,
                    "delta": round(fvb - fva, 3),
                }
            )

            if ab_a and not ab_b:
                abnormal.append({"marker": label, "status": "resolved", "previous": fva, "current": fvb})
            elif not ab_a and ab_b:
                abnormal.append({"marker": label, "status": "new_abnormal", "previous": fva, "current": fvb})
                clinician_attention = True
            elif ab_a and ab_b:
                abnormal.append({"marker": label, "status": "persistent_abnormal", "previous": fva, "current": fvb})
                clinician_attention = True

            # improved / worsened
            if rng:
                if rng.get("high_is_bad", True):
                    if fvb < fva:
                        improved.append({"marker": label, "previous": fva, "current": fvb})
                    else:
                        worsened.append({"marker": label, "previous": fva, "current": fvb})
                else:
                    if fvb > fva:
                        improved.append({"marker": label, "previous": fva, "current": fvb})
                    else:
                        worsened.append({"marker": label, "previous": fva, "current": fvb})

        if worsened:
            clinician_attention = True

        # simplistic risk trend score (0-100) from number of abnormal + worsened
        overall = min(100, len(abnormal) * 12 + len(worsened) * 6)
        trend = "stable"
        if len(worsened) > len(improved):
            trend = "worsening"
        elif len(improved) > len(worsened):
            trend = "improving"

        return {
            "what_changed": {"items": changed, "summary": f"{len(changed)} markers changed between reports."},
            "what_stayed_stable": {"items": stable, "summary": f"{len(stable)} markers unchanged."},
            "what_became_abnormal": {"items": abnormal, "summary": f"{len(abnormal)} abnormal-status changes."},
            "what_improved": {"items": improved, "summary": f"{len(improved)} markers improved."},
            "what_worsened": {"items": worsened, "summary": f"{len(worsened)} markers worsened."},
            "requires_clinician_attention": clinician_attention,
            "risk_trend": trend,
            "overall_risk_score": float(overall),
        }


# ===========================================================================
# Risk Engine
# ===========================================================================


class RiskEngine:
    """Aggregates risk signals into category scores with confidence & trend."""

    @staticmethod
    def assess(db: Session, patient_id: int) -> Dict[str, Any]:
        ctx = PatientContextBuilder.build(db, patient_id)
        risks: List[Dict[str, Any]] = []

        # Map existing conditions to categories
        conditions = " ".join(ctx.conditions).lower()
        allergies = " ".join(ctx.allergies).lower()

        def _cat_score(category: str, base: float, factors: List[str], level: Optional[str] = None) -> None:
            if level is None:
                level = "low"
                if base >= 70:
                    level = "high"
                elif base >= 40:
                    level = "medium"
            risks.append(
                {
                    "risk_category": category,
                    "risk_level": level,
                    "score": float(base),
                    "confidence": 0.6,
                    "contributing_factors": factors,
                    "trend": "stable",
                    "reason": f"Screening score derived from patient context (non-diagnostic).",
                    "recommended_review_level": "urgent" if level == "high" else ("routine" if level == "low" else "standard"),
                }
            )

        if any(w in conditions for w in ("diabet", "hyperglycem", "a1c")):
            _cat_score("diabetes", 65, ["Documented diabetes-related history"])
        elif any(w in conditions for w in ("glucose", "hba1c")):
            _cat_score("diabetes", 35, ["Glucose-related marker in history"])

        if any(w in conditions for w in ("heart", "cardiac", "hypertens", "coronary", "afib")):
            _cat_score("cardiovascular", 70, ["Documented cardiovascular history"])
        if any(w in conditions for w in ("ckd", "renal", "kidney", "creatinine")):
            _cat_score("kidney", 65, ["Documented kidney-related history"])
        if any(w in conditions for w in ("liver", "hep", "cirrhosis", "alt", "ast")):
            _cat_score("liver", 60, ["Documented liver-related history"])

        # Abnormal labs → abnormal_lab risk
        abnormal_lab_count = sum(1 for l in ctx.labs if _flag_is_abnormal(l.get("abnormal_flag")))
        if abnormal_lab_count:
            _cat_score("abnormal_lab", min(80, 30 + abnormal_lab_count * 10), [f"{abnormal_lab_count} abnormal lab flag(s)"])

        # Medication risk from meds + allergies (conservative screening)
        screen = MedicationSafetyEngine.screen(ctx.medications, ctx.allergies)
        if screen["requires_clinician_review"] or ctx.medications:
            factors = []
            if screen["interactions"]:
                factors.append(f"{len(screen['interactions'])} potential drug-drug interaction(s)")
            if screen["duplicate_therapies"]:
                factors.append(f"{len(screen['duplicate_therapies'])} duplicate-therapy signal(s)")
            if screen["contraindications"]:
                factors.append(f"{len(screen['contraindications'])} allergy/contraindication signal(s)")
            if not factors:
                factors = ["Active medication list present — routine pharmacist review advised"]
            med_score = min(90, 20 + len(screen["interactions"]) * 20
                            + len(screen["duplicate_therapies"]) * 10
                            + len(screen["contraindications"]) * 25)
            # Map screened overall level to a risk level
            lvl = screen["overall_level"]
            level = "high" if lvl == "high" else ("medium" if lvl in ("medium", "low") and factors and "routine" not in factors[0] else "low")
            if screen["contraindications"]:
                level = "high"
            _cat_score("medication", med_score, factors, level=level)

        # Deterioration signal from recent vitals
        if ctx.vitals:
            latest = ctx.vitals[0]
            det = 0
            if _to_float(latest.get("spo2")) is not None and latest["spo2"] < 92:
                det += 40
            if _to_float(latest.get("systolic_bp")) is not None and latest["systolic_bp"] > 180:
                det += 30
            if det:
                _cat_score("deterioration", float(det), ["Acute vital sign deviation"])

        overall_level = "low"
        if any(r["risk_level"] == "high" for r in risks):
            overall_level = "high"
        elif any(r["risk_level"] == "medium" for r in risks):
            overall_level = "medium"

        recommended = "routine"
        if overall_level == "high":
            recommended = "urgent"
        elif overall_level == "medium":
            recommended = "standard"

        summary = (
            f"Patient has {len(risks)} active risk category signal(s). "
            f"Overall screening level: {overall_level}. "
            f"These are non-diagnostic and require clinician confirmation."
        )
        return {
            "risks": risks,
            "overall_risk_level": overall_level,
            "recommended_review_level": recommended,
            "summary": summary,
        }


# ===========================================================================
# Safety Layer
# ===========================================================================


EMERGENCY_KEYWORDS = [
    "chest pain", "can't breathe", "cannot breathe", "shortness of breath",
    "unconscious", "stroke", "severe bleeding", "suicidal", "anaphylaxis",
    "not breathing", "blue lips", "seizure", "fainting", "severe head injury",
]


class SafetyLayer:
    """Deterministic safety / escalation checks. Never blocks, only flags."""

    @staticmethod
    def evaluate(query: str, patient_context: Optional[PatientContext] = None) -> Dict[str, Any]:
        q = (query or "").lower()
        triggers = [kw for kw in EMERGENCY_KEYWORDS if kw in q]

        # contradiction detection between current meds and allergies
        contradictions: List[str] = []
        if patient_context:
            allergy_str = " ".join(patient_context.allergies).lower()
            med_str = " ".join(patient_context.medications).lower()
            if "penicillin" in allergy_str and "penicillin" in med_str:
                contradictions.append("Patient allergy to penicillin conflicts with prescribed penicillin-class medication.")

        level = "low"
        requires_escalation = False
        if triggers:
            level = "critical"
            requires_escalation = True
        elif contradictions:
            level = "high"
            requires_escalation = True

        return {
            "level": level,
            "emergency_triggers": triggers,
            "contradictions": contradictions,
            "requires_escalation": requires_escalation,
            "message": (
                "Emergency keywords detected. Escalate to emergency services / clinician immediately."
                if triggers else
                ("Potential safety contradiction detected." if contradictions else "No acute safety triggers detected.")
            ),
        }

    @staticmethod
    def uncertainty_note() -> str:
        return (
            "AI outputs are screening-level and not clinically validated. "
            "Uncertainty is inherent; confirm with a qualified clinician."
        )


# ===========================================================================
# Medication Safety Engine
# ===========================================================================
#
# Conservative, clearly-labelled screening only. Every signal produced here is a
# FLAG for clinician/pharmacist verification — the system never prescribes,
# modifies, or discontinues medications, and never asserts a diagnosis.
#
# The interaction knowledge base below encodes widely-taught, commonly-cited
# drug-class interactions. It is intentionally non-exhaustive and MUST be
# verified against an authoritative drug database before any clinical action.

# Map medication name keywords -> therapeutic class.
_MED_CLASS_KEYWORDS: Dict[str, str] = {
    # Anticoagulants / antiplatelets
    "warfarin": "anticoagulant", "apixaban": "anticoagulant", "rivaroxaban": "anticoagulant",
    "dabigatran": "anticoagulant", "edoxaban": "anticoagulant", "heparin": "anticoagulant",
    "clopidogrel": "antiplatelet", "aspirin": "antiplatelet", "prasugrel": "antiplatelet",
    "ticagrelor": "antiplatelet", "dipyridamole": "antiplatelet",
    # NSAIDs
    "ibuprofen": "nsaid", "naproxen": "nsaid", "diclofenac": "nsaid", "celecoxib": "nsaid",
    "indomethacin": "nsaid", "meloxicam": "nsaid", "ketorolac": "nsaid", "etodolac": "nsaid",
    # SSRIs / SNRIs / TCAs
    "sertraline": "ssri", "fluoxetine": "ssri", "paroxetine": "ssri", "citalopram": "ssri",
    "escitalopram": "ssri", "fluvoxamine": "ssri", "venlafaxine": "snri", "duloxetine": "snri",
    "amitriptyline": "tca", "nortriptyline": "tca", "imipramine": "tca", "clomipramine": "tca",
    # MAOIs
    "phenelzine": "maoi", "tranylcypromine": "maoi", "selegiline": "maoi", "isocarboxazid": "maoi",
    # Statins
    "atorvastatin": "statin", "simvastatin": "statin", "rosuvastatin": "statin",
    "pravastatin": "statin", "lovastatin": "statin", "fluvastatin": "statin",
    # Macrolides
    "clarithromycin": "macrolide", "erythromycin": "macrolide", "azithromycin": "macrolide",
    # ACE inhibitors / ARBs
    "lisinopril": "ace_inhibitor", "enalapril": "ace_inhibitor", "ramipril": "ace_inhibitor",
    "captopril": "ace_inhibitor", "quinapril": "ace_inhibitor", "losartan": "arb",
    "valsartan": "arb", "olmesartan": "arb", "irbesartan": "arb",
    # Diuretics
    "spironolactone": "potassium_sparing_diuretic", "amiloride": "potassium_sparing_diuretic",
    "triamterene": "potassium_sparing_diuretic", "furosemide": "loop_diuretic",
    "hydrochlorothiazide": "thiazide", "chlorthalidone": "thiazide",
    # CCBs
    "verapamil": "non_dhp_ccb", "diltiazem": "non_dhp_ccb", "amlodipine": "dihydropyridine_ccb",
    "nifedipine": "dihydropyridine_ccb",
    # Beta blockers
    "metoprolol": "beta_blocker", "atenolol": "beta_blocker", "bisoprolol": "beta_blocker",
    "carvedilol": "beta_blocker", "propranolol": "beta_blocker",
    # Diabetes
    "metformin": "biguanide", "glyburide": "sulfonylurea", "glipizide": "sulfonylurea",
    "glimepiride": "sulfonylurea", "insulin": "insulin",
    "empagliflozin": "sglt2", "dapagliflozin": "sglt2", "canagliflozin": "sglt2",
    # Sedatives / opioids
    "alprazolam": "benzodiazepine", "diazepam": "benzodiazepine", "lorazepam": "benzodiazepine",
    "clonazepam": "benzodiazepine", "midazolam": "benzodiazepine",
    "oxycodone": "opioid", "morphine": "opioid", "hydrocodone": "opioid", "fentanyl": "opioid",
    "tramadol": "opioid", "codeine": "opioid",
    # QT-prolonging
    "amiodarone": "qt_prolonging", "sotalol": "qt_prolonging", "methadone": "qt_prolonging",
    "haloperidol": "qt_prolonging", "ciprofloxacin": "qt_prolonging", "ondansetron": "qt_prolonging",
    # Contrast
    "iodinated contrast": "contrast_dye", "contrast": "contrast_dye",
}

# Drug-class interaction rules (conservative, commonly cited).
_CLASS_INTERACTIONS: List[Dict[str, Any]] = [
    {"a": "anticoagulant", "b": "nsaid", "severity": "high",
     "mechanism": "Additive bleeding risk; NSAIDs inhibit platelets and may increase anticoagulant effect."},
    {"a": "anticoagulant", "b": "antiplatelet", "severity": "high",
     "mechanism": "Markedly increased bleeding risk with combined anticoagulant + antiplatelet therapy."},
    {"a": "antiplatelet", "b": "nsaid", "severity": "high",
     "mechanism": "Additive bleeding and GI-ulceration risk."},
    {"a": "ssri", "b": "maoi", "severity": "high",
     "mechanism": "Risk of serotonin syndrome; MAOIs are contraindicated with SSRIs/SNRIs."},
    {"a": "snri", "b": "maoi", "severity": "high",
     "mechanism": "Risk of serotonin syndrome; MAOIs are contraindicated with SNRIs."},
    {"a": "ssri", "b": "tca", "severity": "medium",
     "mechanism": "Additive serotonergic and anticholinergic effects; increased TCA levels possible."},
    {"a": "statin", "b": "macrolide", "severity": "high",
     "mechanism": "Macrolides inhibit CYP3A4, raising statin levels and risk of myopathy/rhabdomyolysis."},
    {"a": "statin", "b": "non_dhp_ccb", "severity": "medium",
     "mechanism": "Verapamil/diltiazem inhibit statin metabolism, increasing myopathy risk (simvastatin especially)."},
    {"a": "ace_inhibitor", "b": "potassium_sparing_diuretic", "severity": "high",
     "mechanism": "Additive effect may cause hyperkalemia."},
    {"a": "arb", "b": "potassium_sparing_diuretic", "severity": "high",
     "mechanism": "Additive effect may cause hyperkalemia."},
    {"a": "ace_inhibitor", "b": "arb", "severity": "medium",
     "mechanism": "Dual RAS blockade increases hyperkalemia and renal-impairment risk."},
    {"a": "beta_blocker", "b": "non_dhp_ccb", "severity": "high",
     "mechanism": "Additive bradycardia / AV-block risk (verapamil + beta-blocker)."},
    {"a": "biguanide", "b": "contrast_dye", "severity": "medium",
     "mechanism": "Hold metformin around iodinated contrast to reduce lactic-acidosis risk."},
    {"a": "opioid", "b": "benzodiazepine", "severity": "high",
     "mechanism": "Combined CNS/respiratory depression; FDA warns against co-prescribing."},
    {"a": "opioid", "b": "qt_prolonging", "severity": "medium",
     "mechanism": "Additive QT-prolongation / arrhythmia risk."},
    {"a": "qt_prolonging", "b": "qt_prolonging", "severity": "high",
     "mechanism": "Additive QT-interval prolongation and torsades risk."},
    {"a": "ssri", "b": "nsaid", "severity": "medium",
     "mechanism": "SSRIs may impair platelet function; additive GI bleeding risk with NSAIDs."},
]

# Classes where two agents of the same class imply duplicate therapy.
_DUPLICATE_SIGNIFICANT_CLASSES = {
    "statin", "ssri", "snri", "ace_inhibitor", "arb", "beta_blocker",
    "nsaid", "opioid", "benzodiazepine", "anticoagulant", "antiplatelet",
    "biguanide", "sulfonylurea", "insulin", "loop_diuretic", "thiazide",
}

# Allergy keyword -> medication class(es) that should be reviewed for contraindication.
_ALLERGY_CONTRAINDICATIONS: List[Dict[str, Any]] = [
    {"allergy": "penicillin", "classes": ["penicillin_class"], "label": "Penicillin / beta-lactam"},
    {"allergy": "beta-lactam", "classes": ["penicillin_class"], "label": "Penicillin / beta-lactam"},
    {"allergy": "cephalosporin", "classes": ["penicillin_class"], "label": "Cephalosporin (beta-lactam)"},
    {"allergy": "sulfa", "classes": ["sulfonamide_antibiotic"], "label": "Sulfonamide antibiotic"},
    {"allergy": "aspirin", "classes": ["nsaid", "antiplatelet"], "label": "Aspirin / NSAID"},
    {"allergy": "nsaid", "classes": ["nsaid"], "label": "NSAID"},
    {"allergy": "statin", "classes": ["statin"], "label": "Statin"},
    {"allergy": "ace inhibitor", "classes": ["ace_inhibitor"], "label": "ACE inhibitor"},
]

_PENICILLIN_CLASS_DRUGS = {"amoxicillin", "ampicillin", "penicillin", "piperacillin", "ticarcillin",
                           "oxacillin", "nafcillin", "cloxacillin", "dicloxacillin"}
_SULFONAMIDE_ANTIBIOTICS = {"sulfamethoxazole", "trimethoprim", "sulfadiazine", "sulfisoxazole"}

_VERIFICATION_NOTE = (
    "Screening signal only — verify against an authoritative drug database and "
    "with a pharmacist/clinician before any action. This system does not "
    "prescribe, modify, or discontinue medications."
)


def _classify_medication(name: str) -> List[str]:
    """Return therapeutic classes a medication name maps to."""
    n = name.lower()
    classes: List[str] = []
    for kw, cls in _MED_CLASS_KEYWORDS.items():
        if kw in n:
            if cls not in classes:
                classes.append(cls)
    if any(x in n for x in _PENICILLIN_CLASS_DRUGS):
        if "penicillin_class" not in classes:
            classes.append("penicillin_class")
    if any(x in n for x in _SULFONAMIDE_ANTIBIOTICS):
        if "sulfonamide_antibiotic" not in classes:
            classes.append("sulfonamide_antibiotic")
    return classes


@dataclass
class MedicationSafetyResult:
    """Structured, clinician-verifiable medication safety screening result."""

    patient_id: int
    medications: List[str] = field(default_factory=list)
    interactions: List[Dict[str, Any]] = field(default_factory=list)
    duplicate_therapies: List[Dict[str, Any]] = field(default_factory=list)
    contraindications: List[Dict[str, Any]] = field(default_factory=list)
    dosage_concerns: List[Dict[str, Any]] = field(default_factory=list)
    overall_level: str = "low"
    requires_clinician_review: bool = False
    disclaimer: str = _VERIFICATION_NOTE


class MedicationSafetyEngine:
    """Rule-based medication safety screening (interactions / duplicates / contraindications)."""

    @staticmethod
    def screen(medications: List[str], allergies: List[str]) -> Dict[str, Any]:
        """Pure, DB-free screening used by tests, the risk engine and the API."""
        meds = [m for m in (medications or []) if m and m.strip()]
        allergies_lower = [a.lower() for a in (allergies or [])]

        # 1) Drug-drug interactions (class based)
        interactions: List[Dict[str, Any]] = []
        med_classes: List[List[str]] = [_classify_medication(m) for m in meds]
        for i in range(len(meds)):
            for j in range(i + 1, len(meds)):
                ci, cj = med_classes[i], med_classes[j]
                if not ci or not cj:
                    continue
                for rule in _CLASS_INTERACTIONS:
                    if (rule["a"] in ci and rule["b"] in cj) or (rule["b"] in ci and rule["a"] in cj):
                        interactions.append({
                            "medication_a": meds[i],
                            "medication_b": meds[j],
                            "severity": rule["severity"],
                            "mechanism": rule["mechanism"],
                            "verification": _VERIFICATION_NOTE,
                        })

        # 2) Duplicate therapy (same significant class in 2+ meds)
        duplicate_therapies: List[Dict[str, Any]] = []
        class_to_meds: Dict[str, List[str]] = {}
        for m, cs in zip(meds, med_classes):
            for c in cs:
                if c in _DUPLICATE_SIGNIFICANT_CLASSES:
                    class_to_meds.setdefault(c, []).append(m)
        for cls, members in class_to_meds.items():
            if len(members) >= 2:
                duplicate_therapies.append({
                    "drug_class": cls,
                    "medications": members,
                    "severity": "medium",
                    "note": f"Multiple agents from the same class ({cls}) — verify therapeutic duplication.",
                    "verification": _VERIFICATION_NOTE,
                })

        # 3) Allergy / contraindication screening
        contraindications: List[Dict[str, Any]] = []
        for allergy_entry in _ALLERGY_CONTRAINDICATIONS:
            if not any(allergy_entry["allergy"] in a for a in allergies_lower):
                continue
            for idx, m in enumerate(meds):
                m_classes = med_classes[idx]
                if any(c in m_classes for c in allergy_entry["classes"]):
                    contraindications.append({
                        "allergy": allergy_entry["label"],
                        "medication": m,
                        "severity": "high",
                        "note": f"Documented allergy to {allergy_entry['label']} may contraindicate {m}.",
                        "verification": _VERIFICATION_NOTE,
                    })

        # 4) Aggregate severity
        sev_rank = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        overall = "low"
        for item in [*interactions, *duplicate_therapies, *contraindications]:
            if sev_rank.get(item["severity"], 0) > sev_rank[overall]:
                overall = item["severity"]
        requires_review = overall in ("medium", "high", "critical") or bool(contraindications)

        return {
            "interactions": interactions,
            "duplicate_therapies": duplicate_therapies,
            "contraindications": contraindications,
            "overall_level": overall,
            "requires_clinician_review": requires_review,
        }

    @staticmethod
    def analyze(db: Session, patient_id: int) -> MedicationSafetyResult:
        """DB-backed analysis that also screens for incomplete medication orders."""
        ctx = PatientContextBuilder.build(db, patient_id)
        screen = MedicationSafetyEngine.screen(ctx.medications, ctx.allergies)

        dosage_concerns: List[Dict[str, Any]] = []
        try:
            rxs = (
                db.query(models.Prescription)
                .filter(models.Prescription.patient_id == patient_id)
                .all()
            )
            for rx in rxs:
                for item in getattr(rx, "items", []) or []:
                    name = (getattr(item, "medication_name", None) or "").strip()
                    dosage = (getattr(item, "dosage", None) or "").strip()
                    freq = (getattr(item, "frequency", None) or "").strip()
                    if name and (not dosage or not freq):
                        dosage_concerns.append({
                            "medication": name,
                            "severity": "low",
                            "note": "Incomplete medication order (missing dosage or frequency) — verify with prescriber.",
                            "verification": _VERIFICATION_NOTE,
                        })
        except Exception:
            pass

        return MedicationSafetyResult(
            patient_id=patient_id,
            medications=ctx.medications,
            interactions=screen["interactions"],
            duplicate_therapies=screen["duplicate_therapies"],
            contraindications=screen["contraindications"],
            dosage_concerns=dosage_concerns,
            overall_level=screen["overall_level"],
            requires_clinician_review=screen["requires_clinician_review"] or bool(dosage_concerns),
        )


# ===========================================================================
# Agent Collaboration
# ===========================================================================


class AgentOpinion(BaseModel):
    """Structured, safe-to-expose specialist opinion (no hidden chain-of-thought)."""

    specialist: str
    interpretation: str
    evidence: List[str] = Field(default_factory=list)
    confidence: float
    concerns: List[str] = Field(default_factory=list)


SPECIALIST_PROFILES = {
    "Cardiology": {
        "focus": "Cardiovascular interpretation, BP, lipids, cardiac symptoms.",
        "evidence": ["ACC/AHA guidelines", "Patient cardiac history"],
    },
    "Endocrinology": {
        "focus": "Glucose metabolism, diabetes, thyroid, HbA1c trends.",
        "evidence": ["ADA standards", "Lab trends"],
    },
    "Nephrology": {
        "focus": "Renal function, creatinine, eGFR, electrolytes.",
        "evidence": ["KDIGO guidelines", "Lab trends"],
    },
    "Hepatology": {
        "focus": "Liver function, LFTs, fibrosis risk.",
        "evidence": ["AASLD guidance", "Lab trends"],
    },
    "Pharmacology": {
        "focus": "Medication safety, interactions, allergies.",
        "evidence": ["Drug labels", "Patient meds/allergies"],
    },
    "Radiology": {
        "focus": "Imaging findings, modality appropriateness.",
        "evidence": ["ACR appropriateness", "Imaging metadata"],
    },
    "Laboratory": {
        "focus": "Lab panel interpretation, reference ranges.",
        "evidence": ["Reference ranges", "Longitudinal trends"],
    },
    "History": {
        "focus": "Longitudinal context, prior encounters, timeline.",
        "evidence": ["Patient timeline", "Prior reports"],
    },
}


class AgentCollaboration:
    """Runs multiple specialist agents over a case and reconciles via supervisor.

    This is a deterministic, evidence-aware debate. It does NOT call an LLM;
    instead each specialist produces a structured opinion from the patient
    context, and the supervisor reconciles them, detecting disagreements.
    """

    @staticmethod
    def debate(db: Session, patient_id: int, question: str, specialists: Optional[List[str]] = None) -> Dict[str, Any]:
        ctx = PatientContextBuilder.build(db, patient_id)
        if not specialists:
            specialists = list(SPECIALIST_PROFILES.keys())

        opinions: List[AgentOpinion] = []
        for name in specialists:
            profile = SPECIALIST_PROFILES.get(name, {"focus": "General", "evidence": []})
            interp, concerns = AgentCollaboration._specialist_analysis(name, ctx, question)
            confidence = AgentCollaboration._specialist_confidence(name, ctx)
            opinions.append(
                AgentOpinion(
                    specialist=name,
                    interpretation=interp,
                    evidence=profile["evidence"],
                    confidence=confidence,
                    concerns=concerns,
                )
            )

        # disagreement detection
        disagreements: List[Dict[str, Any]] = []
        risk_levels = [o.confidence for o in opinions]
        if risk_levels:
            spread = max(risk_levels) - min(risk_levels)
            if spread >= 0.4:
                disagreements.append(
                    {
                        "topic": "confidence_spread",
                        "detail": f"Specialist confidence spread {spread:.2f}; reconcile with clinician.",
                    }
                )

        # supervisor reconciliation
        avg_conf = sum(risk_levels) / len(risk_levels) if risk_levels else 0.0
        requires_review = avg_conf < 0.7 or bool(disagreements)
        supervisor_summary = (
            f"{len(opinions)} specialists reviewed the case. "
            f"Average confidence {avg_conf:.2f}. "
            + ("Clinician review recommended due to uncertainty or disagreement." if requires_review
               else "Sufficient agreement for informational use; clinician confirmation still required.")
        )

        return {
            "patient_id": patient_id,
            "question": question,
            "opinions": [o.model_dump() for o in opinions],
            "consensus": None,
            "disagreements": disagreements,
            "requires_clinician_review": requires_review,
            "supervisor_summary": supervisor_summary,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _specialist_analysis(name: str, ctx: PatientContext, question: str) -> tuple[str, List[str]]:
        concerns: List[str] = []
        if name == "Cardiology":
            if any(w in " ".join(ctx.conditions).lower() for w in ("hypertens", "heart", "cardiac")):
                interp = "Documented cardiovascular history present; monitor BP and lipids."
            else:
                interp = "No documented cardiovascular condition; routine monitoring advised."
            if ctx.vitals and _to_float(ctx.vitals[0].get("systolic_bp") or 0) and ctx.vitals[0]["systolic_bp"] > 140:
                concerns.append("Elevated systolic BP observed in latest vitals.")
        elif name == "Endocrinology":
            if any(w in " ".join(ctx.conditions).lower() for w in ("diabet", "glucose")):
                interp = "Diabetes-related history present; review HbA1c trend."
            else:
                interp = "No documented glycemic disorder."
        elif name == "Nephrology":
            interp = "Review renal panel (creatinine/eGFR) if available."
            if ctx.labs:
                concerns.append("Abnormal renal labs may be present; verify with nephrology.")
        elif name == "Hepatology":
            interp = "Review LFTs (ALT/AST) if available."
        elif name == "Pharmacology":
            screen = MedicationSafetyEngine.screen(ctx.medications, ctx.allergies)
            n_issues = len(screen["interactions"]) + len(screen["duplicate_therapies"]) + len(screen["contraindications"])
            if ctx.medications:
                interp = f"{len(ctx.medications)} active medication(s) screened; {n_issues} safety signal(s) flagged for pharmacist verification."
            else:
                interp = "No active medications on record to screen."
            if screen["contraindications"]:
                concerns.append("Allergy/contraindication signal(s) detected — verify before any prescribing.")
            elif screen["interactions"] or screen["duplicate_therapies"]:
                concerns.append("Potential interaction or duplicate-therapy signal(s) — verify with pharmacist.")
        elif name == "Radiology":
            interp = f"{len(ctx.imaging)} imaging study(ies) on record; review appropriateness."
        elif name == "Laboratory":
            interp = f"{len(ctx.labs)} diagnostic result(s) on record; compare to reference ranges."
            if any(_flag_is_abnormal(l.get("abnormal_flag")) for l in ctx.labs):
                concerns.append("One or more abnormal lab flags present.")
        elif name == "History":
            interp = f"{len(ctx.timeline_events)} longitudinal timeline event(s) available for context."
        else:
            interp = "General review completed."
        return interp, concerns

    @staticmethod
    def _specialist_confidence(name: str, ctx: PatientContext) -> float:
        # confidence scales with available evidence for that specialty
        if name == "Laboratory" and ctx.labs:
            return min(0.9, 0.5 + 0.05 * len(ctx.labs))
        if name == "History" and ctx.timeline_events:
            return min(0.9, 0.5 + 0.03 * len(ctx.timeline_events))
        if name == "Radiology" and ctx.imaging:
            return min(0.9, 0.5 + 0.1 * len(ctx.imaging))
        if name == "Pharmacology" and (ctx.medications or ctx.allergies):
            return 0.7
        return 0.5


# ===========================================================================
# Care Gap Engine
# ===========================================================================


class CareGapEngine:
    """Detects missed follow-up / incomplete workflow events (rule-based)."""

    @staticmethod
    def detect(db: Session, patient_id: int) -> List[Dict[str, Any]]:
        gaps: List[Dict[str, Any]] = []
        # Stored timestamps are timezone-naive; compare with a naive "now".
        now = datetime.now()

        # Overdue follow-up: last encounter > 180 days ago
        last_enc = (
            db.query(models.Encounter)
            .filter(models.Encounter.patient_id == patient_id)
            .order_by(desc(models.Encounter.started_at))
            .first()
        )
        if last_enc and last_enc.started_at:
            days = (now - last_enc.started_at).days
            if days > 180:
                gaps.append(
                    {
                        "gap_type": "overdue_followup",
                        "title": f"No encounter in {days} days",
                        "severity": "medium",
                    }
                )

        # Unresolved abnormal report
        open_abnormal = [
            l for l in db.query(models.DiagnosticResult)
            .filter(models.DiagnosticResult.patient_id == patient_id)
            .all()
            if _flag_is_abnormal(l.abnormal_flag)
            and (l.review_status or "pending_review") in ("pending_review", "needs_follow_up", "pending", "ordered", "")

        ]
        if open_abnormal:
            gaps.append(
                {
                    "gap_type": "unresolved_abnormal_report",
                    "title": f"{len(open_abnormal)} abnormal lab result(s) not reviewed",
                    "severity": "high",
                }
            )

        # Medication review due if many meds
        meds = db.query(models.Prescription).filter(models.Prescription.patient_id == patient_id).all()
        if len(meds) >= 5:
            gaps.append(
                {
                    "gap_type": "medication_review_due",
                    "title": f"{len(meds)} active prescriptions — periodic review due",
                    "severity": "low",
                }
            )

        # Missing lab follow-up: abnormal lab not yet reviewed AND no future appointment
        abnormal_ids = {l.id for l in open_abnormal}
        future_appt = (
            db.query(models.Appointment)
            .filter(models.Appointment.user_id == patient_id)
            .filter(models.Appointment.date_time > now)
            .first()
        )
        if abnormal_ids and not future_appt:
            gaps.append(
                {
                    "gap_type": "missing_lab_followup",
                    "title": f"{len(abnormal_ids)} abnormal lab result(s) with no scheduled follow-up",
                    "severity": "medium",
                }
            )

        # Appointment gap: no upcoming appointment and last appointment > 365 days ago
        last_appt = (
            db.query(models.Appointment)
            .filter(models.Appointment.user_id == patient_id)
            .order_by(desc(models.Appointment.date_time))
            .first()
        )
        if not future_appt and last_appt and last_appt.date_time:
            appt_days = (now - last_appt.date_time).days
            if appt_days > 365:
                gaps.append(
                    {
                        "gap_type": "appointment_gap",
                        "title": f"No upcoming appointment; last visit {appt_days} days ago",
                        "severity": "low",
                    }
                )

        # Incomplete workflow: active prescription with pending (undispensed) items
        pending_items = 0
        for rx in meds:
            for item in getattr(rx, "items", []) or []:
                if (getattr(item, "status", None) or "pending").lower() in ("pending", "partially_dispensed"):
                    pending_items += 1
        if pending_items:
            gaps.append(
                {
                    "gap_type": "incomplete_workflow",
                    "title": f"{pending_items} prescription item(s) not yet dispensed",
                    "severity": "low",
                }
            )

        return gaps


def build_intelligence_profile(db: Session, patient_id: int) -> Dict[str, Any]:
    """Build the unified Patient Intelligence Profile."""
    from .schemas.intelligence_features import PatientIntelligenceProfile, ValueChange

    ctx = PatientContextBuilder.build(db, patient_id)
    changes = ChangeDetectionEngine.detect(db, patient_id)
    risk = RiskEngine.assess(db, patient_id)
    gaps = CareGapEngine.detect(db, patient_id)

    return PatientIntelligenceProfile(
        patient_id=patient_id,
        generated_at=datetime.now(timezone.utc),
        overview=ctx.demographics,
        current_conditions=ctx.conditions,
        active_medications=ctx.medications,
        allergies=ctx.allergies,
        recent_labs=ctx.labs[:10],
        imaging=ctx.imaging[:5],
        risk_indicators=risk["risks"],
        recent_encounters=ctx.encounters[:5],
        long_term_trends=[c.model_dump() for c in changes.major_changes],
        care_gaps=[g for g in gaps],
        upcoming_followups=ctx.appointments[:3],
        ai_summary=risk["summary"],
        ai_confidence=0.6,
    ).model_dump()
