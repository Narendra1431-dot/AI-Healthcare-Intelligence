import sqlite3, json
DB = 'E:/AI-Healthcare-System-main/AI-Healthcare-System-main/healthcare.db'
conn = sqlite3.connect(DB)
cur = conn.cursor()
print('=== audit_logs columns ===')
for r in cur.execute('PRAGMA table_info(audit_logs)'):
    print(' ', r)
print()
print('=== Bed-assignment / admission audit events (recent) ===')
for r in cur.execute(
    "SELECT id, facility_id, admin_id, target_user_id, action, timestamp, details "
    "FROM audit_logs "
    "WHERE action IN ('UPDATE_BED_STATUS','CREATE_ADMISSION','CREATE_BED','DISCHARGE','CREATE_DISCHARGE_SUMMARY') "
    "ORDER BY id DESC LIMIT 40"
):
    print(' ', r)
print()
print('=== audit_logs for bed 75 / target user 4 (demo_patient) ===')
for r in cur.execute(
    "SELECT id, facility_id, admin_id, target_user_id, action, timestamp, details "
    "FROM audit_logs WHERE target_user_id=4 OR details LIKE '%bed_id\": 75%' OR details LIKE '%resource_id\": 75%' "
    "ORDER BY id DESC LIMIT 20"
):
    print(' ', r)
print()
print('=== audit_logs for bed 18 / target user 8 ===')
for r in cur.execute(
    "SELECT id, facility_id, admin_id, target_user_id, action, timestamp, details "
    "FROM audit_logs WHERE target_user_id=8 OR details LIKE '%resource_id\": 18%' "
    "ORDER BY id DESC LIMIT 20"
):
    print(' ', r)
print()
print('=== recent LOGIN / token-issue audit events ===')
for r in cur.execute(
    "SELECT id, admin_id, action, timestamp, details FROM audit_logs "
    "WHERE action LIKE '%LOGIN%' OR action LIKE '%TOKEN%' OR action LIKE '%AUTH%' OR action LIKE '%LOG%' "
    "ORDER BY id DESC LIMIT 20"
):
    print(' ', r)
print()
print('=== distinct actions in audit_logs ===')
for r in cur.execute("SELECT action, COUNT(*) FROM audit_logs GROUP BY action ORDER BY COUNT(*) DESC"):
    print(' ', r)
print()
print('=== users: id, username, role, is_active ===')
for r in cur.execute("SELECT id, username, role, facility_id, is_active FROM users ORDER BY id"):
    print(' ', r)
print()
print('=== admissions full ===')
for r in cur.execute("SELECT id, facility_id, patient_id, doctor_id, department_id, bed_id, encounter_id, status, admitted_at, discharged_at FROM admissions ORDER BY id"):
    print(' ', r)
conn.close()
