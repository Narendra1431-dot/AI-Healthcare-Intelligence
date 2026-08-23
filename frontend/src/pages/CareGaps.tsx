/**
 * Care Gaps — detected gaps across the clinician's patients.
 * Aggregates per-patient care-gap detections from the backend and lets the
 * clinician transition each gap through its real persisted lifecycle
 * (detected → in_review → resolved / escalated) via the backend API.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Filter, Search, AlertTriangle, CheckCircle2, ShieldAlert, RefreshCw } from 'lucide-react';
import { getDoctorPatients, type DoctorPatientSummary } from '@/lib/api';
import { fetchCareGaps, updateCareGapStatus, type CareGapResult, type CareGapStatus } from '@/lib/apiIntelligence';
import { useAsync } from '@/lib/useAsync';
import { toast } from '@/lib/toast';
import { PageHeader, Card, Badge, SeverityBadge, EmptyState, ErrorState, Spinner, Button } from '@/components/ui';

const GAP_LABELS: Record<string, string> = {
  overdue_followup: 'Overdue follow-up',
  missing_lab_followup: 'Missing lab follow-up',
  unresolved_abnormal_report: 'Unresolved abnormal report',
  medication_review_due: 'Medication review due',
  appointment_gap: 'Appointment gap',
  incomplete_workflow: 'Incomplete workflow',
};

const NEXT: Record<CareGapStatus, CareGapStatus[]> = {
  detected: ['in_review', 'resolved', 'escalated'],
  in_review: ['resolved', 'escalated', 'detected'],
  escalated: ['in_review', 'resolved'],
  resolved: ['in_review'],
};

type Row = CareGapResult & { patientId: number; patientName: string };

export default function CareGaps() {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [q, setQ] = useState('');
  const { data, loading, error, refetch } = useAsync(async () => {
    const patients = (await getDoctorPatients()).slice(0, 20);
    const perPatient = await Promise.all(
      patients.map(async (p: DoctorPatientSummary) => {
        try {
          const gaps = await fetchCareGaps(p.patient_id);
          return gaps.map((g) => ({ ...g, patientId: p.patient_id, patientName: p.full_name || p.username }));
        } catch { return [] as Row[]; }
      }),
    );
    return perPatient.flat() as Row[];
  }, []);

  const rows = (data || []).filter((g) => {
    if (filter === 'open' && g.status === 'resolved') return false;
    if (filter === 'resolved' && g.status !== 'resolved') return false;
    if (q && !(`${g.title} ${g.patientName}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  const transition = async (g: Row, status: CareGapStatus) => {
    try {
      await updateCareGapStatus(g.id, status);
      toast.success(`Care gap marked ${status.replace('_', ' ')}`);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update care gap');
    }
  };

  return (
    <div>
      <PageHeader
        icon={<ClipboardList size={20} />}
        title="Care Gaps"
        subtitle="Detected care gaps requiring follow-up across your patients."
        actions={<Badge tone="warning">{(data || []).filter((g) => g.status !== 'resolved').length} open</Badge>}
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 h-9 px-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)] flex-1 min-w-[200px]">
          <Search size={15} className="text-[var(--text-dim)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter gaps…" className="bg-transparent outline-none text-sm flex-1" />
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'open', 'resolved'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 h-9 rounded-lg text-sm border transition-smooth capitalize ${filter === f ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]' : 'bg-[var(--bg-surface-2)] text-[var(--text-secondary)] border-[var(--border)]'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {error && <ErrorState onRetry={refetch} />}
      {!loading && !error && rows.length === 0 && (
        <Card className="p-5"><EmptyState icon={<ClipboardList size={22} />} title="No care gaps found" description="No care gaps match the current filter." /></Card>
      )}

      {rows.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-dim)] border-b border-[var(--border)]">
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Issue</th>
                  <th className="px-4 py-3 font-medium">Detected</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => {
                  const next = NEXT[(g.status as CareGapStatus)] || [];
                  return (
                    <tr key={g.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface-2)]">
                      <td className="px-4 py-3"><SeverityBadge severity={g.severity} /></td>
                      <td className="px-4 py-3 font-medium">
                        <Link to={`/patients/${g.patientId}`} className="hover:underline">{g.patientName}</Link>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{GAP_LABELS[g.gap_type] || g.title}</td>
                      <td className="px-4 py-3 text-[var(--text-dim)]">{new Date(g.detected_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3"><Badge tone={g.status === 'resolved' ? 'success' : g.status === 'in_review' ? 'info' : 'warning'}>{g.status.replace('_', ' ')}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-1.5 justify-end flex-wrap">
                          {next.includes('in_review') && <Button variant="secondary" size="sm" onClick={() => transition(g, 'in_review')}><RefreshCw size={13} /> Review</Button>}
                          {next.includes('resolved') && <Button variant="primary" size="sm" onClick={() => transition(g, 'resolved')}><CheckCircle2 size={13} /> Resolve</Button>}
                          {next.includes('escalated') && <Button variant="ghost" size="sm" onClick={() => transition(g, 'escalated')}><ShieldAlert size={13} /> Escalate</Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
