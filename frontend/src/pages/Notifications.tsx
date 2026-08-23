/**
 * Notifications — clinical alerts center with categories and acknowledgements.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, AlertTriangle, ShieldAlert, Info, Check, Filter } from 'lucide-react';
import { fetchAlerts, acknowledgeAlert, type ClinicalAlert } from '@/lib/apiIntelligence';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, Card, Button, Badge, SeverityBadge, EmptyState, ErrorState, Spinner } from '@/components/ui';

type Cat = 'all' | 'CRITICAL' | 'WARNING' | 'INFO';

export default function Notifications() {
  const [cat, setCat] = useState<Cat>('all');
  const { data, loading, error, refetch } = useAsync<ClinicalAlert[]>(() => fetchAlerts(), []);

  const rows = (data || []).filter((a) => cat === 'all' || a.severity === cat);
  const unread = (data || []).filter((a) => !a.is_acknowledged).length;

  const ack = async (id: number) => { try { await acknowledgeAlert(id); refetch(); } catch { /* noop */ } };

  const icon = (s: string) => s === 'CRITICAL' ? <ShieldAlert size={16} className="text-[var(--danger)]" />
    : s === 'WARNING' ? <AlertTriangle size={16} className="text-[var(--warning)]" /> : <Info size={16} className="text-[var(--accent)]" />;

  return (
    <div>
      <PageHeader
        icon={<Bell size={20} />}
        title="Notifications"
        subtitle="Clinical alerts across patients, medications, reports, and operations."
        actions={<Badge tone={unread ? 'danger' : 'success'}>{unread} unread</Badge>}
      />

      <div className="flex items-center gap-1 mb-5 flex-wrap">
        {(['all', 'CRITICAL', 'WARNING', 'INFO'] as Cat[]).map((c) => (
          <button key={c} onClick={() => setCat(c)}
            className={`px-3 h-9 rounded-lg text-sm border capitalize transition-smooth ${cat === c ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]' : 'bg-[var(--bg-surface-2)] text-[var(--text-secondary)] border-[var(--border)]'}`}>
            {c === 'all' ? 'All' : c.toLowerCase()}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {error && <ErrorState onRetry={refetch} />}
      {!loading && !error && rows.length === 0 && (
        <Card className="p-5"><EmptyState icon={<Bell size={22} />} title="No notifications" description="You're all caught up." /></Card>
      )}

      {rows.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y divide-[var(--border)]">
            {rows.map((a) => (
              <div key={a.id} className={`flex items-start gap-3 p-4 ${a.is_acknowledged ? 'opacity-60' : 'bg-[var(--bg-surface-2)]'}`}>
                <span className="mt-0.5">{icon(a.severity)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={a.severity} />
                    <span className="text-xs text-[var(--text-dim)]">{new Date(a.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-[var(--text-primary)] mt-1.5">{a.message}</p>
                  {a.patient_id != null && (
                    <Link to={`/patients/${a.patient_id}`} className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1 mt-1">Open patient →</Link>
                  )}
                </div>
                {!a.is_acknowledged && (
                  <Button variant="secondary" size="sm" onClick={() => ack(a.id)}><Check size={14} /> Ack</Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
