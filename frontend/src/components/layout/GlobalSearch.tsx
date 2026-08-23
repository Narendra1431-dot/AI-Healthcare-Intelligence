/**
 * Global search — Cmd/Ctrl+K. Searches patients (live) and navigation.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, CornerDownLeft, FileText, Loader2 } from 'lucide-react';
import { getDoctorPatients, getAdminPatients, type DoctorPatientSummary } from '@/lib/api';
import { NAV_GROUPS } from './AppShell';

interface Result {
  id: string;
  label: string;
  sub?: string;
  kind: 'patient' | 'nav';
  href: string;
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<DoctorPatientSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => { if (open) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    let activeReq = true;
    const t = setTimeout(async () => {
      if (!query.trim()) { setPatients([]); setLoading(false); return; }
      setLoading(true);
      try {
        let list = await getDoctorPatients();
        if (!list || list.length === 0) list = (await getAdminPatients()) as unknown as DoctorPatientSummary[];
        const q = query.toLowerCase();
        const filtered = (list || []).filter((p) =>
          (p.full_name || p.username || '').toLowerCase().includes(q) ||
          String(p.patient_id).includes(q) ||
          (p.latest_encounter_type || '').toLowerCase().includes(q),
        ).slice(0, 8);
        if (activeReq) setPatients(filtered);
      } catch {
        if (activeReq) setPatients([]);
      } finally {
        if (activeReq) setLoading(false);
      }
    }, 250);
    return () => { activeReq = false; clearTimeout(t); };
  }, [query]);

  const navResults = useMemo(() => {
    const all: Result[] = [];
    NAV_GROUPS.forEach((g) => g.items.forEach((i) =>
      all.push({ id: `nav-${i.href}`, label: i.title, kind: 'nav', href: i.href, sub: g.label }),
    ));
    if (!query.trim()) return all.slice(0, 6);
    const q = query.toLowerCase();
    return all.filter((r) => r.label.toLowerCase().includes(q) || r.sub?.toLowerCase().includes(q));
  }, [query]);

  const patientResults: Result[] = patients.map((p) => ({
    id: `pt-${p.patient_id}`,
    label: p.full_name || p.username,
    sub: `MRN ${p.patient_id} · ${p.latest_encounter_type || 'patient'}`,
    kind: 'patient',
    href: `/patients/${p.patient_id}`,
  }));

  const results = [...patientResults, ...navResults];

  const go = (r?: Result) => {
    const target = r || results[active];
    if (!target) return;
    navigate(target.href);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl surface shadow-[var(--shadow-pop)] anim-scale-in overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-[var(--border)]">
          <Search size={18} className="text-[var(--text-dim)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); go(); }
            }}
            placeholder="Search patients, reports, medications, navigation…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
          <kbd className="text-[10px] font-mono border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-dim)]">ESC</kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto scrollbar-thin py-2">
          {query.trim() && loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-[var(--text-dim)]"><Loader2 size={15} className="animate-spin" /> Searching patients…</div>
          )}
          {!query.trim() && (
            <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-[var(--text-dim)]">Quick navigation</div>
          )}
          {patientResults.length > 0 && (
            <div className="px-3 pb-1 text-[11px] uppercase tracking-wide text-[var(--text-dim)]">Patients</div>
          )}
          {results.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-dim)]">No results for “{query}”.</div>
          )}
          {results.map((r, i) => (
            <button
              key={r.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-smooth ${i === active ? 'bg-[var(--bg-surface-2)]' : ''}`}
            >
              <span className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${r.kind === 'patient' ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-surface-3)] text-[var(--text-secondary)]'}`}>
                {r.kind === 'patient' ? <Users size={15} /> : <FileText size={15} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--text-primary)] truncate">{r.label}</span>
                {r.sub && <span className="block text-xs text-[var(--text-dim)] truncate">{r.sub}</span>}
              </span>
              {i === active && <CornerDownLeft size={14} className="ml-auto text-[var(--text-dim)]" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
