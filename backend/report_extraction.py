"""Deterministic clinical report extraction and screening helpers.

Used by the report workflow pipeline. Extraction is provider-free for
structured uploads (JSON / CSV / TSV / plain text), so the whole report
workflow runs locally with zero configuration. Image and PDF uploads are
delegated to ``vision_service`` (which requires a configured vision provider);
when that provider is unavailable the pipeline records an honest failure
instead of fabricating values.
"""
from __future__ import annotations

import csv
import io
import json
import re
from typing import Any, Dict, List, Tuple

from .intelligence_engine import (
    REFERENCE_RANGES,
    _is_abnormal,
    _normalize_key,
    _to_float,
)

STRUCTURED_CONTENT_TYPES = (
    "application/json",
    "text/csv",
    "text/tab-separated-values",
    "text/plain",
    "application/vnd.ms-excel",
    "",
)
VISION_CONTENT_TYPES = ("image/jpeg", "image/jpg", "image/png", "application/pdf")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# Marker -> HealthRecord.record_type (constrained by the health_records CHECK).
_CATEGORY_MAP: Dict[str, str] = {
    "hbA1c": "diabetes",
    "glucose": "diabetes",
    "systolic_bp": "heart",
    "diastolic_bp": "heart",
    "heart_rate": "heart",
    "ldl": "heart",
    "hdl": "heart",
    "total_cholesterol": "heart",
    "triglycerides": "heart",
    "alt": "liver",
    "ast": "liver",
    "creatinine": "kidney",
    "egfr": "kidney",
    "bun": "kidney",
    "potassium": "kidney",
    "sodium": "kidney",
    "spo2": "lungs",
    "hemoglobin": "heart",
    "wbc": "heart",
    "tsh": "diabetes",
}

# Patient-facing phrasing for each marker family (plain language, non-diagnostic).
_PATIENT_PHRASES: Dict[str, str] = {
    "hbA1c": "your average blood sugar over the past few months",
    "glucose": "your blood sugar level",
    "systolic_bp": "the top number of your blood pressure",
    "diastolic_bp": "the bottom number of your blood pressure",
    "heart_rate": "your heart rate",
    "spo2": "the oxygen level in your blood",
    "creatinine": "a kidney function marker",
    "egfr": "a kidney filtering measure",
    "ldl": "the cholesterol that can build up in blood vessels",
    "hdl": "the cholesterol that helps clear blood vessels",
    "total_cholesterol": "your total cholesterol",
    "triglycerides": "a blood fat measure",
    "alt": "a liver enzyme",
    "ast": "a liver enzyme",
    "bun": "a kidney waste-product marker",
    "potassium": "a blood salt (electrolyte)",
    "sodium": "a blood salt (electrolyte)",
    "hemoglobin": "the protein that carries oxygen in your blood",
    "wbc": "your white blood cell count",
    "tsh": "a thyroid hormone marker",
}


class ReportExtractionError(ValueError):
    """Raised when a report cannot be parsed into clinical markers."""


def is_supported_content_type(content_type: str | None, file_name: str) -> bool:
    """Return whether the upload is a supported report format."""
    ctype = (content_type or "").lower()
    if ctype in VISION_CONTENT_TYPES:
        return True
    if ctype in STRUCTURED_CONTENT_TYPES:
        return True
    return file_name.lower().endswith((".json", ".csv", ".tsv", ".txt"))


def is_structured(content_type: str | None, file_name: str) -> bool:
    """Return whether the upload can be parsed without a vision provider."""
    ctype = (content_type or "").lower()
    if ctype in VISION_CONTENT_TYPES:
        return False
    return True if ctype in STRUCTURED_CONTENT_TYPES else file_name.lower().endswith(
        (".json", ".csv", ".tsv", ".txt")
    )


def _pairs_from_json(text: str) -> List[Tuple[str, Any]]:
    data = json.loads(text)
    if isinstance(data, dict):
        if isinstance(data.get("extracted_data"), dict):
            data = data["extracted_data"]
        if isinstance(data.get("results"), list):
            pairs: List[Tuple[str, Any]] = []
            for row in data["results"]:
                if isinstance(row, dict):
                    name = row.get("name") or row.get("marker") or row.get("test")
                    value = row.get("value") if "value" in row else row.get("result")
                    if name is not None:
                        pairs.append((str(name), value))
            return pairs
        return [(str(k), v) for k, v in data.items()]
    if isinstance(data, list):
        pairs = []
        for row in data:
            if isinstance(row, dict):
                name = row.get("name") or row.get("marker") or row.get("test")
                value = row.get("value") if "value" in row else row.get("result")
                if name is not None:
                    pairs.append((str(name), value))
        return pairs
    raise ReportExtractionError("Unsupported JSON report structure")


def _pairs_from_delimited(text: str) -> List[Tuple[str, Any]]:
    delimiter = "\t" if "\t" in text.splitlines()[0] else ","
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = [r for r in reader if r and any(c.strip() for c in r)]
    if not rows:
        return []
    pairs: List[Tuple[str, Any]] = []
    header = [c.strip().lower() for c in rows[0]]
    if {"name", "value"}.issubset(set(header)) or {"marker", "value"}.issubset(set(header)):
        name_idx = header.index("name") if "name" in header else header.index("marker")
        value_idx = header.index("value")
        for row in rows[1:]:
            if len(row) > max(name_idx, value_idx):
                pairs.append((row[name_idx].strip(), row[value_idx].strip()))
        return pairs
    # Fall back to first-two-columns interpretation.
    for row in rows:
        if len(row) >= 2:
            pairs.append((row[0].strip(), row[1].strip()))
    return pairs


def _pairs_from_text(text: str) -> List[Tuple[str, Any]]:
    pairs: List[Tuple[str, Any]] = []
    for line in text.splitlines():
        match = re.match(r"^\s*([A-Za-z0-9 _\-/%\.]+?)\s*[:=]\s*([-+]?[0-9.,]+)", line)
        if match:
            pairs.append((match.group(1).strip(), match.group(2).strip()))
    return pairs


def extract_markers(payload: str, content_type: str | None, file_name: str) -> Dict[str, float]:
    """Extract normalized clinical markers from a structured report payload.

    Args:
        payload: Decoded report text (JSON, CSV, TSV or plain text).
        content_type: Upload MIME type, when provided by the client.
        file_name: Original file name (used for extension sniffing).

    Returns:
        Mapping of normalized marker key -> numeric value.

    Raises:
        ReportExtractionError: When no recognizable clinical marker is found.
    """
    text = payload.strip()
    if not text:
        raise ReportExtractionError("Report file is empty")

    lowered_name = file_name.lower()
    ctype = (content_type or "").lower()
    pairs: List[Tuple[str, Any]] = []

    try:
        if ctype == "application/json" or lowered_name.endswith(".json") or text[0] in "[{":
            pairs = _pairs_from_json(text)
        elif "csv" in ctype or "tab-separated" in ctype or lowered_name.endswith((".csv", ".tsv")):
            pairs = _pairs_from_delimited(text)
        else:
            pairs = _pairs_from_text(text)
    except ReportExtractionError:
        raise
    except (ValueError, IndexError, csv.Error) as exc:
        raise ReportExtractionError(f"Report could not be parsed: {exc}") from exc

    if not pairs:
        pairs = _pairs_from_text(text)

    markers: Dict[str, float] = {}
    for raw_key, raw_value in pairs:
        key = _normalize_key(str(raw_key))
        if not key:
            continue
        value = _to_float(raw_value)
        if value is None:
            continue
        markers[key] = value

    if not markers:
        raise ReportExtractionError(
            "No recognizable clinical markers were found in this report. "
            "Supported markers include HbA1c, glucose, blood pressure, lipids, "
            "renal and hepatic panels."
        )
    return markers


def markers_from_vision_result(result: Dict[str, Any]) -> Dict[str, float]:
    """Normalize a vision-service extraction result into clinical markers."""
    data = result.get("extracted_data") if isinstance(result, dict) else None
    if not isinstance(data, dict) or not data:
        raise ReportExtractionError(
            "The vision extraction service returned no structured values for this file."
        )
    markers: Dict[str, float] = {}
    for raw_key, raw_value in data.items():
        key = _normalize_key(str(raw_key))
        if not key:
            continue
        value = _to_float(raw_value)
        if value is not None:
            markers[key] = value
    if not markers:
        raise ReportExtractionError(
            "The extracted values did not map to any supported clinical marker."
        )
    return markers


def build_findings(markers: Dict[str, float]) -> List[Dict[str, Any]]:
    """Flag markers outside their non-diagnostic screening reference range.

    Args:
        markers: Normalized marker -> value mapping.

    Returns:
        List of finding dicts (marker, label, value, unit, reference range,
        direction, severity, patient explanation).
    """
    findings: List[Dict[str, Any]] = []
    for key, value in markers.items():
        rng = REFERENCE_RANGES.get(key)
        if not rng or not _is_abnormal(key, value):
            continue
        direction = "high" if value > rng["max"] else "low"
        distance = (
            (value - rng["max"]) / max(rng["max"], 1e-6)
            if direction == "high"
            else (rng["min"] - value) / max(rng["min"], 1e-6)
        )
        severity = "critical" if distance >= 0.4 else "warning"
        phrase = _PATIENT_PHRASES.get(key, "this measurement")
        findings.append(
            {
                "marker": key,
                "label": rng["label"],
                "value": value,
                "unit": rng["unit"],
                "reference_range": f"{rng['min']}–{rng['max']} {rng['unit']}",
                "direction": direction,
                "severity": severity,
                "patient_explanation": (
                    f"{rng['label']} ({phrase}) is {'above' if direction == 'high' else 'below'} "
                    f"the usual range of {rng['min']}–{rng['max']} {rng['unit']}. "
                    "This is a screening flag, not a diagnosis — your clinician will confirm what it means."
                ),
            }
        )
    findings.sort(key=lambda f: (f["severity"] != "critical", f["label"]))
    return findings


def infer_record_type(markers: Dict[str, float]) -> str:
    """Infer the ``health_records.record_type`` bucket for a marker set.

    The ``health_records`` table constrains ``record_type`` to
    ``diabetes|heart|liver|kidney|lungs``; the dominant marker family wins and
    ``heart`` is the cardio-metabolic default for mixed panels.
    """
    counts: Dict[str, int] = {}
    for key in markers:
        bucket = _CATEGORY_MAP.get(key)
        if bucket:
            counts[bucket] = counts.get(bucket, 0) + 1
    if not counts:
        return "heart"
    return max(counts.items(), key=lambda kv: (kv[1], kv[0] == "heart"))[0]


def build_summary(markers: Dict[str, float], findings: List[Dict[str, Any]]) -> str:
    """Build a factual, non-diagnostic summary sentence for a report."""
    if not findings:
        return (
            f"{len(markers)} clinical marker(s) extracted; all values fall inside the "
            "screening reference ranges used by this system. Clinician confirmation is still required."
        )
    labels = ", ".join(f["label"] for f in findings[:5])
    more = "" if len(findings) <= 5 else f" and {len(findings) - 5} more"
    return (
        f"{len(markers)} clinical marker(s) extracted; {len(findings)} outside the screening "
        f"reference range ({labels}{more}). These are screening flags for clinician review, not diagnoses."
    )
