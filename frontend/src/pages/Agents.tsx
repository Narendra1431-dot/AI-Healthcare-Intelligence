/**
 * AI Agents — collaboration workspace showing the multi-agent clinical flow,
 * runs, findings, and conflicts. Connected to the agent engine.
 */
import React, { useState } from 'react';
import {
  Bot, Play, Loader2, CheckCircle2, AlertTriangle, CircleSlash, CircleDot, GitBranch, ShieldCheck,
} from 'lucide-react';
import { PatientPicker } from '@/components/PatientPicker';
import { type DoctorPatientSummary } from '@/lib/api';
import { useClinicianPatient } from '@/lib/patientContext';
import {
  fetchAgentRuns, runAgent, type AgentRun,
} from '@/lib/apiIntelligence';
import { getAIFunctionRegistry } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, Card, Button, EmptyState, ErrorState, Spinner, Disclaimer, Badge, SeverityBadge } from '@/components/ui';

const statusMeta: Record<string, { icon: React.ReactNode; tone: 'success' | 'warning' | 'danger' | 'info' }> = {
  completed: { icon: <CheckCircle2 size={14} className="text-[var(--success)]" />, tone: 'success' },
  running: { icon: <Loader2 size={14} className="animate-spin text-[var(--accent)]" />, tone: 'info' },
  pending: { icon: <CircleDot size={14} className="text-[var(--text-dim)]" />, tone: 'info' },
  failed: { icon: <CircleSlash size={14} className="text-[var(--danger)]" />, tone: 'danger' },
  cancelled: { icon: <CircleSlash size={14} className="text-[var(--text-dim)]" />, tone: 'warning' },
};

const FLOW = ['supervisor', 'patient_context', 'clinical_reasoning', 'medication_safety', 'risk_safety', 'doctor_review'];

export default function Agents() {
  const [patient, setPatient] = useClinicianPatient();
  const runs = useAsync<AgentRun[]>(
    () => (patient ? fetchAgentRuns(patient.patient_id) : Promise.resolve([])), [patient?.patient_id]);
  const registry = useAsync(getAIFunctionRegistry, []);
  const [busy, setBusy] = useState(false);

  const trigger = async (type: string) => {
    if (!patient) return;
    setBusy(true);
    try { await runAgent({ agent_type: type, patient_id: patient.patient_id }); runs.refetch(); }
    catch { /* surface via state if needed */ }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        icon={<Bot size={20} />}
        title="AI Agents"
        subtitle="Transparent multi-agent collaboration for clinical reasoning and safety verification."
        actions={<PatientPicker value={patient?.patient_id} onSelect={setPatient} />}
      />
      <Disclaimer compact className="mb-5" />

      {!patient && <Card className="p-5"><EmptyState icon={<Bot size={22} />} title="Select a patient" description="Run or inspect agent collaboration for a patient." /></Card>}

      {patient && (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title">Collaboration flow</h3>
              <Button variant="primary" size="sm" onClick={() => trigger('supervisor')} disabled={busy}>
                {busy ? <Spinner size={14} /> : <Play size={14} />} Run supervisor
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {FLOW.map((stage, i) => {
                const run = (runs.data || []).find((r) => r.agent_type === stage);
                const meta = run ? statusMeta[run.status] : { icon: <CircleDot size={14} className="text-[var(--text-dim)]" />, tone: 'info' as const };
                return (
                  <div key={stage} className="flex items-center gap-2">
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${run ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--bg-surface-2)]'}`}>
                      {meta.icon}
                      <span className="text-sm font-medium capitalize">{stage.replace('_', ' ')}</span>
                    </div>
                    {i < FLOW.length - 1 && <span className="text-[var(--text-dim)]">→</span>}
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-5">
            <Card className="p-5">
              <h3 className="section-title mb-3">Agent runs</h3>
              {runs.loading && <div className="flex justify-center py-6"><Spinner /></div>}
              {(runs.data || []).length === 0 ? (
                <EmptyState title="No agent runs yet" description="Trigger an agent to begin collaboration." />
              ) : (
                <div className="space-y-2">
                  {(runs.data || []).slice(0, 12).map((r) => (
                    <div key={r.id} className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)]">
                      <div className="flex items-center gap-2">
                        {statusMeta[r.status]?.icon}
                        <span className="text-sm font-medium capitalize">{r.agent_type.replace('_', ' ')}</span>
                        <span className="ml-auto text-xs text-[var(--text-dim)]">{new Date(r.started_at).toLocaleTimeString()}</span>
                      </div>
                      {r.output_summary && <p className="text-sm text-[var(--text-secondary)] mt-1.5">{r.output_summary}</p>}
                      {r.findings?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.findings.map((f) => (
                            <span key={f.id} className={`text-[11px] px-2 py-0.5 rounded-full border ${f.is_conflicting ? 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning-border)]' : 'bg-[var(--bg-surface-3)] text-[var(--text-secondary)] border-[var(--border)]'}`}>
                              {f.is_conflicting && <GitBranch size={10} className="inline mr-1" />}{f.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="section-title mb-3 flex items-center gap-2"><ShieldCheck size={15} className="text-[var(--accent)]" /> Agent registry</h3>
              {registry.loading && <div className="flex justify-center py-6"><Spinner /></div>}
              {registry.data?.functions && (
                <div className="space-y-1.5">
                  {registry.data.functions.slice(0, 12).map((fn: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm p-2 rounded-md bg-[var(--bg-surface-2)]">
                      <Bot size={14} className="text-[var(--accent)]" />
                      <span className="font-medium">{fn.name || fn.id || 'function'}</span>
                      {fn.description && <span className="text-xs text-[var(--text-dim)] truncate ml-auto max-w-[60%]">{fn.description}</span>}
                    </div>
                  ))}
                </div>
              )}
              {!registry.loading && !registry.data?.functions && <EmptyState title="Registry unavailable" />}
            </Card>
          </div>

          <ConflictCallout runs={runs.data || []} />
        </div>
      )}
    </div>
  );
}

function ConflictCallout({ runs }: { runs: AgentRun[] }) {
  const conflicts = runs.flatMap((r) => r.findings.filter((f) => f.is_conflicting));
  if (!conflicts.length) return null;
  return (
    <Card className="p-5 border-[var(--warning-border)]">
      <h3 className="section-title flex items-center gap-2 text-[var(--warning)]"><AlertTriangle size={16} /> Agent disagreement detected</h3>
      <div className="mt-3 space-y-2">
        {conflicts.map((c) => (
          <div key={c.id} className="p-3 rounded-lg bg-[var(--warning-soft)] border border-[var(--warning-border)]">
            <div className="text-sm font-medium">{c.title}</div>
            {c.description && <p className="text-sm text-[var(--text-secondary)] mt-1">{c.description}</p>}
            {c.confidence != null && <div className="text-xs text-[var(--text-dim)] mt-1">Confidence: {Math.round(c.confidence * 100)}%</div>}
            <Badge tone="warning" className="mt-2">Review required</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
