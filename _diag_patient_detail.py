import requests, json

BASE = 'http://127.0.0.1:8000'
def login(u, p):
    r = requests.post(f'{BASE}/v1/token', data={'username': u, 'password': p})
    return r.json().get('access_token','')
def hdr(t): return {'Authorization': f'Bearer {t}'}

DOC = login('demo_doctor', 'demo1234')
PAT = login('demo_patient', 'demo1234')
ADM = login('admin', 'password123')

for label, token in [('doctor', DOC), ('patient', PAT), ('admin', ADM)]:
    for ep in ['/hospital/patients/4/current-case', '/predict/organ_health/4', '/admin/patients/4', '/profile']:
        r = requests.get(f'{BASE}/v1{ep}', headers=hdr(token))
        print(f'[{label}] GET {ep} -> {r.status_code}')
        if r.status_code != 200:
            print('     body:', r.text[:300])
    print()
