/**
 * Evidence — verified references and sources behind AI findings.
 */
import React, { useState } from 'react';
import { Microscope, Link2, ShieldCheck, FileBadge } from 'lucide-react';
import { PatientPicker } from '@/components/PatientPicker';
import { type DoctorPatientSummary } from '@/lib/api';
import { useClinicianPatient } from '@/lib/patientContext';
import { fetchEvidence, type EvidenceReference } from '@/lib/apiIntelligence';
import { useAsync } from '@/lib/useAsync';
import { PageHeader, Card, Badge, EmptyState, ErrorState, Spinner } from '@/components/ui';

const statusTone = (s: string) => s === 'verified' ? 'success' : s === 'disputed' ? 'danger' : s === 'pending' ? 'warning' : 'info';

export default function Evidence() {
  const [patient, setPatient] = useClinicianPatient();
  const { data, loading, error, refetch } = useAsync<EvidenceReference[]>(
    () => (patient ? fetchEvidence(patient.patient_id) : Promise.resolve([])), [patient?.patient_id]);

  return (
    <div>
      <PageHeader
        icon={<Microscope size={20} />}
        title="Evidence"
        subtitle="Sources and verified references supporting clinical findings."
        actions={<PatientPicker value={patient?.patient_id} onSelect={setPatient} />}
      />
      {!patient && <Card className="p-5"><EmptyState icon={<Microscope size={22} />} title="Select a patient" description="Review the evidence base behind AI-generated insights." /></Card>}
      {patient && (
        <>
          {loading && <div className="flex justify-center py-12"><Spinner /></div>}
          {error && <ErrorState onRetry={refetch} />}
          {(data || []).length === 0 && !loading && (
            <Card className="p-5"><EmptyState icon={<FileBadge size={22} />} title="No evidence records" description="Evidence references will appear here as analyses are performed." /></Card>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            {(data || []).map((e) => (
              <Card key={e.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><FileBadge size={15} className="text-[var(--accent)]" /><span className="text-sm font-semibold truncate">{e.title}</span></div>
                    <div className="text-xs text-[var(--text-dim)] capitalize mt-0.5">{e.evidence_type.replace('_', ' ')}</div>
                  </div>
                  <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                </div>
                {e.source && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]"><Link2 size={12} /> {e.source}</div>
                )}
                {e.citation && <p className="text-xs text-[var(--text-dim)] mt-2 italic">{e.citation}</p>}
                <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-dim)]">
                  {e.confidence != null && <span>Confidence: {Math.round(e.confidence * 100)}%</span>}
                  {e.relevance_score != null && <span>Relevance: {Math.round(e.relevance_score * 100)}%</span>}
                </div>
                {e.status === 'verified' && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--success)]"><ShieldCheck size={12} /> Verified source</div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
