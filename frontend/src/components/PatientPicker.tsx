/**
 * Patient picker — loads the clinician's patient list and lets the user
 * select a patient. Used by per-patient clinical pages.
 */
import { useEffect, useMemo, useState } from 'react';
import { Search, Users, ChevronDown } from 'lucide-react';
import { getDoctorPatients, type DoctorPatientSummary } from '@/lib/api';
import { usePatientContext } from '@/lib/patientContext';
import { Avatar } from '@/components/ui';

export function PatientPicker({
  value, onSelect, placeholder = 'Select patient',
}: { value?: number; onSelect: (p: DoctorPatientSummary) => void; placeholder?: string }) {
  const syncSelected = usePatientContext((s) => s.setPatient);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<DoctorPatientSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    getDoctorPatients()
      .then((list) => active && setPatients(list || []))
      .catch(() => active && setPatients([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return patients.filter((p) =>
      (p.full_name || p.username || '').toLowerCase().includes(q) ||
      String(p.patient_id).includes(q));
  }, [patients, query]);

  const selected = patients.find((p) => p.patient_id === value);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-9 px-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-smooth text-sm min-w-[200px]"
      >
        {selected ? <Avatar name={selected.full_name || selected.username} size={22} /> : <Users size={16} className="text-[var(--text-dim)]" />}
        <span className="truncate">{selected ? (selected.full_name || selected.username) : placeholder}</span>
        <ChevronDown size={14} className="ml-auto text-[var(--text-dim)]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 surface shadow-[var(--shadow-pop)] z-40 anim-scale-in p-2">
            <div className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-md bg-[var(--bg-surface-2)] border border-[var(--border)]">
              <Search size={14} className="text-[var(--text-dim)]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search patients…"
                className="bg-transparent outline-none text-sm flex-1"
              />
            </div>
            <div className="max-h-64 overflow-y-auto scrollbar-thin">
              {loading && <div className="px-3 py-4 text-sm text-[var(--text-dim)]">Loading…</div>}
              {!loading && filtered.length === 0 && <div className="px-3 py-4 text-sm text-[var(--text-dim)]">No patients.</div>}
              {filtered.map((p) => (
                <button
                  key={p.patient_id}
                  onClick={() => { onSelect(p); syncSelected(p); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-[var(--bg-surface-2)] text-left"
                >
                  <Avatar name={p.full_name || p.username} size={26} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{p.full_name || p.username}</span>
                    <span className="block text-xs text-[var(--text-dim)] truncate">MRN {p.patient_id}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
