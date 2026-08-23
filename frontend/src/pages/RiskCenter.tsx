/**
 * Risk Center — per-patient risk radar, category breakdown, trends.
 */
import React, { useState } from 'react';
import {
  Activity, ShieldAlert, TrendingUp, TrendingDown, Minus, AlertTriangle, ShieldCheck,
} from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { PatientPicker } from '@/components/PatientPicker';
import { type DoctorPatientSummary } from '@/lib/api';
import { useClinicianPatient } from '@/lib/patientContext';
import { fetchRiskOverview, type RiskOverview, type RiskAssessment } from '@/lib/apiIntelligence';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, Card, EmptyState, ErrorState, Spinner, Disclaimer, Badge, SeverityBadge } from '@/components/ui';

const levelColor: Record<string, string> = {
  low: 'var(--success)', medium: 'var(--warning)', high: 'var(--danger)', critical: 'var(--danger)',
};
const levelTone = (l: string) => l === 'high' || l === 'critical' ? 'danger' : l === 'medium' ? 'warning' : 'success';

export default function RiskCenter() {
  const [patient, setPatient] = useClinicianPatient();
  const { data, loading, error, refetch } = useAsync<RiskOverview | null>(
    () => (patient ? fetchRiskOverview(patient.patient_id) : Promise.resolve(null)), [patient?.patient_id]);

  const radarData = (data?.risks || []).map((r) => ({
    category: r.risk_category.replace('_', ' '),
    score: Math.round(r.score),
  }));

  return (
    <div>
      <PageHeader
        icon={<Activity size={20} />}
        title="Risk Center"
        subtitle="Multi-domain risk assessment with trends and contributing factors."
        actions={<PatientPicker value={patient?.patient_id} onSelect={setPatient} />}
      />

      {!patient && <Card className="p-5"><EmptyState icon={<Activity size={22} />} title="Select a patient" description="Review a patient's cardiovascular, diabetes, kidney, liver, and other risk domains." /></Card>}

      {patient && (
        <div className="space-y-5">
          <Disclaimer compact>Risk scores are model estimates for decision support. They do not replace clinical judgement.</Disclaimer>
          {loading && <div className="flex justify-center py-10"><Spinner /></div>}
          {error && <ErrorState onRetry={refetch} />}
          {data && (
            <>
              <div className="grid lg:grid-cols-3 gap-5">
                <Card className="p-5 lg:col-span-1 flex flex-col">
                  <div className="section-label">Overall risk</div>
                  <div className="mt-2 flex items-center gap-2">
                    <SeverityBadge severity={data.overall_risk_level} />
                    <span className="text-xs text-[var(--text-dim)]">review: {data.recommended_review_level}</span>
                  </div>
                  <div className="flex-1 mt-3 min-h-[260px]">
                    {radarData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radarData} outerRadius="75%">
                          <PolarGrid stroke="var(--border-strong)" />
                          <PolarAngleAxis dataKey="category" tick={{ fill: 'var(--text-dim)', fontSize: 10 }} />
                          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                          <Radar dataKey="score" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25} />
                        </RadarChart>
                      </ResponsiveContainer>
                    ) : <EmptyState title="No risk data" />}
                  </div>
                </Card>

                <Card className="p-5 lg:col-span-2">
                  <h3 className="section-title mb-3">Risk summary</h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{data.summary}</p>
                  {data.safety_events?.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="section-label flex items-center gap-1.5"><AlertTriangle size={13} className="text-[var(--danger)]" /> Safety events</div>
                      {data.safety_events.map((e, i) => (
                        <div key={i} className="text-sm text-[var(--text-secondary)] flex gap-2"><ShieldAlert size={14} className="text-[var(--danger)] mt-0.5 shrink-0" />{JSON.stringify(e)}</div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {data.risks.map((r) => <RiskCard key={r.id} r={r} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TrendIcon({ trend }: { trend?: string | null }) {
  const t = (trend || '').toLowerCase();
  if (t.includes('up') || t.includes('worsen')) return <TrendingUp size={14} className="text-[var(--danger)]" />;
  if (t.includes('down') || t.includes('improv')) return <TrendingDown size={14} className="text-[var(--success)]" />;
  return <Minus size={14} className="text-[var(--text-dim)]" />;
}

function RiskCard({ r }: { r: RiskAssessment }) {
  return (
    <div className="surface p-4 flex flex-col gap-3 anim-rise">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${levelColor[r.risk_level] || 'var(--accent)'}1f`, color: levelColor[r.risk_level] || 'var(--accent)' }}>
            <ShieldCheck size={16} />
          </span>
          <span className="text-sm font-semibold capitalize">{r.risk_category.replace('_', ' ')}</span>
        </div>
        <SeverityBadge severity={r.risk_level} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold data-value" style={{ color: levelColor[r.risk_level] || 'var(--text-primary)' }}>{Math.round(r.score)}</span>
        <span className="text-xs text-[var(--text-dim)]">/ 100</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-[var(--text-dim)]"><TrendIcon trend={r.trend} /> {r.trend || 'stable'}</span>
      </div>
      {r.confidence != null && (
        <div className="text-xs text-[var(--text-dim)]">Confidence: {Math.round(r.confidence * 100)}%</div>
      )}
      {r.contributing_factors?.length ? (
        <div>
          <div className="section-label mb-1">Contributing factors</div>
          <div className="flex flex-wrap gap-1.5">
            {r.contributing_factors.map((f) => <span key={f} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-surface-3)] text-[var(--text-secondary)] border border-[var(--border)]">{f}</span>)}
          </div>
        </div>
      ) : null}
      {r.recommended_review_level && (
        <div className="text-xs text-[var(--text-dim)]">Recommended review: <span className="text-[var(--text-secondary)]">{r.recommended_review_level}</span></div>
      )}
    </div>
  );
}
