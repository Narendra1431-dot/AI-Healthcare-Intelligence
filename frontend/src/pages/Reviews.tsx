/**
 * Clinical Reviews — human-in-the-loop review queue.
 * Pulls the real cross-patient review queue from the backend and persists
 * clinician decisions (approve / reject / request follow-up / add note) through
 * the backend, refreshing from authoritative state afterwards.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckSquare, Check, X, Flag, Clock, Eye, AlertTriangle, User,
} from 'lucide-react';
import {
  fetchReviewQueue, submitReviewAction, type ReviewQueueItem, type ReviewActionType,
} from '@/lib/apiIntelligence';
import { useAsync } from '@/lib/useAsync';
import { toast } from '@/lib/toast';
import { PageHeader, Card, Button, Badge, EmptyState, ErrorState, Spinner, Disclaimer, Avatar } from '@/components/ui';

type Tab = 'pending' | 'in_review' | 'approved' | 'rejected' | 'follow_up_required';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  pending: 'warning',
  in_review: 'info',
  approved: 'success',
  rejected: 'danger',
  follow_up_required: 'warning',
};

export default function Reviews() {
  const [tab, setTab] = useState<Tab>('pending');
  const { data, loading, error, refetch } = useAsync(() => fetchReviewQueue(), []);

  const queue = (data || []).filter((r) => r.status === tab);

  const act = async (r: ReviewQueueItem, action: ReviewActionType) => {
    try {
      await submitReviewAction(r.id, action, action === 'add_note' ? 'Reviewed via workspace.' : undefined);
      toast.success(`Review ${action.replace('_', ' ')}`);
      refetch();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update review');
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'in_review', label: 'In Review' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'follow_up_required', label: 'Follow-up' },
  ];

  return (
    <div>
      <PageHeader
        icon={<CheckSquare size={20} />}
        title="Clinical Reviews"
        subtitle="Human-in-the-loop review of AI-generated clinical assessments."
        actions={<Badge tone="warning">{(data || []).filter((r) => r.status === 'pending').length} pending</Badge>}
      />
      <Disclaimer compact className="mb-5" />

      <div className="flex gap-1 border-b border-[var(--border)] mb-6 overflow-x-auto scrollbar-thin">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-smooth whitespace-nowrap capitalize ${
              tab === t.key ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}>{t.label}</button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {error && <ErrorState onRetry={refetch} />}

      {data && (
        queue.length === 0 ? (
          <Card className="p-5"><EmptyState icon={<CheckSquare size={22} />} title={`No ${tab.replace('_', ' ')} reviews`} /></Card>
        ) : (
          <div className="space-y-3">
            {queue.map((r) => (
              <Card key={r.id} className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={r.patient_label || `P${r.patient_id}`} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{r.ai_summary || `Review #${r.id}`}</div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge tone={STATUS_TONE[r.status] || 'info'}>{r.status.replace('_', ' ')}</Badge>
                      {r.ai_risk_level && <Badge tone={r.ai_risk_level === 'high' || r.ai_risk_level === 'critical' ? 'danger' : 'info'}>{r.ai_risk_level} risk</Badge>}
                      {r.ai_confidence != null && <span className="text-xs text-[var(--text-dim)]">confidence {Math.round(r.ai_confidence * 100)}%</span>}
                      <Link to={`/patients/${r.patient_id}`} className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"><User size={11} /> {r.patient_label || 'Patient'}</Link>
                      <Link to={`/clinical-intelligence?patient=${r.patient_id}`} className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1"><Eye size={11} /> Intelligence</Link>
                    </div>
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => act(r, 'reject')}><X size={14} /> Reject</Button>
                      <Button variant="primary" size="sm" onClick={() => act(r, 'approve')}><Check size={14} /> Approve</Button>
                    </div>
                  )}
                  {r.status === 'in_review' && (
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => act(r, 'request_follow_up')}><Flag size={14} /> Follow-up</Button>
                      <Button variant="primary" size="sm" onClick={() => act(r, 'approve')}><Check size={14} /> Approve</Button>
                    </div>
                  )}
                  {r.status === 'approved' && (
                    <Badge tone="success"><Check size={12} /> Approved</Badge>
                  )}
                  {r.status === 'rejected' && (
                    <Badge tone="danger"><X size={12} /> Rejected</Badge>
                  )}
                  {r.status === 'follow_up_required' && (
                    <Badge tone="warning"><AlertTriangle size={12} /> Follow-up</Badge>
                  )}
                </div>
                {r.reviewer_notes && <p className="text-xs text-[var(--text-dim)] mt-3 border-t border-[var(--border)] pt-3 whitespace-pre-wrap">{r.reviewer_notes}</p>}
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}
