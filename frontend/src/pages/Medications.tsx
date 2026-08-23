/**
 * Medication Safety Workspace — interactions, duplications, contraindications,
 * allergy concerns, dosage concerns. Connected to the medication-safety engine.
 */
import React, { useState } from 'react';
import {
  Pill, AlertTriangle, Copy, ShieldCheck, Ban, Proportions, Stethoscope, ShieldAlert,
} from 'lucide-react';
import { PatientPicker } from '@/components/PatientPicker';
import {
  getDoctorPatientPrescriptions, type DoctorPatientSummary, type Prescription,
} from '@/lib/api';
import { useClinicianPatient } from '@/lib/patientContext';
import {
  fetchMedicationSafety, type MedicationSafetyResponse,
} from '@/lib/apiIntelligence';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, Card, Button, EmptyState, ErrorState, Spinner, Disclaimer, Badge, SeverityBadge, Pill as UIPill } from '@/components/ui';

export default function Medications() {
  const [patient, setPatient] = useClinicianPatient();
  const safety = useAsync<MedicationSafetyResponse | null>(
    () => (patient ? fetchMedicationSafety(patient.patient_id) : Promise.resolve(null)), [patient?.patient_id]);
  const rx = useAsync<{ prescriptions: Prescription[] } | null>(
    () => (patient ? getDoctorPatientPrescriptions(patient.patient_id) : Promise.resolve(null)), [patient?.patient_id]);

  const levelTone = (l?: string) => l === 'critical' || l === 'high' ? 'danger' : l === 'medium' ? 'warning' : 'success';

  return (
    <div>
      <PageHeader
        icon={<Pill size={20} />}
        title="Medication Safety"
        subtitle="Decision-support workspace for interactions, contraindications, and dosage review."
        actions={<PatientPicker value={patient?.patient_id} onSelect={setPatient} />}
      />

      {!patient && <Card className="p-5"><EmptyState icon={<Pill size={22} />} title="Select a patient" description="Choose a patient to review their medication safety profile." /></Card>}

      {patient && (
        <div className="space-y-5">
          <Disclaimer>Decision support only — this system does not prescribe. Findings must be verified by an appropriate clinician or pharmacist.</Disclaimer>

          {safety.loading && <div className="flex justify-center py-10"><Spinner /></div>}
          {safety.error && <ErrorState onRetry={safety.refetch} />}
          {safety.data && (
            <>
              <Card className="p-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="section-label">Overall Medication Safety</div>
                    <div className="mt-1 flex items-center gap-2">
                      <ShieldCheck size={18} className={levelTone(safety.data.overall_level) === 'danger' ? 'text-[var(--danger)]' : levelTone(safety.data.overall_level) === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--success)]'} />
                      <span className="text-2xl font-semibold capitalize data-value">{safety.data.overall_level}</span>
                    </div>
                  </div>
                  {safety.data.requires_clinician_review && <Badge tone="danger">Clinician review required</Badge>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <Stat icon={<AlertTriangle size={15} />} label="Interactions" count={safety.data.interactions.length} />
                  <Stat icon={<Copy size={15} />} label="Duplicate therapy" count={safety.data.duplicate_therapies.length} />
                  <Stat icon={<Ban size={15} />} label="Contraindications" count={safety.data.contraindications.length} />
                  <Stat icon={<Proportions size={15} />} label="Dosage concerns" count={safety.data.dosage_concerns.length} />
                </div>
              </Card>

              <FindingSection title="Drug Interactions" icon={<AlertTriangle size={15} />} items={safety.data.interactions}
                render={(it) => <>Between <strong>{it.medication_a}</strong> and <strong>{it.medication_b}</strong> — {it.mechanism}</>} />
              <FindingSection title="Duplicate Therapy" icon={<Copy size={15} />} items={safety.data.duplicate_therapies}
                render={(it) => <>{it.drug_class}: {it.medications.join(', ')} — {it.note}</>} />
              <FindingSection title="Contraindications & Allergies" icon={<Ban size={15} />} items={safety.data.contraindications}
                render={(it) => <>Allergy <strong>{it.allergy}</strong> vs <strong>{it.medication}</strong> — {it.note}</>} />
              <FindingSection title="Dosage Concerns" icon={<Proportions size={15} />} items={safety.data.dosage_concerns}
                render={(it) => <>{it.medication}: {it.note}</>} />
            </>
          )}

          {rx.data && (
            <Card className="p-5">
              <h3 className="section-title mb-3 flex items-center gap-2"><Stethoscope size={15} className="text-[var(--accent)]" /> Active Prescriptions</h3>
              {(() => {
                const items = (rx.data?.prescriptions || []).flatMap((p) => (p.items || []).map((it) => ({ ...it, rxStatus: p.status })));
                if (items.length === 0) return <EmptyState title="No active prescriptions" />;
                return (
                  <div className="divide-y divide-[var(--border)]">
                    {items.map((m, i) => (
                      <div key={i} className="py-3 flex items-center gap-3">
                        <Pill size={18} className="text-[var(--accent)]" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{m.medication_name}</div>
                          <div className="text-xs text-[var(--text-dim)]">{m.dosage} · {m.frequency} · {m.duration || ''}</div>
                        </div>
                        <UIPill>{m.rxStatus || m.status || 'active'}</UIPill>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="surface-2 p-3 rounded-lg">
      <div className="flex items-center gap-1.5 text-[var(--text-dim)] text-xs"><span className={count ? 'text-[var(--warning)]' : 'text-[var(--success)]'}>{icon}</span> {label}</div>
      <div className="text-xl font-semibold data-value mt-1">{count}</div>
    </div>
  );
}

function FindingSection<T extends { severity: string; verification: string }>({
  title, icon, items, render,
}: { title: string; icon: React.ReactNode; items: T[]; render: (it: T) => React.ReactNode }) {
  if (!items?.length) return null;
  return (
    <Card className="p-5">
      <h3 className="section-title mb-3 flex items-center gap-2">{icon} {title}</h3>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)]">
            <div className="flex items-start gap-3">
              <SeverityBadge severity={it.severity} />
              <div className="text-sm text-[var(--text-secondary)] flex-1">{render(it)}</div>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--text-dim)]"><ShieldCheck size={12} /> Verified: {it.verification}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
