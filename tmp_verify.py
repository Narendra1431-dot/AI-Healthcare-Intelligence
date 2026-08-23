import requests, json

BASE = "http://127.0.0.1:8000"

def login(user, pw):
    r = requests.post(f"{BASE}/v1/token", data={"username": user, "password": ps})
    return r.json()["access_token"]

import sys

def login2(user, pw):
    r = requests.post(f"{BASE}/v1/token", data={"username": user, "password": pw})
    return r.json().get("access_token", "")

DOC = login2("demo_doctor", "demo1234")
PAT = login2("demo_patient", "demo1234")
ADM = login2("admin", "password123")

def hdr(tok):
    return {"Authorization": f"Bearer {tok}"}

def get(path, tok):
    r = requests.get(f"{BASE}{path}", headers=hdr(tok))
    return r

print("=== DOCTOR DASHBOARD ===")
r = get("/v1/intelligence/doctor-dashboard", DOC)
d = r.json()
print(f"  status={r.status_code} high_priority_patients={len(d.get('high_priority_patients',[]))} abnormal_labs={len(d.get('abnormal_lab_alerts',[]))} med_alerts={len(d.get('medication_safety_alerts',[]))} pending_reviews={len(d.get('pending_ai_reviews',[]))} risk_overview={len(d.get('patient_risk_overview',[]))}")

print("=== DOCTOR PROFILE ===")
r = get("/v1/profile", DOC)
print(f"  status={r.status_code} role={r.json().get('role')}")

print("=== RISK OVERVIEW (patient 4) ===")
r = get("/v1/intelligence/risk/4", DOC)
d = r.json()
print(f"  status={r.status_code} overall={d.get('overall_risk_level')} risks={len(d.get('risks',[]))}")

print("=== CARE GAPS (patient 4) ===")
r = get("/v1/intelligence/care-gaps/4", DOC)
d = r.json()
print(f"  status={r.status_code} count={len(d)}")

print("=== TIMELINE (patient 4) ===")
r = get("/v1/intelligence/timeline/4", DOC)
d = r.json()
print(f"  status={r.status_code} count={len(d)}")

print("=== AGGREGATE TIMELINE (patient 4) ===")
r = get("/v1/intelligence/timeline/4/aggregate", DOC)
d = r.json()
print(f"  status={r.status_code} total={d.get('total')} categories={d.get('categories')}")

print("=== AGENT RUNS (patient 4) ===")
r = get("/v1/intelligence/agent/runs/4", DOC)
d = r.json()
print(f"  status={r.status_code} count={len(d)}")

print("=== EVIDENCE (patient 4) ===")
r = get("/v1/intelligence/evidence/4", DOC)
d = r.json()
print(f"  status={r.status_code} count={len(d)}")

print("=== REVIEWS (patient 4) ===")
r = get("/v1/intelligence/reviews/4", DOC)
d = r.json()
print(f"  status={r.status_code} count={len(d)}")

print("=== REPORT COMPARISONS ===")
r = get("/v1/intelligence/report-comparisons", DOC)
d = r.json()
print(f"  status={r.status_code} count={len(d)}")

print("=== REPORTS LIST (patient 4) ===")
r = get("/v1/intelligence/reports/patient/4?limit=50", DOC)
d = r.json()
print(f"  status={r.status_code} count={len(d)}")

print("=== MEDICATION SAFETY (patient 4) ===")
r = get("/v1/intelligence/medication-safety/4", DOC)
d = r.json()
print(f"  status={r.status_code} overall_level={d.get('overall_level')} interactions={len(d.get('interactions',[]))}")

print("=== PATIENT PROFILE (patient 4) ===")
r = get("/v1/intelligence/patient-profile/4", DOC)
d = r.json()
print(f"  status={r.status_code} conditions={len(d.get('current_conditions',[]))} meds={len(d.get('active_medications',[]))}")

print("=== PATIENT DASHBOARD (patient) ===")
r = get("/v1/intelligence/patient-dashboard", PAT)
d = r.json()
print(f"  status={r.status_code} appts={len(d.get('appointments',[]))} reports={len(d.get('reports',[]))} meds={len(d.get('prescriptions',[]))}")

print("=== PATIENTS LIST ===")
r = get("/v1/patients", DOC)
d = r.json()
print(f"  status={r.status_code} count={len(d)}")

print("=== APPOINTMENTS ===")
r = get("/v1/appointments", DOC)
d = r.json()
print(f"  status={r.status_code} count={len(d)}")

print("=== HOSPITAL BEDS ===")
r = get("/v1/hospital/beds", DOC)
d = r.json()
print(f"  status={r.status_code} count={len(d)}")

print("=== HOSPITAL DEPARTMENTS ===")
r = get("/v1/hospital/departments", DOC)
d = r.json()
print(f"  status={r.status_code} count={len(d)}")

print("=== DEMO READINESS ===")
r = get("/v1/demo-readiness/", DOC)
d = r.json()
print(f"  status={r.status_code} demo_mode={d.get('demo_mode')} status={d.get('status')}")
