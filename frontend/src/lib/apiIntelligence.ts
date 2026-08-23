/**
 * AI Healthcare Intelligence — Clinical Intelligence API
 *
 * Live alerts, patient insights, and ML explainability endpoints.
 */
import { apiFetch, API_BASE, authHeaders } from './apiCore';
import type { Prescription } from './apiAdmin';

// ── Types ────────────────────────────────────────────────────────
export interface ClinicalAlert {
  id: number;
  patient_id: number;
  alert_type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
  source_event_id: string | null;
  is_acknowledged: boolean;
  acknowledged_by: number | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface PatientInsight {
  id: number;
  patient_id: number;
  insight_type: string;
  content: Record<string, unknown>;
  model_version: string | null;
  created_at: string;
}

export interface ExplainabilityData {
  prediction_id: number;
  model_name: string;
  feature_importances: Record<string, number>;
  explanation_text: string;
}

// ── API Functions ────────────────────────────────────────────────
export function fetchAlerts(severity?: string): Promise<ClinicalAlert[]> {
  const qs = severity ? `?severity=${severity}` : '';
  return apiFetch(`/intelligence/alerts${qs}`);
}

export function acknowledgeAlert(alertId: number): Promise<{ message: string }> {
  return apiFetch(`/intelligence/alerts/${alertId}/acknowledge`, {
    method: 'POST',
  });
}

export function fetchPatientInsights(patientId: number): Promise<PatientInsight> {
  return apiFetch(`/intelligence/insights/${patientId}`);
}

export function fetchExplainability(predictionId: number): Promise<ExplainabilityData> {
  return apiFetch(`/intelligence/explainability/${predictionId}`);
}

export interface AdvisoryBoardDebate {
  status: string;
  patient_id: number;
  patient_vitals_context: string;
  debate: {
    round1: {
      cardiologist: string;
      endocrinologist: string;
    };
    round2: {
      cardiologist_rebuttal: string;
      endocrinologist_rebuttal: string;
    };
    round3: {
      coordinator_synthesis: {
        consensus_note: string;
        icd10_codes: string[];
        lifestyle_plan: string[];
        treatment_plan: string[];
      };
    };
  };
  telemetry: {
    duration_seconds: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost: number;
  };
}

export function fetchAdvisoryBoard(patientId: number): Promise<AdvisoryBoardDebate> {
  return apiFetch(`/predict/advisory-board/${patientId}`);
}

// ── Phase 10 Types & APIs ──────────────────────────────────────────

export interface ScribeSOAPNote {
  telemetry: {
    duration: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost: number;
  };
  data: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    icd10_codes: string[];
    billing_codes: string[];
    prescriptions: {
      medication_name: string;
      dosage: string;
      frequency: string;
      duration: string;
      quantity_prescribed: number;
    }[];
    billing_items: {
      description: string;
      amount: number;
    }[];
  };
}

export interface ClinicalTrialMatch {
  matches: {
    trial_id: string;
    title: string;
    match_percentage: number;
    eligible: boolean;
    reasons: string[];
    referral_letter: string;
  }[];
}

export interface CounterfactualRecourseData {
  baseline_risk: number;
  optimized_risk: number;
  recourse_recommendation: Record<string, number>;
  changes_applied: Record<string, string>;
}

export interface DrugSafetyAlert {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  evidence: string;
}

export interface DrugSafetyCheckResponse {
  telemetry: {
    duration: number;
    input_tokens: number;
    output_tokens: number;
    estimated_cost: number;
  };
  alerts: DrugSafetyAlert[];
}

export function generateScribeSOAP(patientId: number, transcript: string): Promise<ScribeSOAPNote> {
  return apiFetch(`/predict/scribe/${patientId}`, {
    method: 'POST',
    body: JSON.stringify({ transcript }),
  });
}

export function commitScribeSOAP(payload: {
  patient_id: number;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  icd10_codes: string[];
  billing_codes: string[];
  prescriptions: ScribeSOAPNote['data']['prescriptions'];
  billing_items: ScribeSOAPNote['data']['billing_items'];
}): Promise<{ status: string; message: string }> {
  return apiFetch(`/predict/scribe/commit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchClinicalTrials(patientId: number): Promise<ClinicalTrialMatch> {
  return apiFetch(`/predict/clinical-trials/${patientId}`);
}

export function fetchCounterfactualRecourse(
  patientId: number,
  targetModel: string,
  features: Record<string, number>
): Promise<CounterfactualRecourseData> {
  return apiFetch(`/predict/counterfactual/${patientId}`, {
    method: 'POST',
    body: JSON.stringify({ target_model: targetModel, features }),
  });
}

export function checkPrescribingSafety(payload: {
  patient_id: number;
  medication_name: string;
  dosage: string;
  frequency: string;
  duration: string;
  additional_allergies?: string[];
}): Promise<DrugSafetyCheckResponse> {
  return apiFetch(`/pharmacy/check-safety`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


// ── 10/10 Healthcare Itches Upgrade Helpers ─────────────────────

export function fetchMedicationPricing(medicationName: string): Promise<any> {
  return apiFetch(`/pharmacy/compare-pricing?medication_name=${encodeURIComponent(medicationName)}`);
}

export function fetchGenericSubstitution(brandedName: string): Promise<any> {
  return apiFetch(`/pharmacy/generic-substitute?branded_name=${encodeURIComponent(brandedName)}`);
}

export function fetchClinicalConsensus(patientId: number): Promise<any> {
  return apiFetch(`/predict/consensus/${patientId}`);
}

export function fetchTriageQueue(): Promise<any> {
  return apiFetch(`/hospital/triage-queue`);
}

export function fetchExternalRecords(patientId: number): Promise<any> {
  return apiFetch(`/interop/external-records/${patientId}`);
}

export function fetchHealthPassport(patientId: number): Promise<any> {
  return apiFetch(`/interop/health-passport/${patientId}`);
}

export function orderLabKit(payload: {
  patient_id: number;
  kit_type: string;
  shipping_address: string;
}): Promise<any> {
  return apiFetch(`/diagnostics/lab-kits`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchLabKits(patientId: number): Promise<any> {
  return apiFetch(`/diagnostics/lab-kits/${patientId}`);
}

export function bookSpecialCareAppointment(payload: {
  patient_id: number;
  doctor_id?: number;
  specialist: string;
  date_time: string;
  reason: string;
  request_female_clinician?: boolean;
  home_visit_van?: boolean;
}): Promise<any> {
  return apiFetch(`/appointments/special-care`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchRecommendedSpecialists(patientId: number): Promise<any> {
  return apiFetch(`/appointments/recommend-specialists/${patientId}`);
}

export function fetchProcedureCostEstimate(procedureType: string, insuranceProvider?: string, region?: string): Promise<any> {
  const providerParam = insuranceProvider ? `&insurance_provider=${encodeURIComponent(insuranceProvider)}` : '';
  const regionParam = region ? `&region=${encodeURIComponent(region)}` : '';
  return apiFetch(`/billing/estimate?procedure_type=${encodeURIComponent(procedureType)}${providerParam}${regionParam}`);
}

export async function uploadLabReportImage(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/report/analyze/report`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Upload failed with status ${res.status}`);
  }

  return res.json();
}

export function predictMultiOrgan(payload: any): Promise<any> {
  return apiFetch('/predict/multi-organ', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function predictStroke(payload: any): Promise<any> {
  return apiFetch('/predict/stroke', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── AI Healthcare Intelligence Platform (multi-agent) ─────────────

export type MedSafetySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface MedicationInteraction {
  medication_a: string;
  medication_b: string;
  severity: MedSafetySeverity;
  mechanism: string;
  verification: string;
}

export interface DuplicateTherapy {
  drug_class: string;
  medications: string[];
  severity: MedSafetySeverity;
  note: string;
  verification: string;
}

export interface MedicationContraindication {
  allergy: string;
  medication: string;
  severity: MedSafetySeverity;
  note: string;
  verification: string;
}

export interface DosageConcern {
  medication: string;
  severity: MedSafetySeverity;
  note: string;
  verification: string;
}

export interface MedicationSafetyResponse {
  patient_id: number;
  medications: string[];
  interactions: MedicationInteraction[];
  duplicate_therapies: DuplicateTherapy[];
  contraindications: MedicationContraindication[];
  dosage_concerns: DosageConcern[];
  overall_level: MedSafetySeverity;
  requires_clinician_review: boolean;
  disclaimer: string;
}

export function fetchMedicationSafety(patientId: number): Promise<MedicationSafetyResponse> {
  return apiFetch(`/intelligence/medication-safety/${patientId}`);
}

export interface RiskCategoryResult {
  risk_category: string;
  risk_level: string;
  score: number;
  confidence: number | null;
  contributing_factors: string[] | null;
  trend: string | null;
  reason: string | null;
  recommended_review_level: string | null;
  assessed_at: string;
}

export interface CareGapResult {
  id: number;
  patient_id?: number | null;
  gap_type: string;
  title: string;
  severity: string;
  status: string;
  description?: string | null;
  due_date?: string | null;
  detected_at: string;
}

export function fetchCareGaps(patientId: number): Promise<CareGapResult[]> {
  return apiFetch(`/intelligence/care-gaps/${patientId}`);
}

/* ── Platform intelligence endpoints (typed to backend schemas) ── */

export interface TimelineEvent {
  id: number;
  user_id: number;
  event_type: string;
  subtype?: string | null;
  title: string;
  description?: string | null;
  date_time: string;
  event_metadata?: Record<string, unknown> | null;
  risk_level?: string | null;
  requires_review: boolean;
}

export function fetchTimeline(patientId: number): Promise<TimelineEvent[]> {
  return apiFetch(`/intelligence/timeline/${patientId}`);
}

export interface RiskAssessment {
  id: number;
  user_id: number;
  risk_category: string;
  risk_level: string;
  score: number;
  confidence?: number | null;
  contributing_factors?: string[] | null;
  trend?: string | null;
  reason?: string | null;
  recommended_review_level?: string | null;
  assessed_at: string;
}

export interface RiskOverview {
  patient_id: number;
  generated_at: string;
  risks: RiskAssessment[];
  safety_events: Array<Record<string, unknown>>;
  overall_risk_level: string;
  recommended_review_level: string;
  summary: string;
}

export function fetchRiskOverview(patientId: number): Promise<RiskOverview> {
  return apiFetch(`/intelligence/risk/${patientId}`);
}

export interface PatientIntelligenceProfile {
  patient_id: number;
  generated_at: string;
  overview: Record<string, unknown>;
  current_conditions: string[];
  active_medications: string[];
  allergies: string[];
  recent_labs: Array<Record<string, unknown>>;
  imaging: Array<Record<string, unknown>>;
  risk_indicators: Array<Record<string, unknown>>;
  recent_encounters: Array<Record<string, unknown>>;
  long_term_trends: unknown[];
  care_gaps: CareGapResult[];
  upcoming_followups: Array<Record<string, unknown>>;
  ai_summary?: string | null;
  ai_confidence?: number | null;
  doctor_notes?: string | null;
}

export function fetchPatientProfile(patientId: number): Promise<PatientIntelligenceProfile> {
  return apiFetch(`/intelligence/patient-profile/${patientId}`);
}

export interface AgentFinding {
  id: number;
  agent_run_id: number;
  category: string;
  title: string;
  description?: string | null;
  confidence?: number | null;
  evidence_source?: string | null;
  is_conflicting: boolean;
}

export interface AgentRun {
  id: number;
  user_id: number;
  agent_type: string;
  patient_id?: number | null;
  status: string;
  input_query?: string | null;
  output_summary?: string | null;
  output_details?: Record<string, unknown> | null;
  execution_time_ms?: number | null;
  started_at: string;
  completed_at?: string | null;
  findings: AgentFinding[];
}

export function fetchAgentRuns(patientId: number): Promise<AgentRun[]> {
  return apiFetch(`/intelligence/agent/runs/${patientId}`);
}

export function runAgent(payload: {
  agent_type: string;
  patient_id?: number | null;
  input_query?: string | null;
}): Promise<AgentRun> {
  return apiFetch(`/intelligence/agent/run`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface EvidenceReference {
  id: number;
  user_id: number;
  evidence_type: string;
  title: string;
  source?: string | null;
  citation?: string | null;
  relevance_score?: number | null;
  confidence?: number | null;
  status: string;
  extraction_date?: string | null;
}

export function fetchEvidence(patientId: number): Promise<EvidenceReference[]> {
  return apiFetch(`/intelligence/evidence/${patientId}`);
}

export interface ClinicalReview {
  id: number;
  user_id: number;
  patient_id: number;
  ai_run_id?: number | null;
  ai_summary?: string | null;
  ai_evidence?: string | null;
  ai_risk_level?: string | null;
  ai_confidence?: number | null;
  status: string;
  priority: string;
  reviewer_notes?: string | null;
  final_decision?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export function fetchReviews(patientId: number): Promise<ClinicalReview[]> {
  return apiFetch(`/intelligence/reviews/${patientId}`);
}

export function updateReview(
  reviewId: number,
  payload: { status?: string; reviewer_notes?: string; final_decision?: string },
): Promise<ClinicalReview> {
  return apiFetch(`/intelligence/review/${reviewId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export interface DoctorDashboard {
  generated_at: string;
  high_priority_patients: Array<Record<string, unknown>>;
  abnormal_lab_alerts: Array<Record<string, unknown>>;
  recent_patient_changes: Array<Record<string, unknown>>;
  medication_safety_alerts: Array<Record<string, unknown>>;
  pending_ai_reviews: Array<Record<string, unknown>>;
  unresolved_ai_conflicts: Array<Record<string, unknown>>;
  upcoming_appointments: Array<Record<string, unknown>>;
  report_review_queue: Array<Record<string, unknown>>;
  patient_risk_overview: Array<Record<string, unknown>>;
}

export function fetchDoctorDashboard(): Promise<DoctorDashboard> {
  return apiFetch(`/intelligence/doctor-dashboard`);
}

export interface ReportComparison {
  id: number;
  user_id: number;
  report_a_id: number;
  report_b_id: number;
  status: string;
  created_at: string;
  completed_at?: string | null;
  what_changed: { items: Array<Record<string, unknown>>; summary: string };
  what_stayed_stable: { items: Array<Record<string, unknown>>; summary: string };
  what_became_abnormal: { items: Array<Record<string, unknown>>; summary: string };
  what_improved: { items: Array<Record<string, unknown>>; summary: string };
  what_worsened: { items: Array<Record<string, unknown>>; summary: string };
  requires_clinician_attention: boolean;
  risk_trend?: string | null;
  overall_risk_score?: number | null;
}

export function fetchReportComparisons(): Promise<ReportComparison[]> {
  return apiFetch(`/intelligence/report-comparisons`);
}

export function createReportComparison(payload: {
  report_a_id: number;
  report_b_id: number;
  notes?: string;
}): Promise<ReportComparison> {
  return apiFetch(`/intelligence/report-comparison`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


// ── Aggregate longitudinal timeline ──────────────────────────────

export type TimelineCategory =
  | 'encounter'
  | 'diagnosis'
  | 'medication'
  | 'lab'
  | 'vital'
  | 'report'
  | 'risk'
  | 'safety'
  | 'care_gap'
  | 'review'
  | 'appointment';

export interface AggregatedTimelineItem {
  id: string;
  source: string;
  category: TimelineCategory;
  title: string;
  description?: string | null;
  date_time: string;
  risk_level?: string | null;
  requires_review: boolean;
  status?: string | null;
  metadata?: Record<string, unknown>;
  patient_summary?: string | null;
  link?: string | null;
}

export interface AggregatedTimelineResponse {
  patient_id: number;
  generated_at: string;
  total: number;
  categories: TimelineCategory[];
  items: AggregatedTimelineItem[];
}

export interface AggregateTimelineParams {
  categories?: TimelineCategory[];
  days?: number;
  start?: string;
  end?: string;
  limit?: number;
}

export function fetchAggregateTimeline(
  patientId: number,
  params: AggregateTimelineParams = {},
): Promise<AggregatedTimelineResponse> {
  const qs = new URLSearchParams();
  if (params.categories?.length) qs.set('categories', params.categories.join(','));
  if (params.days != null) qs.set('days', String(params.days));
  if (params.start) qs.set('start', params.start);
  if (params.end) qs.set('end', params.end);
  if (params.limit != null) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetch(`/intelligence/timeline/${patientId}/aggregate${q ? `?${q}` : ''}`);
}


// ── Report workflow (real, persisted pipeline) ──────────────────

export type ReportStatus =
  | 'uploaded'
  | 'extracting'
  | 'extracted'
  | 'analyzing'
  | 'analyzed'
  | 'comparing'
  | 'compared'
  | 'verifying'
  | 'completed'
  | 'failed';

export interface ReportStageEntry {
  stage: string;
  at: string;
  detail?: string | null;
}

export interface AbnormalFinding {
  marker: string;
  value?: number | null;
  severity: string;
  message?: string;
  ref?: string;
}

export interface ReportAnalysisResponse {
  id: number;
  patient_id: number;
  uploaded_by?: number | null;
  file_name: string;
  content_type?: string | null;
  file_size?: number | null;
  source: string;
  status: ReportStatus;
  stage_history: ReportStageEntry[];
  error_detail?: string | null;
  extracted_values: Record<string, number>;
  abnormal_findings: AbnormalFinding[];
  summary?: string | null;
  requires_clinician_review: boolean;
  health_record_id?: number | null;
  comparison_id?: number | null;
  review_id?: number | null;
  created_at: string;
  updated_at?: string | null;
  completed_at?: string | null;
  disclaimer?: string;
}

export interface ReportListItem {
  id: number;
  file_name: string;
  status: ReportStatus;
  source: string;
  abnormal_count: number;
  requires_clinician_review: boolean;
  health_record_id?: number | null;
  comparison_id?: number | null;
  created_at: string;
  completed_at?: string | null;
}

export type ReportStage = 'extract' | 'analyze' | 'compare' | 'verify';

export async function uploadReport(file: File, patientId?: number): Promise<ReportAnalysisResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (patientId != null) formData.append('patient_id', String(patientId));

  const res = await fetch(`${API_BASE}/intelligence/reports/upload`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Upload failed with status ${res.status}`);
  }
  return res.json();
}

export function runReportStage(analysisId: number, stage: ReportStage): Promise<ReportAnalysisResponse> {
  return apiFetch(`/intelligence/reports/${analysisId}/${stage}`, { method: 'POST' });
}

export function fetchReportList(patientId: number, limit = 50): Promise<ReportListItem[]> {
  return apiFetch(`/intelligence/reports/patient/${patientId}?limit=${limit}`);
}

export function fetchReportAnalysis(analysisId: number): Promise<ReportAnalysisResponse> {
  return apiFetch(`/intelligence/reports/${analysisId}`);
}


// ── Care-gap state transition ───────────────────────────────────

export type CareGapStatus = 'detected' | 'in_review' | 'escalated' | 'resolved';

export interface CareGapQueueItem {
  id: number;
  patient_id: number;
  patient_label: string;
  gap_type: string;
  title: string;
  description?: string | null;
  severity: string;
  status: CareGapStatus;
  resolution_notes?: string | null;
  detected_at: string;
  resolved_at?: string | null;
}

export function updateCareGapStatus(
  gapId: number,
  status: CareGapStatus,
  resolutionNotes?: string,
): Promise<CareGapQueueItem> {
  return apiFetch(`/intelligence/care-gap/${gapId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, resolution_notes: resolutionNotes }),
  });
}

export function fetchCareGapQueue(status?: string, limit = 200): Promise<CareGapQueueItem[]> {
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  qs.set('limit', String(limit));
  return apiFetch(`/intelligence/care-gap-queue?${qs.toString()}`);
}


// ── Clinical review actions & detail ────────────────────────────

export type ReviewActionType =
  | 'start_review'
  | 'approve'
  | 'reject'
  | 'request_follow_up'
  | 'add_note';

export interface ReviewAgentOpinion {
  specialist: string;
  interpretation: string;
  evidence: string[];
  confidence: number;
  concerns: string[];
}

export interface ReviewQueueItem {
  id: number;
  patient_id: number;
  patient_label: string;
  status: string;
  priority: string;
  ai_summary?: string | null;
  ai_risk_level?: string | null;
  ai_confidence?: number | null;
  final_decision?: string | null;
  reviewer_notes?: string | null;
  created_at: string;
  reviewed_at?: string | null;
}

export interface ClinicalReviewDetail {
  id: number;
  patient_id: number;
  patient_label: string;
  status: string;
  priority: string;
  ai_summary?: string | null;
  ai_evidence?: string | null;
  ai_risk_level?: string | null;
  ai_confidence?: number | null;
  ai_opinions: ReviewAgentOpinion[];
  ai_conflicts: Record<string, unknown>[];
  reviewer_notes?: string | null;
  final_decision?: string | null;
  created_at: string;
  reviewed_at?: string | null;
  linked_findings: Array<{
    id: number | string;
    category: string;
    title: string;
    description?: string | null;
    confidence?: number | null;
    evidence_source?: string | null;
    is_conflicting: boolean;
  }>;
  evidence_references: Array<{
    id: number;
    title: string;
    evidence_type: string;
    source?: string | null;
    citation?: string | null;
    status: string;
    confidence?: number | null;
  }>;
  risk_snapshot: {
    overall_risk_level: string;
    recommended_review_level: string;
    categories: Array<{ risk_category: string; risk_level: string; score: number }>;
    uncertainty?: string;
  };
  disclaimer?: string;
}

export function submitReviewAction(
  reviewId: number,
  action: ReviewActionType,
  note?: string,
): Promise<ClinicalReviewDetail> {
  return apiFetch(`/intelligence/review/${reviewId}/action`, {
    method: 'POST',
    body: JSON.stringify({ action, note }),
  });
}

export function fetchReviewQueue(status?: string, limit = 200): Promise<ReviewQueueItem[]> {
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  qs.set('limit', String(limit));
  return apiFetch(`/intelligence/review-queue?${qs.toString()}`);
}

export function fetchReviewDetail(reviewId: number): Promise<ClinicalReviewDetail> {
  return apiFetch(`/intelligence/review/${reviewId}`);
}


// ── Demo readiness (synthetic data availability) ────────────────

export interface DemoReadiness {
  status: string;
  demo_mode: boolean;
  environment: string;
  required: Record<string, unknown>;
  optional: Record<string, unknown>;
  missing_required: string[];
  capabilities: Record<string, boolean>;
  clinical_safety_note?: string;
  privacy_note?: string;
  source: string;
}

export async function fetchDemoReadiness(): Promise<DemoReadiness> {
  return apiFetch('/demo-readiness/');
}


// ── Patient Dashboard (aggregated) ─────────────────────────────────

export interface DashboardAppointment {
  id: number;
  facility_id?: number | null;
  user_id: number;
  doctor_id?: number | null;
  specialist: string;
  date_time: string;
  reason: string;
  status: string;
}

export interface PatientDashboardResponse {
  patient_id: number;
  generated_at: string;
  profile: PatientIntelligenceProfile;
  prescriptions: Prescription[];
  appointments: DashboardAppointment[];
  reports: ReportListItem[];
  alerts: ClinicalAlert[];
  care_gaps: CareGapResult[];
  risk_overview: RiskOverview;
  timeline: TimelineEvent[];
}

export function fetchPatientDashboard(): Promise<PatientDashboardResponse> {
  return apiFetch('/intelligence/patient-dashboard');
}





