/**
 * Notifications dropdown — surfaces clinical alerts from the backend.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, ShieldAlert, Info, Check } from 'lucide-react';
import { fetchAlerts, acknowledgeAlert, type ClinicalAlert } from '@/lib/apiIntelligence';
import { useAsync } from '@/lib/useAsync';
import { SeverityBadge, Spinner } from '@/components/ui';

const severityIcon = (s: string) =>
  s === 'CRITICAL' ? <ShieldAlert size={15} className="text-[var(--danger)]" />
  : s === 'WARNING' ? <AlertTriangle size={15} className="text-[var(--warning)]" />
  : <Info size={15} className="text-[var(--accent)]" />;

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data, loading, refetch } = useAsync<ClinicalAlert[]>(() => fetchAlerts(), []);
  const alerts = (data || []).slice(0, 8);
  const unread = (data || []).filter((a) => !a.is_acknowledged).length;

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const ack = async (id: number) => { try { await acknowledgeAlert(id); refetch(); } catch { /* noop */ } };

  return (
    <div ref={ref} className="absolute right-0 mt-2 w-80 surface shadow-[var(--shadow-pop)] z-40 anim-scale-in">
      <header className="panel-header flex items-center justify-between">
        <h4 className="display-title text-sm flex items-center gap-2"><Bell size={15} /> Notifications</h4>
        {unread > 0 && <span className="text-[11px] text-[var(--danger)] font-semibold">{unread} unread</span>}
      </header>
      <div className="max-h-96 overflow-y-auto scrollbar-thin">
        {loading && <div className="flex items-center justify-center py-8"><Spinner /></div>}
        {!loading && alerts.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[var(--text-dim)]">No notifications.</div>
        )}
        {alerts.map((a) => (
          <div key={a.id} className="px-4 py-3 border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface-2)]">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5">{severityIcon(a.severity)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={a.severity} />
                  {!a.is_acknowledged && <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)]" />}
                </div>
                <p className="text-sm text-[var(--text-primary)] mt-1.5 leading-snug">{a.message}</p>
                <div className="flex items-center gap-3 mt-2">
                  <button className="text-xs text-[var(--accent)] hover:underline" onClick={() => { navigate('/notifications'); onClose(); }}>View</button>
                  {!a.is_acknowledged && (
                    <button className="text-xs text-[var(--text-dim)] hover:text-[var(--text-primary)] inline-flex items-center gap-1" onClick={() => ack(a.id)}>
                      <Check size={12} /> Acknowledge
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
