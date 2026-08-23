"""Temporary DB inspection helper (safe to delete)."""
import sqlite3

con = sqlite3.connect("healthcare.db")
cur = con.cursor()
tables = [r[0] for r in cur.execute("select name from sqlite_master where type='table' order by name")]
print("TABLES:", len(tables))
for t in [
    "users", "encounters", "health_records", "prescriptions", "prescription_items",
    "diagnostic_results", "patient_timeline_events", "care_gaps", "clinical_reviews",
    "agent_runs", "agent_findings", "evidence_references", "risk_assessments",
    "report_comparisons", "appointments", "vital_observations",
]:
    try:
        n = cur.execute(f"select count(*) from {t}").fetchone()[0]
    except Exception as exc:  # noqa: BLE001
        n = f"ERR {exc}"
    print(f"{t}: {n}")
print()
for row in cur.execute("select id, username, role, full_name from users limit 25"):
    print(row)
print()
for row in cur.execute("select id, patient_id, doctor_id, encounter_type, status, started_at from encounters limit 15"):
    print(row)
