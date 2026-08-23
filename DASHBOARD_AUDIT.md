# Dashboard Audit Report

## Current Dashboard Analysis (Dashboard.tsx - 2021 lines)

### Current Structure
| Section | Data Source | API | Component | Current State | Mock/Real | Status |
|---------|-------------|-----|-----------|---------------|-----------|--------|
| System Ribbon | `getDemoReadiness`, `useTelemetry` | `/demo-readiness/`, WS | Inline | Working | Mixed | 🟡 Partial |
| Header | `useAuthStore` | - | Inline | Working | Real user | ✅ Working |
| Zero Learning Curve Guide | Hardcoded | - | Inline | Decorative | **MOCK** | 🔴 Blocked |
| Aggregated Stats (4 cards) | `telemetry`, `records` | `/admin/operations` (via telemetry) | Inline | Working | Mixed | 🟡 Partial |
| Triage Overview | `beds` state, `telemetry` | - | Inline | **Hardcoded beds** | **MOCK** | 🔴 Blocked |
| Clinical Telemetry Grid (6 beds) | `beds` state + WS | WS `/v1/telemetry/vitals/:id` | `LiveECGMonitor` | **Simulated vitals** | **MOCK** | 🔴 Blocked |
| Risk Trajectory Chart | `records` (health records) | `/chat/records` | `RiskTrajectoryChart` | Working | Real records | ✅ Working |
| Live Diagnostic Stream | `records` | `/chat/records` | Inline | Working | Real records | ✅ Working |
| Operations Cockpit | `getAdminOperationsCockpit` | `/admin/operations` | `OperationsCockpit` | Admin only | Real | ✅ Working |
| Department Load | `telemetry.department_loads` | - | Inline | **Hardcoded fallback** | **MOCK** | 🔴 Blocked |
| Patient Profile Modal | `patientProfiles` const | - | Inline + tabs | **Hardcoded profiles** | **MOCK** | 🔴 Blocked |

### Critical Issues Found
1. **Hardcoded Clinical Data**: `patientProfiles` (4 patients), `beds` array (6 beds) with fake vitals
2. **Simulated Real-time**: `setInterval` with `Math.random()` generating fake vitals every 4 seconds
3. **No Clinical Workflow Data**: Missing alerts, care gaps, reviews, reports queues
4. **No Risk Engine Integration**: Not using `/intelligence/risk` or `/intelligence/doctor-dashboard`
5. **Demo Mode Not Indicated**: No "DEMO MODE / SYNTHETIC DATA" banner when using synthetic data
5. **Patient Context Broken**: Clicking patient opens modal, doesn't update global context + navigate to PatientDetail
6. **Missing Loading/Error/Empty States**: Most sections lack proper states

---

## Required Dashboard Structure (Clinical Command Center)

```
HEADER
├── Greeting + Role + Time
├── Demo Mode Indicator (if applicable)
├── Global Search
├── Notifications
└── Patient Picker (if appropriate)

CLINICAL SUMMARY
├── "Good morning, Dr. [Name]"
├── "AI-assisted clinical overview for [date]"
└── Key context: active patients, shift info

PRIORITY METRICS (from /intelligence/doctor-dashboard)
├── Patients Monitored
├── High-Risk Patients
├── Reports Awaiting Review
├── Medication Safety Alerts
├── Care Gaps
├── Pending Clinical Reviews
└── (each with real API data, trend if available)

REQUIRES ATTENTION (most important)
├── Critical Clinical Alerts (/intelligence/alerts)
├── Medication Safety Issues (/intelligence/medication-safety)
├── Unresolved Abnormal Reports (/intelligence/reports)
├── Pending Clinical Reviews (/intelligence/review-queue)
├── Overdue Follow-ups (care gaps)
└── Meaningful Patient Changes (timeline changes)

HIGH-PRIORITY PATIENTS
├── Patient | Risk | Latest Change | Alert | Last Encounter | Action
├── Click → updates global context → navigates to PatientDetail
└── From /intelligence/doctor-dashboard high_priority_patients

CLINICAL RISK OVERVIEW
├── Cardiovascular | Level | Trend | Confidence | Review Required
├── Diabetes | Level | Trend | Confidence | Review Required
├── Kidney | Level | Trend | Confidence | Review Required
├── Liver | Level | Trend | Confidence | Review Required
├── Medication | Level | Trend | Confidence | Review Required
├── Abnormal Lab | Level | Trend | Confidence | Review Required
└── Deterioration | Level | Trend | Confidence | Review Required
(Data from /intelligence/risk for each high-priority patient)

RECENT CLINICAL ACTIVITY
├── Report Analyzed
├── Medication Safety Detected
├── Clinical Review Approved
├── Risk Changed
├── Care Gap Detected
├── Appointment Updated
└── Patient Event Recorded
(From /intelligence/timeline aggregate)

REPORTS / REVIEWS / CARE GAPS
├── Reports Awaiting Review (queue)
├── Clinical Reviews Pending (queue)
├── Care Gaps Requiring Action (queue)
└── Each with: Patient | Issue | Priority | Age | Action

HEALTH TRENDS (where historical data exists)
├── Risk Trends (from RiskAssessment history)
├── Lab Trends (from timeline)
├── Patient Activity
├── Report Activity
└── Care Gap Trends
(Show "Not enough historical data" if insufficient)

AI / AGENT STATUS
├── Active/Complete Agent Runs
├── Latest Finding
├── Confidence
├── Evidence
├── Clinical Review Status
└── Navigate to Clinical Intelligence
(From /intelligence/agent/runs)

QUICK ACTIONS
├── View Patients → /patients
├── Upload Report → /reports (upload)
├── Clinical Intelligence → /intelligence
├── Review Alerts → /notifications
├── Open Care Gaps → /care-gaps
├── Clinical Reviews → /reviews
└── AI Chat → /chat
```

---

## Available Backend APIs for Real Data

| API Endpoint | Purpose | Returns |
|--------------|---------|---------|
| `GET /intelligence/doctor-dashboard` | Aggregated clinician dashboard | High-priority patients, abnormal labs, med safety, pending reviews, appointments, risk overview |
| `GET /intelligence/alerts?severity=CRITICAL` | Clinical alerts | List of alerts with patient, type, severity, message |
| `GET /intelligence/care-gap-queue` | All care gaps queue | Care gaps with patient, type, severity, status |
| `GET /intelligence/review-queue` | All clinical reviews queue | Reviews with patient, priority, AI risk, status |
| `GET /intelligence/risk/{patientId}` | Multi-category risk | Risk assessments per category + overall |
| `GET /intelligence/timeline/{patientId}/aggregate` | Aggregated timeline | Unified clinical events across sources |
| `GET /intelligence/medication-safety/{patientId}` | Med safety screening | Interactions, duplicates, contraindications, dosage concerns |
| `GET /intelligence/reports/patient/{patientId}` | Report analyses | Reports with status, abnormal findings, review flags |
| `GET /intelligence/agent/runs/{patientId}` | Agent run history | Agent runs with findings, status, output |
| `GET /admin/operations` | Hospital ops metrics | Census, beds, encounters, orders |
| `GET /monitoring/admin/patterns` | Monitoring metrics | Vital observations, signals, Spark info |
| `GET /diagnostics/admin/metrics` | Diagnostics metrics | Results, pending review, abnormal |
| `GET /pharmacy/admin/metrics` | Pharmacy metrics | Inventory, prescriptions, dispensed |
| `GET /discharge/admin/metrics` | Discharge metrics | Summaries draft/finalized |
| `GET /nursing/admin/metrics` | Nursing metrics | Tasks, overdue |
| `GET /events/admin/metrics` | Care events metrics | Events by severity |

---

## Implementation Plan

### Phase 1: Cleanup & Data Layer (Week 1)
- [ ] Remove `patientProfiles` constant (lines 34-114)
- [ ] Remove `beds` hardcoded state (lines 199-260)
- [ ] Remove simulated vitals interval (lines 533-567)
- [ ] Remove hardcoded `department_loads` fallback (lines 1281-1286)
- [ ] Create dashboard-specific hooks for each data domain
- [ ] Add demo mode detection from `/demo-readiness/`

### Phase 2: Header & Priority Metrics (Week 1)
- [ ] Build professional header with greeting, demo indicator, search, notifications
- [ ] Fetch `/intelligence/doctor-dashboard` for priority metrics
- [ ] Create MetricCard components for each metric
- [ ] Implement loading/error/empty states

### Phase 3: Requires Attention & High-Priority Patients (Week 1-2)
- [ ] Build Requires Attention section combining alerts, med safety, abnormal reports, reviews
- [ ] Create High-Priority Patients table from doctor-dashboard
- [ ] Implement patient click → global context + navigate

### Phase 4: Risk Overview & Clinical Activity (Week 2)
- [ ] Build Clinical Risk Overview using `/intelligence/risk` for top patients
- [ ] Create Recent Clinical Activity from aggregated timeline
- [ ] Add horizontal risk indicators (not circular dashboards)

### Phase 5: Workflow Queues & Trends (Week 2)
- [ ] Build Reports/Reviews/Care Gaps compact queues
- [ ] Add Health Trends section with "insufficient data" handling
- [ ] Create AI/Agent Status section

### Phase 6: Quick Actions & Polish (Week 2)
- [ ] Build clinical Quick Actions
- [ ] Responsive design audit
- [ ] Accessibility audit
- [ ] Performance optimization (deduplicate API calls)

### Phase 7: Testing & Validation (Week 2)
- [ ] Run build, lint, tests
- [ ] Live browser testing with admin login
- [ ] Final visual audit
- [ ] Document remaining limitations

---

## Components to Reuse from Design System
- `PageHeader` - for main header
- `Card` / `Panel` - for section containers
- `MetricCard` - for priority metrics
- `Badge` / `SeverityBadge` - for status indicators
- `Skeleton` - for loading states
- `EmptyState` - for empty queues
- `ErrorState` - for API failures
- `Button` - for actions
- `Table` patterns - for patient lists

---

## APIs to Add to apiIntelligence.ts (if missing)
- ✅ `fetchDoctorDashboard` - already exists (line 562)
- ✅ `fetchAlerts` - already exists (line 39)
- ✅ `fetchCareGapQueue` - already exists (line 787)
- ✅ `fetchReviewQueue` - already exists (line 881)
- ✅ `fetchRiskOverview` - already exists (line 433)
- ✅ `fetchAggregateTimeline` - already exists (line 646)
- ✅ `fetchMedicationSafety` - already exists (line 358)
- ✅ `fetchReportList` - already exists (line 749)
- ✅ `fetchAgentRuns` - already exists (line 486)
- ✅ `fetchDemoReadiness` - already exists (line 908)

All required APIs are already available!

---

## Mock Data Removal Checklist
- [ ] `patientProfiles` constant (lines 34-114) → REMOVE
- [ ] `beds` state array (lines 199-260) → REMOVE, replace with real patient census
- [ ] Simulated vitals interval (lines 533-567) → REMOVE
- [ ] Hardcoded `department_loads` fallback (lines 1281-1286) → REMOVE, use telemetry or hide
- [ ] Static `displayChartData` fallback (lines 583-587) → REMOVE, show empty state
- [ ] Hardcoded risk values in patient profile modal → REMOVE
- [ ] Hardcoded alarm codes (SYS_ALARM_TACHY) → REMOVE, use real monitoring signals
- [ ] Simulated HL7 messages → REMOVE