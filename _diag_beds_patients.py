import requests, json, sqlite3, os

BASE = 'http://127.0.0.1:8000'
DB_PATH = 'E:/AI-Healthcare-System-main/AI-Healthcare-System-main/healthcare.db'

def login(u, p):
    return requests.post(f'{BASE}/v1/token', data={'username': u, 'password': p}).json().get('access_token','')

def hdr(t):
    return {'Authorization': f'Bearer {t}'}

PAT = login('demo_patient', 'demo1234')
DOC = login('demo_doctor', 'demo1234')
ADM = login('admin', 'password123')

print('=== LIVE API: Patient detail visibility ===')
print()
# As doctor -> hospital/doctor/patients (no patient_id filter for doctor patients list)
r = requests.get(f'{BASE}/v1/hospital/doctor/patients', headers=hdr(DOC))
print('GET /v1/hospital/doctor/patients (doctor) status =', r.status_code)
try:
    print('   count =', len(r.json()))
    for p in r.json()[:3]:
        print('     ', p)
except Exception as e:
    print('   body =', r.text[:300])

print()
# As admin -> /admin/patients
r2 = requests.get(f'{BASE}/v1/admin/patients', headers=hdr(ADM))
print('GET /v1/admin/patients (admin) status =', r2.status_code)
try:
    data = r2.json()
    print('   count =', len(data))
    for p in data[:3]:
        print('     ', p)
except Exception as e:
    print('   body =', r2.text[:300])

print()
# As admin -> /admin/patients/{id}  (detail for demo_patient id=4)
r3 = requests.get(f'{BASE}/v1/admin/patients/4', headers=hdr(ADM))
print('GET /v1/admin/patients/4 (admin detail) status =', r3.status_code)
try:
    print('   ', json.dumps(r3.json()))
except Exception as e:
    print('   body =', r3.text[:400])

print()
print('=== LIVE API: Patient profile (self) ===')
r4 = requests.get(f'{BASE}/v1/profile', headers=hdr(PAT))
print('GET /v1/profile (demo_patient) status =', r4.status_code)
print('   ', r4.text[:400])

print()
print('=== LIVE API: Patient dashboard (demo_patient) ===')
r5 = requests.get(f'{BASE}/v1/intelligence/patient-dashboard', headers=hdr(PAT))
print('GET /v1/intelligence/patient-dashboard status =', r5.status_code)
try:
    d = r5.json()
    print('   keys =', list(d.keys()))
    print('   appointments =', d.get('appointments'))
    print('   prescriptions =', d.get('prescriptions'))
    print('   reports =', d.get('reports'))
except Exception as e:
    print('   body =', r5.text[:400])

print()
print('=== DB: audit_events table existence & bed-assignment audits ===')
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()
cols = [r[1] for r in cur.execute("PRAGMA table_info(audit_events)")]
print('audit_events columns:', cols)
print()
print('--- Bed-assignment / admission audit events ---')
try:
    for row in cur.execute(
        "SELECT id, actor_user_id, target_user_id, action, occurred_at, details FROM audit_events "
        "WHERE action LIKE '%BED%' OR action='CREATE_ADMISSION' OR action='UPDATE_BED_STATUS' "
        "ORDER BY id DESC LIMIT 30"
    ):
        print('  ', row)
except Exception as e:
    print('ERR audit query:', e)
print()
print('--- admissions ---')
for row in cur.execute(
    "SELECT id, facility_id, patient_id, doctor_id, department_id, bed_id, status, admitted_at FROM admissions ORDER BY id"
):
    print('  ', row)
print()
print('--- beds currently assigned to a patient ---')
for row in cur.execute(
    "SELECT id, bed_number, ward, status, current_patient_id FROM beds WHERE current_patient_id IS NOT NULL ORDER BY id"
):
    print('  ', row)
print()
print('--- admissions count by status ---')
for row in cur.execute("SELECT status, COUNT(*) FROM admissions GROUP BY status"):
    print('  ', row)
conn.close()
