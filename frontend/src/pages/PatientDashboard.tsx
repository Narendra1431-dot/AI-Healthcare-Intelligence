/**
 * Patient Dashboard — "My Health".
 * A calm, plain-language view for patients. All data is backend-connected
 * via a single patient-scoped aggregation endpoint.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HeartPulse, Pill as PillIcon, CalendarClock, Activity, Stethoscope, MessageCircle, Sparkles,
  AlertCircle, ChevronRight, ShieldAlert, ListChecks, TrendingUp,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { useAsync } from '@/lib/useAsync';
import { fetchPatientDashboard, type PatientDashboardResponse } from '@/lib/apiIntelligence';
import { chatWithCASA, type CASAMessage } from '@/lib/apiBilling';
import {
  PageHeader, Card, Pill, Badge, EmptyState, ErrorState, Spinner, Disclaimer,
} from '@/components/ui';

type Tab = 'overview' | 'medications' | 'reports' | 'timeline' | 'appointments' | 'assistant' | 'health-trends';

const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: HeartPulse },
  { key: 'medications', label: 'Medications', icon: PillIcon },
  { key: 'reports', label: 'Reports', icon: ListChecks },
  { key: 'timeline', label: 'Timeline', icon: Activity },
  { key: 'appointments', label: 'Appointments', icon: CalendarClock },
  { key: 'assistant', label: 'Health Assistant', icon: MessageCircle },
  { key: 'health-trends', label: 'Health Trends', icon: TrendingUp },
];

export default function PatientDashboard() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('overview');

  const dashboard = useAsync<PatientDashboardResponse | null>(
    () => (user ? fetchPatientDashboard() : Promise.resolve(null)),
    [user?.id],
  );

  const firstName = (user?.full_name || user?.username || 'there').split(' ')[0];

  const profile = dashboard.data?.profile;
  const care_gaps = dashboard.data?.care_gaps ?? [];
  const prescriptions = dashboard.data?.prescriptions ?? [];
  const reports = dashboard.data?.reports ?? [];
  const appointments = dashboard.data?.appointments ?? [];
  const timeline = dashboard.data?.timeline ?? [];
  const risk_overview = dashboard.data?.risk_overview;
  const alerts = dashboard.data?.alerts ?? [];

  const activeAlerts = alerts.filter((a) => !a.is_acknowledged);
  const activeCareGaps = care_gaps.filter((g) => g.status !== 'resolved');
  const alertCount = activeCareGaps.length;

  const hasConditionsOrAllergies =
    (profile?.current_conditions?.length ?? 0) > 0 ||
    (profile?.allergies?.length ?? 0) > 0;

  return (
    <div>
      <PageHeader
        icon={<Stethoscope size={20} />}
        title={`Hello, ${firstName}`}
        subtitle="Your personal health overview. Plain-language summaries of your records."
        actions={<Badge tone="info">Patient Portal</Badge>}
      />

      <Disclaimer compact className="mb-5">
        This is a demonstration environment using synthetic data. Information here is for your awareness only — always discuss with your care team.
      </Disclaimer>

      {dashboard.loading && (
        <div className="flex justify-center py-12">
          <Spinner size={32} />
        </div>
      )}

      {dashboard.error && !dashboard.data && (
        <ErrorState
          title="Unable to load your health information."
          description="We could not retrieve your dashboard data. Please try again or contact your care team."
          onRetry={() => dashboard.refetch()}
        />
      )}

      {!dashboard.loading && !dashboard.error && dashboard.data && (
        <>
          {/* Patient Alerts banner */}
          {(activeAlerts.length > 0 || hasConditionsOrAllergies) && (
            <div className="space-y-3 mb-5">
              {activeAlerts.slice(0, 3).map((a) => (
                <div key={a.id} className="flex items-center gap-2 p-3 rounded-lg bg-[var(--bg-surface-2)] border-l-4 border-[var(--warning)]">
                  <AlertCircle size={14} className="text-[var(--warning)]" />
                  <span className="text-sm flex-1">{a.message}</span>
                </div>
              ))}
              {activeAlerts.length > 3 && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-dim)]">
                  <Badge tone="warning">{activeAlerts.length} total alerts</Badge>
                  <span>unacknowledged health alerts</span>
                </div>
              )}
              {hasConditionsOrAllergies && (
                <div className="flex items-center gap-2 text-xs text-[var(--text-dim)]">
                  <ShieldAlert size={14} className="text-[var(--warning)]" />
                  <span>
                    {(profile?.current_conditions?.length ?? 0)} conditions monitored{' '}
                    {(profile?.allergies?.length ?? 0)} allergies recorded
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-1 border-b border-[var(--border)] mb-6 overflow-x-auto scrollbar-thin">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-smooth whitespace-nowrap ${
                  tab === t.key ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <t.icon size={15} /> {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="p-5">
                  <div className="flex items-center gap-2 text-[var(--text-dim)] section-label"><Activity size={14} /> Health summary</div>
                  <p className="text-sm text-[var(--text-secondary)] mt-3 leading-relaxed">
                    {profile?.ai_summary || 'Your recent health information is being summarized. No urgent changes were detected in the latest records.'}
                  </p>
                  {profile?.ai_confidence != null && (
                    <div className="mt-3 text-xs text-[var(--text-dim)]">Summary confidence: {Math.round(profile.ai_confidence * 100)}%</div>
                  )}
                </Card>
                <Card className="p-5">
                  <div className="flex items-center gap-2 text-[var(--text-dim)] section-label"><PillIcon size={14} /> Active medications</div>
                  <div className="mt-3 text-3xl font-semibold data-value">{prescriptions.length}</div>
                  <p className="text-xs text-[var(--text-dim)] mt-1">currently prescribed</p>
                </Card>
                <Card className="p-5">
                  <div className="flex items-center gap-2 text-[var(--text-dim)] section-label"><ListChecks size={14} /> Care to follow up</div>
                  <div className="mt-3 text-3xl font-semibold data-value">{alertCount}</div>
                  <p className="text-xs text-[var(--text-dim)] mt-1">open items</p>
                </Card>
              </div>

              {hasConditionsOrAllergies && (
                <Card className="p-5">
                  <h3 className="section-title mb-3">About your health</h3>
                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-[var(--text-dim)] mb-1.5">Conditions being monitored</div>
                      <div className="flex flex-wrap gap-1.5">
                        {profile?.current_conditions?.length ? profile.current_conditions.map((c) => <Pill key={c}>{c}</Pill>)
                          : <span className="text-[var(--text-dim)]">None recorded</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--text-dim)] mb-1.5">Allergies</div>
                      <div className="flex flex-wrap gap-1.5">
                        {profile?.allergies?.length ? profile.allergies.map((a) => <Pill tone="danger" key={a}>{a}</Pill>)
                          : <span className="text-[var(--text-dim)]">None recorded</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {activeCareGaps.length > 0 && (
                <Card className="p-5">
                  <h3 className="section-title mb-3 flex items-center gap-2"><AlertCircle size={15} className="text-[var(--warning)]" /> Items to follow up</h3>
                  <div className="space-y-2">
                    {activeCareGaps.slice(0, 5).map((g) => (
                      <div key={g.id} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-surface-2)]">
                        <Badge tone={g.severity === 'high' ? 'danger' : g.severity === 'medium' ? 'warning' : 'info'}>{g.severity}</Badge>
                        <span className="text-sm flex-1">{g.title}</span>
                        <ChevronRight size={15} className="text-[var(--text-dim)]" />
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <div className="flex flex-wrap gap-3">
                <Link to="/intelligence" className="btn btn-secondary btn-sm"><TrendingUp size={14} /> View clinical intelligence</Link>
                <Link to="/medications" className="btn btn-secondary btn-sm"><PillIcon size={14} /> Medication safety</Link>
              </div>
              <HealthTrendsChart riskOverview={risk_overview} />
            </div>
          )}

          {tab === 'health-trends' && (
            <Card className="p-5">
              <h3 className="section-title mb-3">Health trends</h3>
              <HealthTrendsChart riskOverview={risk_overview} />
            </Card>
          )}

          {tab === 'medications' && (
            <Card className="p-5">
              <h3 className="section-title mb-3">Your medications</h3>
              {prescriptions.length === 0 ? (
                <EmptyState title="No medications listed" description="Your prescribed medications will appear here." />
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {prescriptions.flatMap((p) => (p.items || []).map((it) => ({ ...it, rxStatus: p.status }))).map((m, i) => (
                    <div key={i} className="py-3 flex items-center gap-3">
                      <PillIcon size={18} className="text-[var(--accent)]" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{m.medication_name || 'Medication'}</div>
                        <div className="text-xs text-[var(--text-dim)]">{m.dosage || ''} {m.frequency || ''} {m.duration || ''}</div>
                      </div>
                      <Badge tone="info">{m.rxStatus || m.status || 'active'}</Badge>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4"><Disclaimer compact>Always confirm dosage and instructions with your pharmacist or clinician.</Disclaimer></div>
            </Card>
          )}

          {tab === 'reports' && (
            <Card className="p-5">
              <h3 className="section-title mb-3">My Reports</h3>
              {reports.length === 0 ? (
                <EmptyState title="No reports found" description="Your medical reports will appear here once they've been uploaded and processed." />
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {reports.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)]">
                      <div className="w-8 h-8 rounded flex items-center justify-center text-sm font-medium bg-[var(--accent)] text-white">
                        {r.file_name?.split('.').slice(0, 2).join('.').substring(0, 8) || 'R'}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{r.file_name || 'Unknown report'}</div>
                        <div className="text-xs text-[var(--text-dim)]">{r.status || 'pending'}</div>
                      </div>
                      <Badge tone={r.requires_clinician_review ? 'danger' : 'info'}>
                        {r.requires_clinician_review ? 'Clinician review' : 'Ready'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 text-xs text-[var(--text-dim)]">
                Reports requiring clinician review should be discussed with your care team.
              </div>
            </Card>
          )}

          {tab === 'timeline' && <PatientTimeline timeline={timeline} />}

          {tab === 'appointments' && (
            <Card className="p-5">
              <h3 className="section-title mb-3">Your appointments</h3>
              {appointments.length === 0 ? (
                <EmptyState icon={<CalendarClock size={22} />} title="No appointments scheduled" description="Book a visit from the Appointments page." />
              ) : (
                <div className="space-y-2">
                  {appointments
                    .filter((a) => a.status !== 'Cancelled')
                    .sort((x, y) => +new Date(x.date_time) - +new Date(y.date_time))
                    .slice(0, 5)
                    .map((a) => (
                      <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-surface-2)]">
                        <CalendarClock size={16} className="text-[var(--accent)]" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{a.specialist || 'Appointment'}</div>
                          <div className="text-xs text-[var(--text-dim)] truncate">{a.reason || ''}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs data-value">{new Date(a.date_time).toLocaleDateString()}</div>
                          <div className="text-xs text-[var(--text-dim)]">{new Date(a.date_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                        <Badge tone={a.status === 'Completed' ? 'success' : a.status === 'Rescheduled' ? 'warning' : 'info'}>{a.status}</Badge>
                      </div>
                    ))}
                </div>
              )}
              <div className="mt-4"><Disclaimer compact>Always confirm appointment details with your care team.</Disclaimer></div>
            </Card>
          )}

          {tab === 'assistant' && <HealthAssistant />}
        </>
      )}
    </div>
  );
}

function HealthTrendsChart({ riskOverview }: { riskOverview?: PatientDashboardResponse['risk_overview'] }) {
  if (!riskOverview) {
    return (
      <Card className="p-5">
        <EmptyState icon={<HeartPulse size={22} />} title="No trend data available" description="Your health trends will appear here as you add vital records." />
      </Card>
    );
  }
  const risks = riskOverview.risks ?? [];
  const safetyEvents = riskOverview.safety_events ?? [];

  return (
    <Card className="p-5">
      <h3 className="section-title mb-3">Health trends</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {risks.slice(0, 6).map((risk) => {
          const riskLevel = risk.risk_level || 'medium';
          return (
            <div key={risk.id} className="p-4 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)]">
              <div className="text-2xl font-medium" style={{color: riskLevel === 'high' ? 'var(--danger)' : riskLevel === 'medium' ? 'var(--warning)' : 'var(--success)'}}>
                {risk.risk_level || '—'}
              </div>
              <div className="text-sm text-[var(--text-dim)] mt-1">{risk.risk_category || 'Risk category'}</div>
              <div className="text-xs text-[var(--text-dim)] mt-1">{risk.assessed_at ? new Date(risk.assessed_at).toLocaleDateString() : ''}</div>
            </div>
          );
        })}
        {safetyEvents.slice(0, 4).map((event: any, i: number) => (
          <div key={i} className="p-4 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)]">
            <div className="text-2xl font-medium" style={{color: 'var(--info)'}}>⚠️</div>
            <div className="text-sm text-[var(--text-dim)] mt-1">{event?.title || 'Safety event'}</div>
            <div className="text-xs text-[var(--text-dim)] mt-1">{event?.description || ''}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs text-[var(--text-dim)]">
        Trends are based on your historical health data. Consult your care team for interpretation.
      </div>
    </Card>
  );
}

function PatientTimeline({ timeline }: { timeline: PatientDashboardResponse['timeline'] }) {
  if (!timeline || timeline.length === 0) {
    return (
      <Card className="p-5">
        <EmptyState icon={<Activity size={22} />} title="No timeline events" description="Your health events will appear here over time." />
      </Card>
    );
  }
  const events = timeline.slice(0, 10);
  return (
    <Card className="p-5">
      <h3 className="section-title mb-4">Recent health events</h3>
      <ol className="relative border-l border-[var(--border)] ml-2 space-y-5">
        {events.map((e) => (
          <li key={e.id} className="ml-4">
            <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-[var(--accent)] border-2 border-[var(--bg-app)]" />
            <div className="text-sm font-medium">{e.title}</div>
            <div className="text-xs text-[var(--text-dim)]">{new Date(e.date_time).toLocaleDateString()} · {e.event_type}</div>
            {e.description && <p className="text-sm text-[var(--text-secondary)] mt-1">{e.description}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function HealthAssistant() {
  const [messages, setMessages] = useState<CASAMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!input.trim() || busy) return;
    const userMsg: CASAMessage = { role: 'user', content: input };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const res = await chatWithCASA(input, next);
      setMessages([...next, { role: 'assistant', content: res.response || 'No response.' }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: 'I am unable to respond right now. Please try again later or contact your care team.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-0 overflow-hidden flex flex-col h-[60vh]">
      <div className="panel-header flex items-center gap-2">
        <Sparkles size={16} className="text-[var(--accent)]" />
        <div>
          <h3 className="section-title">AI Health Assistant</h3>
          <p className="text-xs text-[var(--text-dim)]">Understand your health information with AI-assisted guidance.</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-[var(--text-dim)]">
            Ask in everyday language, for example: "Why was my blood pressure higher this month?" or "What does my new medication do?"
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm ${
              m.role === 'user' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-surface-2)] text-[var(--text-primary)] border border-[var(--border)]'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div className="text-sm text-[var(--text-dim)] flex items-center gap-2"><Spinner size={14} /> Thinking…</div>}
      </div>
      <div className="p-3 border-t border-[var(--border)] flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask about your health…"
          className="input-clinical"
        />
        <button className="btn btn-primary" onClick={send} disabled={busy || !input.trim()}>Send</button>
      </div>
      <div className="px-3 pb-3"><Disclaimer compact>The assistant offers guidance only — it is not a doctor and cannot diagnose.</Disclaimer></div>
    </Card>
  );
}
