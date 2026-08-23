import json, urllib.request

# Test doctor dashboard
req = urllib.request.Request('http://127.0.0.1:8000/v1/intelligence/doctor-dashboard')
resp = urllib.request.urlopen(req)
data = json.loads(resp.read())
print('=== Doctor Dashboard ===')
print('High priority patients:', len(data.get('high_priority_patients', [])))
print('Abnormal lab alerts:', len(data.get('abnormal_lab_alerts', [])))
print('Medication safety alerts:', len(data.get('medication_safety_alerts', [])))
print('Pending AI reviews:', len(data.get('pending_ai_reviews', [])))
print('Patient risk overview:', len(data.get('patient_risk_overview', [])))
print()

# Test timeline for patient 4
req2 = urllib.request.Request('http://127.0.0.1:8000/v1/intelligence/timeline/4')
resp2 = urllib.request.urlopen(req2)
timeline = json.loads(resp2.read())
print('=== Timeline (patient 4) ===')
for t in timeline:
    print('  %s: %s (risk=%s)' % (t['event_type'], t['title'], t.get('risk_level')))

# Test risk overview
req3 = urllib.request.Request('http://127.0.0.1:8000/v1/intelligence/risk/4')
resp3 = urllib.request.urlopen(req3)
risk = json.loads(resp3.read())
print('\n=== Risk Overview (patient 4) ===')
print('Overall risk level:', risk.get('overall_risk_level'))
print('Recommended review:', risk.get('recommended_review_level'))
print('Number of risk categories:', len(risk.get('risks', [])))

# Test medication safety
req4 = urllib.request.Request('http://127.0.0.1:8000/v1/intelligence/medication-safety/4')
resp4 = urllib.request.urlopen(req4)
meds = json.loads(resp4.read())
print('\n=== Medication Safety (patient 4) ===')
print('Medications:', meds.get('medications'))
print('Overall level:', meds.get('overall_level'))
print('Requires clinician review:', meds.get('requires_clinician_review'))
print('Interactions:', len(meds.get('interactions', [])))
print('Contraindications:', len(meds.get('contraindications', [])))

# Test care gaps
req5 = urllib.request.Request('http://127.0.0.1:8000/v1/intelligence/care-gaps/4')
resp5 = urllib.request.urlopen(req5)
gaps = json.loads(resp5.read())
print('\n=== Care Gaps (patient 4) ===')
for g in gaps:
    print('  %s: %s severity=%s status=%s' % (g['gap_type'], g['title'], g['severity'], g['status']))

# Test clinical reviews
req6 = urllib.request.Request('http://127.0.0.1:8000/v1/intelligence/reviews/4')
resp6 = urllib.request.urlopen(req6)
reviews = json.loads(resp6.read())
print('\n=== Clinical Reviews (patient 4) ===')
for r in reviews:
    print('  ID=%d status=%s priority=%s decision=%s' % (r['id'], r['status'], r['priority'], r.get('final_decision')))

# Test agent runs
req7 = urllib.request.Request('http://127.0.0.1:8000/v1/intelligence/agent/runs/4')
resp7 = urllib.request.urlopen(req7)
agents = json.loads(resp7.read())
print('\n=== Agent Runs (patient 4) ===')
for a in agents:
    print('  %s: status=%s' % (a['agent_type'], a['status']))

# Test evidence
req8 = urllib.request.Request('http://127.0.0.1:8000/v1/intelligence/evidence/4')
resp8 = urllib.request.urlopen(req8)
evidence = json.loads(resp8.read())
print('\n=== Evidence (patient 4) ===')
for e in evidence:
    print('  %s: %s confidence=%s' % (e['evidence_type'], e['title'], e.get('confidence')))