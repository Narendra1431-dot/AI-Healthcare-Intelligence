import sqlite3
DB = 'E:/AI-Healthcare-System-main/AI-Healthcare-System-main/healthcare.db'
conn = sqlite3.connect(DB)
cur = conn.cursor()
print('=== ALL TABLES ===')
for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
    print(' ', r[0])
print()
print('=== audit-related table counts ===')
for t in ['audit_events', 'auditlog', 'audit_logs', 'audits', 'logs']:
    try:
        cur.execute(f'SELECT COUNT(*) FROM {t}')
        print(f'  {t}: {cur.fetchone()[0]} rows')
    except Exception as e:
        print(f'  {t}: ERR -> {e}')
print()
print('=== admissions joined to beds ===')
for r in cur.execute(
    'SELECT a.id, a.facility_id, a.patient_id, a.doctor_id, a.bed_id, a.status, '
    'b.status AS bed_status, b.current_patient_id FROM admissions a '
    'LEFT JOIN beds b ON a.bed_id = b.id ORDER BY a.id'
):
    print(' ', r)
print()
print('=== beds (id, bed_number, status, current_patient_id) all ===')
for r in cur.execute('SELECT id, bed_number, status, current_patient_id FROM beds ORDER BY id'):
    print(' ', r)
conn.close()
