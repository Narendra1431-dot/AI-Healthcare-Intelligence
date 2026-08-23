/**
 * Settings — profile, preferences, appearance, accessibility, data & privacy.
 * Patient-appropriate: internal/developer settings are not exposed to patients.
 */
import { useState } from 'react';
import {
  Settings as SettingsIcon, User, Bell, Palette, Accessibility, ShieldCheck, Save,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { fetchProfile, updateProfile, type UserProfile } from '@/lib/api';
import { useDemoStore } from '@/lib/demoMode';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, Card, Button, EmptyState, ErrorState, Spinner, Badge } from '@/components/ui';

type Section = 'profile' | 'preferences' | 'appearance' | 'accessibility' | 'privacy';

const SECTIONS: { key: Section; label: string; icon: React.ElementType }[] = [
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'preferences', label: 'Notifications', icon: Bell },
  { key: 'appearance', label: 'Appearance', icon: Palette },
  { key: 'accessibility', label: 'Accessibility', icon: Accessibility },
  { key: 'privacy', label: 'Data & Privacy', icon: ShieldCheck },
];

export default function Settings() {
  const user = useAuthStore((s) => s.user);
  const isPatient = user?.role === 'patient';
  const [section, setSection] = useState<Section>('profile');
  const profile = useAsync<UserProfile>(fetchProfile, []);
  const [form, setForm] = useState<Partial<UserProfile>>({});
  const [saved, setSaved] = useState(false);
  const isDemo = useDemoStore((s) => s.isDemo);

  const save = async () => {
    try { await updateProfile(form); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch { /* noop */ }
  };

  return (
    <div>
      <PageHeader icon={<SettingsIcon size={20} />} title="Settings" subtitle="Manage your profile, preferences, and privacy." />

      <div className="grid lg:grid-cols-4 gap-5">
        <Card className="p-2 h-fit lg:col-span-1">
          <nav className="space-y-0.5">
            {SECTIONS.map((s) => (
              <button key={s.key} onClick={() => setSection(s.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-smooth ${section === s.key ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)]'}`}>
                <s.icon size={16} /> {s.label}
              </button>
            ))}
          </nav>
        </Card>

        <div className="lg:col-span-3">
          {section === 'profile' && (
            <Card className="p-5">
              <h3 className="section-title mb-4">Profile</h3>
              {profile.loading && <div className="flex justify-center py-8"><Spinner /></div>}
              {profile.error && <ErrorState onRetry={profile.refetch} />}
              {profile.data && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Full name" value={form.full_name ?? profile.data.full_name ?? ''} onChange={(v) => setForm({ ...form, full_name: v })} />
                  <Field label="Email" value={form.email ?? profile.data.email ?? ''} onChange={(v) => setForm({ ...form, email: v })} />
                  <Field label="Gender" value={form.gender ?? profile.data.gender ?? ''} onChange={(v) => setForm({ ...form, gender: v })} />
                  <Field label="Blood type" value={form.blood_type ?? profile.data.blood_type ?? ''} onChange={(v) => setForm({ ...form, blood_type: v })} />
                  <div className="sm:col-span-2">
                    <label className="label-clinical">About me</label>
                    <textarea className="input-clinical" rows={3} value={form.about_me ?? profile.data.about_me ?? ''} onChange={(e) => setForm({ ...form, about_me: e.target.value })} />
                  </div>
                </div>
              )}
              <div className="mt-5 flex items-center gap-3">
                <Button variant="primary" onClick={save}><Save size={15} /> Save changes</Button>
                {saved && <span className="text-sm text-[var(--success)] flex items-center gap-1"><ShieldCheck size={14} /> Saved</span>}
              </div>
            </Card>
          )}

          {section === 'preferences' && (
            <Card className="p-5 space-y-4">
              <h3 className="section-title">Notifications</h3>
              <Toggle label="Clinical alerts" desc="Receive alerts for high-risk patients and abnormal results." defaultOn />
              <Toggle label="Medication safety alerts" desc="Be notified of new interaction or dosage concerns." defaultOn />
              <Toggle label="Appointment reminders" desc="Reminders before scheduled visits." defaultOn />
            </Card>
          )}

          {section === 'appearance' && (
            <Card className="p-5 space-y-4">
              <h3 className="section-title">Appearance</h3>
              <div className="flex items-center justify-between">
                <div><div className="text-sm font-medium">Theme</div><div className="text-xs text-[var(--text-dim)]">Clinical dark (system default)</div></div>
                <Badge tone="info">Dark</Badge>
              </div>
              <Toggle label="Compact density" desc="Reduce spacing for information-dense workflows." />
              <Toggle label="Reduced motion" desc="Minimize non-essential animations." />
            </Card>
          )}

          {section === 'accessibility' && (
            <Card className="p-5 space-y-4">
              <h3 className="section-title">Accessibility</h3>
              <Toggle label="High contrast text" desc="Increase text contrast for readability." />
              <Toggle label="Larger base font" desc="Increase default font size across the app." />
              <div className="text-xs text-[var(--text-dim)]">Keyboard: press <kbd className="font-mono border border-[var(--border)] rounded px-1.5 py-0.5">⌘K</kbd> to open global search.</div>
            </Card>
          )}

          {section === 'privacy' && (
            <Card className="p-5 space-y-4">
              <h3 className="section-title flex items-center gap-2"><ShieldCheck size={15} className="text-[var(--success)]" /> Data & Privacy</h3>
              <div className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)] text-sm text-[var(--text-secondary)]">
                Your data is scoped to your account. Clinicians see only records for patients under their care. Patients see only their own records.
              </div>
              {isDemo && (
                <div className="p-3 rounded-lg bg-[var(--warning-soft)] border border-[var(--warning-border)] text-sm text-[var(--warning)]">
                  This environment uses synthetic demonstration data. No real patient information is present.
                </div>
              )}
              {!isPatient && (
                <div className="text-xs text-[var(--text-dim)]">Administrator and developer controls are available from the Admin console, not this patient-safe settings view.</div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label-clinical">{label}</label>
      <input className="input-clinical" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Toggle({ label, desc, defaultOn }: { label: string; desc: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn);
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-[var(--text-dim)]">{desc}</div>
      </div>
      <button
        onClick={() => setOn((o) => !o)}
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`relative w-11 h-6 rounded-full transition-smooth shrink-0 ${on ? 'bg-[var(--accent)]' : 'bg-[var(--bg-surface-3)] border border-[var(--border)]'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
