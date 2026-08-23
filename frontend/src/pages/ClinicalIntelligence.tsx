/**
 * Clinical Intelligence — flagship clinician workspace.
 *
 * Builds one coherent, real-data clinical narrative for the selected patient
 * from the backend intelligence platform:
 *
 *   Current status → Recent changes → Risk → Medication safety →
 *   Agent findings → Evidence → Care gaps → Review requirement
 *
 * Every value is sourced from a real backend API. No hardcoded clinical
 * scores, findings, or patient values. The selected patient is the single
 * shared global context so it persists across every other clinical page.
 */
import React from 'react';
import {
  Activity, ShieldAlert, Pill, Bot, Microscope, ClipboardList, CheckSquare,
  ListChecks, AlertTriangle, TrendingUp, TrendingDown, Minus, Users, Stethoscope,
  FileText, HeartPulse, RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PatientPicker } from '@/components/PatientPicker';
import { useClinicianPatient } from '@/lib/patientContext';
import { useAsync } from '@/lib/useAsync';
import { toast } from '@/lib/toast';
import {
  fetchPatientProfile, fetchRiskOverview, fetchAggregateTimeline, fetchMedicationSafety,
  fetchCareGaps, fetchAgentRuns, fetchEvidence, fetchReviews,
  type PatientIntelligenceProfile, type RiskOverview, type AggregatedTimelineResponse,
  type MedicationSafetyResponse, type CareGapResult, type AgentRun, type EvidenceReference,
  type ClinicalReview, type TimelineCategory,
} from '@/lib/apiIntelligence';
import {
  PageHeader, Card, Badge, SeverityBadge, EmptyState, ErrorState, Spinner, Disclaimer, Button, Avatar,
} from '@/components/ui';

const levelColor: Record<string, string> = {
  low: 'var(--success)', medium: 'var(--warning)', high: 'var(--danger)', critical: 'var(--danger)',
};
const levelTone = (l: string) =>
  l === 'high' || l === 'critical' ? 'danger' : l === 'medium' ? 'warning' : 'success';

const CATEGORY_META: Record<TimelineCategory, { label: string; color: string }> = {
  encounter: { label: 'Encounter', color: 'var(--accent)' },
  diagnosis: { label: 'Diagnosis', color: 'var(--accent)' },
  medication: { label: 'Medication', color: 'var(--info)' },
  lab: { label: 'Lab', color: 'var(--info)' },
  vital: { label: 'Vital', color: 'var(--success)' },
  report: { label: 'Report', color: 'var(--warning)' },
  risk: { label: 'Risk', color: 'var(--danger)' },
  safety: { label: 'Safety', color: 'var(--danger)' },
  care_gap: { label: 'Care gap', color: 'var(--warning)' },
  review: { label: 'Review', color: 'var(--accent)' },
  appointment: { label: 'Appointment', color: 'var(--info)' },
};

export default function ClinicalIntelligence() {
  const [patient, setPatient] = useClinicianPatient();
  const { data, loading, error, refetch } = useAsync(async () => {
    if (!patient) return null;
    const pid = patient.patient_id;
    const [profile, risk, timeline, meds, gaps, agents, evidence, reviews] = await Promise.all([
      fetchPatientProfile(pid).catch(() => null),
      fetchRiskOverview(pid).catch(() => null),
      fetchAggregateTimeline(pid, { limit: 80 }).catch(() => null),
      fetchMedicationSafety(pid).catch(() => null),
      fetchCareGaps(pid).catch(() => [] as CareGapResult[]),
      fetchAgentRuns(pid).catch(() => [] as AgentRun[]),
      fetchEvidence(pid).catch(() => [] as EvidenceReference[]),
      fetchReviews(pid).catch(() => [] as ClinicalReview[]),
    ]);
    return { profile, risk, timeline, meds, gaps, agents, evidence, reviews };
  }, [patient?.patient_id]);

  return (
    <div>
      <PageHeader
        icon={<Activity size={20} />}
        title="Clinical Intelligence"
        subtitle="A real-data narrative across risk, medications, agents, evidence, care gaps, and review."
        actions={
          <div className="flex items-center gap-2">
            {patient?.demo && <Badge tone="warning">DEMO MODE · SYNTHETIC DATA</Badge>}
            <PatientPicker value={patient?.patient_id} onSelect={setPatient} />
          </div>
        }
      />
      <Disclaimer compact className="mb-5" />

      {!patient && (
        <Card className="p-5">
          <EmptyState icon={<Activity size={22} />} title="Select a patient"
            description="Choose a patient to build their clinical intelligence narrative." />
        </Card>
      )}

      {patient && loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {patient && error && <ErrorState onRetry={refetch} />}

      {patient && data && (
        <div className="space-y-6">
          <CurrentStatus profile={data.profile} risk={data.risk} meds={data.meds} patientId={patient.patient_id} />

          <Section icon={<ListChecks size={16} />} title="Recent changes" subtitle="Chronological longitudinal timeline">
            <TimelineNarrative timeline={data.timeline} />
          </Section>

          <Section icon={<HeartPulse size={16} />} title="Risk" subtitle="Multi-domain risk assessment">
            {data.risk ? <RiskNarrative risk={data.risk} patientId={patient.patient_id} /> : <EmptyState title="No risk data" />}
          </Section>

          <Section icon={<Pill size={16} />} title="Medication safety" subtitle="Interactions, contraindications, dosage review">
            {data.meds ? <MedNarrative meds={data.meds} /> : <EmptyState title="No medication-safety data" />}
          </Section>

          <Section icon={<Bot size={16} />} title="Agent findings" subtitle="Multi-agent collaboration">
            <AgentNarrative agents={data.agents} />
          </Section>

          <Section icon={<Microscope size={16} />} title="Evidence" subtitle="Sources behind findings">
            <EvidenceNarrative evidence={data.evidence} />
          </Section>

          <Section icon={<ClipboardList size={16} />} title="Care gaps" subtitle="Detected follow-up gaps">
            <CareGapNarrative gaps={data.gaps} />
          </Section>

          <Section icon={<CheckSquare size={16} />} title="Review requirement" subtitle="Human-in-the-loop decisions">
            <ReviewNarrative reviews={data.reviews} patientId={patient.patient_id} onChanged={refetch} />
          </Section>
        </div>
      )}
    </div>
  );
}

/* ── Section wrapper ─────────────────────────────────────────── */
function Section({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[var(--accent)]">{icon}</span>
        <h2 className="section-title mb-0">{title}</h2>
        {subtitle && <span className="text-xs text-[var(--text-dim)]">· {subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

/* ── Current status ──────────────────────────────────────────── */
function CurrentStatus({ profile, risk, meds, patientId }: {
  profile: PatientIntelligenceProfile | null;
  risk: RiskOverview | null;
  meds: MedicationSafetyResponse | null;
  patientId: number;
}) {
  const summary = profile?.ai_summary || risk?.summary || 'No automated summary available for this patient yet.';
  const conditions = profile?.current_conditions || [];
  const allergies = profile?.allergies || [];
  const medsCount = profile?.active_medications?.length || meds?.medications?.length || 0;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="section-label">Current status</div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-1 max-w-3xl">{summary}</p>
        </div>
        {risk && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-[var(--text-dim)]">Overall risk</span>
            <SeverityBadge severity={risk.overall_risk_level} />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <Stat icon={<Stethoscope size={15} />} label="Active conditions" value={conditions.length} />
        <Stat icon={<Pill size={15} />} label="Active medications" value={medsCount} />
        <Stat icon={<AlertTriangle size={15} />} label="Allergies" value={allergies.length} />
        <Stat icon={<HeartPulse size={15} />} label="Risk domains" value={risk?.risks?.length ?? 0} />
      </div>
      {conditions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {conditions.slice(0, 8).map((c, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-surface-3)] text-[var(--text-secondary)] border border-[var(--border)]">{String(c)}</span>)}
        </div>
      )}
      <Link to={`/patients/${patientId}`} className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline mt-3">
        Open patient record <ArrowRight />
      </Link>
    </Card>
  );
}
function ArrowRight() { return <span className="text-[var(--accent)]">→</span>; }

function Stat({ icon, label, value, isWarning }: { icon: React.ReactNode; label: string; value: number; isWarning?: boolean }) {
  return (
    <div className="surface-2 p-3 rounded-lg">
      <div className="flex items-center gap-1.5 text-[var(--text-dim)] text-xs">{icon} {label}</div>
      <div className={`text-xl font-semibold data-value mt-1 ${isWarning ? 'text-[var(--warning)]' : ''}`}>{value}</div>
    </div>
  );
}

/* ── Timeline ────────────────────────────────────────────────── */
function TimelineNarrative({ timeline }: { timeline: AggregatedTimelineResponse | null }) {
  const [cat, setCat] = React.useState<TimelineCategory | 'all'>('all');
  if (!timeline) return <EmptyState title="No timeline events" description="Timeline will populate as clinical records are added." />;
  const items = (timeline.items || []).filter((i) => cat === 'all' || i.category === cat);
  const cats = timeline.categories || [];
  return (
    <div>
      {cats.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <CatChip active={cat === 'all'} onClick={() => setCat('all')} label="All" color="var(--text-dim)" />
          {cats.map((c) => (
            <CatChip key={c} active={cat === c} onClick={() => setCat(c)} label={CATEGORY_META[c]?.label || c} color={CATEGORY_META[c]?.color || 'var(--accent)'} />
          ))}
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState title="No clinical events for this period." />
      ) : (
        <div className="space-y-2">
          {items.slice(0, 25).map((e) => (
            <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)]">
              <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ background: CATEGORY_META[e.category]?.color || 'var(--accent)' }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{e.title}</span>
                  {e.risk_level && <SeverityBadge severity={e.risk_level} />}
                  {e.requires_review && <Badge tone="warning">review</Badge>}
                  <span className="text-xs text-[var(--text-dim)] ml-auto">{new Date(e.date_time).toLocaleDateString()}</span>
                </div>
                {e.description && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{e.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CatChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 h-7 rounded-full text-xs border transition-smooth ${active ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]' : 'bg-[var(--bg-surface-2)] text-[var(--text-secondary)] border-[var(--border)]'}`}>
      {label}
    </button>
  );
}

/* ── Risk ────────────────────────────────────────────────────── */
function RiskNarrative({ risk, patientId }: { risk: RiskOverview; patientId: number }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{risk.summary}</p>
        {risk.safety_events?.length > 0 && (
          <div className="mt-3 space-y-1">
            {risk.safety_events.map((e, i) => (
              <div key={i} className="text-sm text-[var(--text-secondary)] flex gap-2"><ShieldAlert size={14} className="text-[var(--danger)] mt-0.5 shrink-0" />{JSON.stringify(e)}</div>
            ))}
          </div>
        )}
      </Card>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {risk.risks.map((r) => (
          <div key={r.id} className="surface p-4 flex flex-col gap-3 anim-rise">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold capitalize">{r.risk_category.replace('_', ' ')}</span>
              <SeverityBadge severity={r.risk_level} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold data-value" style={{ color: levelColor[r.risk_level] || 'var(--text-primary)' }}>{Math.round(r.score)}</span>
              <span className="text-xs text-[var(--text-dim)]">/ 100</span>
              <span className="ml-auto flex items-center gap-1 text-xs text-[var(--text-dim)]">
                {(r.trend || '').toLowerCase().includes('up') || (r.trend || '').toLowerCase().includes('worsen') ? <TrendingUp size={14} className="text-[var(--danger)]" /> : (r.trend || '').toLowerCase().includes('down') || (r.trend || '').toLowerCase().includes('improv') ? <TrendingDown size={14} className="text-[var(--success)]" /> : <Minus size={14} />}
                {r.trend || 'stable'}
              </span>
            </div>
            {r.confidence != null && <div className="text-xs text-[var(--text-dim)]">Confidence: {Math.round(r.confidence * 100)}%</div>}
            {r.contributing_factors?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {r.contributing_factors.map((f) => <span key={f} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-surface-3)] text-[var(--text-secondary)] border border-[var(--border)]">{f}</span>)}
              </div>
            ) : null}
            {r.recommended_review_level && <div className="text-xs text-[var(--text-dim)]">Recommended review: <span className="text-[var(--text-secondary)]">{r.recommended_review_level}</span></div>}
          </div>
        ))}
      </div>
      <Link to={`/risk?patient=${patientId}`} className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"><Activity size={12} /> Open Risk Center</Link>
    </div>
  );
}

/* ── Medication safety ───────────────────────────────────────── */
function MedNarrative({ meds }: { meds: MedicationSafetyResponse }) {
  const issues = [
    { title: 'Interactions', items: meds.interactions, render: (it: any) => <>Between <strong>{it.medication_a}</strong> and <strong>{it.medication_b}</strong> — {it.mechanism}</> },
    { title: 'Duplicate therapy', items: meds.duplicate_therapies, render: (it: any) => <>{it.drug_class}: {it.medications.join(', ')} — {it.note}</> },
    { title: 'Contraindications & allergies', items: meds.contraindications, render: (it: any) => <>Allergy <strong>{it.allergy}</strong> vs <strong>{it.medication}</strong> — {it.note}</> },
    { title: 'Dosage concerns', items: meds.dosage_concerns, render: (it: any) => <>{it.medication}: {it.note}</> },
  ];
  return (
    <div className="space-y-4">
      <Card className="p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="section-label">Overall medication safety</div>
          <div className="mt-1 flex items-center gap-2"><ShieldAlert size={18} className={levelTone(meds.overall_level) === 'danger' ? 'text-[var(--danger)]' : levelTone(meds.overall_level) === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--success)]'} />
            <span className="text-2xl font-semibold capitalize data-value">{meds.overall_level}</span></div>
        </div>
        {meds.requires_clinician_review && <Badge tone="danger">Clinician review required</Badge>}
      </Card>
      {issues.filter((i) => i.items?.length).map((sec) => (
        <Card key={sec.title} className="p-5">
          <h3 className="section-title mb-3">{sec.title}</h3>
          <div className="space-y-2">
            {sec.items.map((it: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)]">
                <div className="flex items-start gap-3">
                  <SeverityBadge severity={it.severity} />
                  <div className="text-sm text-[var(--text-secondary)] flex-1">{sec.render(it)}</div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-dim)]"><ShieldAlert size={12} /> Verified: {it.verification}</div>
              </div>
            ))}
          </div>
        </Card>
      ))}
      <Disclaimer compact>Decision support only — this system does not prescribe. Findings must be verified by an appropriate clinician or pharmacist.</Disclaimer>
    </div>
  );
}

/* ── Agents ──────────────────────────────────────────────────── */
function AgentNarrative({ agents }: { agents: AgentRun[] }) {
  const runs = agents || [];
  if (runs.length === 0) return <EmptyState title="No agent runs yet" description="Agent collaboration results will appear here." />;
  const findings = runs.flatMap((r) => (r.findings || []));
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="section-title mb-3">Agent runs</h3>
        <div className="space-y-2">
          {runs.slice(0, 12).map((r) => (
            <div key={r.id} className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)]">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${r.status === 'completed' ? 'bg-[var(--success)]' : r.status === 'failed' ? 'bg-[var(--danger)]' : 'bg-[var(--accent)]'}`} />
                <span className="text-sm font-medium capitalize">{r.agent_type.replace('_', ' ')}</span>
                <span className="ml-auto text-xs text-[var(--text-dim)]">{new Date(r.started_at).toLocaleTimeString()}</span>
              </div>
              {r.output_summary && <p className="text-sm text-[var(--text-secondary)] mt-1.5">{r.output_summary}</p>}
            </div>
          ))}
        </div>
      </Card>
      {findings.length > 0 && (
        <Card className="p-5">
          <h3 className="section-title mb-3 flex items-center gap-2"><Bot size={15} className="text-[var(--accent)]" /> Findings</h3>
          <div className="space-y-2">
            {findings.slice(0, 20).map((f) => (
              <div key={f.id} className={`p-3 rounded-lg border ${f.is_conflicting ? 'bg-[var(--warning-soft)] border-[var(--warning-border)]' : 'bg-[var(--bg-surface-2)] border-[var(--border)]'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{f.title}</span>
                  {f.is_conflicting && <Badge tone="warning">conflict</Badge>}
                  {f.confidence != null && <span className="ml-auto text-xs text-[var(--text-dim)]">confidence {Math.round(f.confidence * 100)}%</span>}
                </div>
                {f.description && <p className="text-sm text-[var(--text-secondary)] mt-1">{f.description}</p>}
                {f.evidence_source && <div className="text-xs text-[var(--text-dim)] mt-1">Evidence: {f.evidence_source}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── Evidence ─────────────────────────────────────────────────── */
function EvidenceNarrative({ evidence }: { evidence: EvidenceReference[] }) {
  const items = evidence || [];
  if (items.length === 0) return <EmptyState icon={<FileText size={22} />} title="No evidence records" description="Evidence references appear as analyses are performed." />;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {items.map((e) => (
        <Card key={e.id} className="p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><FileText size={15} className="text-[var(--accent)]" /><span className="text-sm font-semibold truncate">{e.title}</span></div>
              <div className="text-xs text-[var(--text-dim)] capitalize mt-0.5">{e.evidence_type.replace('_', ' ')}</div>
            </div>
            <Badge tone={e.status === 'verified' ? 'success' : e.status === 'disputed' ? 'danger' : 'info'}>{e.status}</Badge>
          </div>
          {e.source && <div className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><Link className="inline" to="#">{e.source}</Link></div>}
          {e.citation && <p className="text-xs text-[var(--text-dim)] mt-2 italic">{e.citation}</p>}
          <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-dim)]">
            {e.confidence != null && <span>Confidence: {Math.round(e.confidence * 100)}%</span>}
            {e.relevance_score != null && <span>Relevance: {Math.round(e.relevance_score * 100)}%</span>}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ── Care gaps ───────────────────────────────────────────────── */
function CareGapNarrative({ gaps }: { gaps: CareGapResult[] }) {
  const items = gaps || [];
  if (items.length === 0) return <EmptyState icon={<ClipboardList size={22} />} title="No care gaps" description="No open follow-up gaps detected for this patient." />;
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--text-dim)] border-b border-[var(--border)]">
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Issue</th>
              <th className="px-4 py-3 font-medium">Detected</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id} className="border-b border-[var(--border)] last:border-0">
                <td className="px-4 py-3"><SeverityBadge severity={g.severity} /></td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{g.title}</td>
                <td className="px-4 py-3 text-[var(--text-dim)]">{new Date(g.detected_at).toLocaleDateString()}</td>
                <td className="px-4 py-3"><Badge tone={g.status === 'resolved' ? 'success' : g.status === 'in_review' ? 'info' : 'warning'}>{g.status.replace('_', ' ')}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link to="/care-gaps" className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline p-4">Open Care Gaps queue →</Link>
    </Card>
  );
}

/* ── Reviews ─────────────────────────────────────────────────── */
function ReviewNarrative({ reviews, patientId, onChanged }: { reviews: ClinicalReview[]; patientId: number; onChanged: () => void }) {
  const items = (reviews || []).filter((r) => r.status !== 'approved' && r.status !== 'rejected');
  if (items.length === 0) return <EmptyState icon={<CheckSquare size={22} />} title="No pending reviews" description="This patient has no open AI-assisted reviews." />;
  return (
    <div className="space-y-3">
      {items.map((r) => (
        <Card key={r.id} className="p-5">
          <div className="flex items-center gap-3 flex-wrap">
            <Avatar name={`P${patientId}`} size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{r.ai_summary || `Review #${r.id}`}</div>
              <div className="flex items-center gap-2 mt-1.5">
                {r.ai_risk_level && <Badge tone={r.ai_risk_level === 'high' || r.ai_risk_level === 'critical' ? 'danger' : 'info'}>{r.ai_risk_level} risk</Badge>}
                {r.ai_confidence != null && <span className="text-xs text-[var(--text-dim)]">confidence {Math.round(r.ai_confidence * 100)}%</span>}
                <Badge tone="warning">{r.status.replace('_', ' ')}</Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to={`/reviews?patient=${patientId}`} className="btn btn-secondary btn-sm">Open</Link>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
