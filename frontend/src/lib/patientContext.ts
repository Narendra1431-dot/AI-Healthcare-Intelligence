/**
 * Global Patient Context
 *
 * Single source of truth for the clinician's currently selected patient.
 * Persisted to localStorage so the selection survives route changes and
 * full page reloads. The backend remains the authority for authorization
 * and data — this store only coordinates UI selection.
 *
 * Pages read the selected patient here and write to it whenever a clinician
 * picks a patient (Patients directory, PatientDetail, PatientPicker, etc.),
 * so every clinical intelligence page shares one consistent context.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DoctorPatientSummary } from './api';

export interface SelectedPatient {
  patientId: number;
  name: string;
  username?: string;
  mrn?: string | number;
  demo?: boolean;
  selectedAt: string;
}

interface PatientContextState {
  patient: SelectedPatient | null;
  setPatient: (p: DoctorPatientSummary) => void;
  setPatientRaw: (p: { patient_id: number; full_name?: string | null; username: string; demo?: boolean }) => void;
  clearPatient: () => void;
}

export const usePatientContext = create<PatientContextState>()(
  persist(
    (set) => ({
      patient: null,
      setPatient: (p) =>
        set({
          patient: {
            patientId: p.patient_id,
            name: p.full_name || p.username,
            username: p.username,
            mrn: p.patient_id,
            demo: (p as { demo?: boolean }).demo,
            selectedAt: new Date().toISOString(),
          },
        }),
      setPatientRaw: (p) =>
        set({
          patient: {
            patientId: p.patient_id,
            name: p.full_name || p.username,
            username: p.username,
            mrn: p.patient_id,
            demo: p.demo,
            selectedAt: new Date().toISOString(),
          },
        }),
      clearPatient: () => set({ patient: null }),
    }),
    { name: 'healthcare-selected-patient' },
  ),
);

export type ClinicianPatient = DoctorPatientSummary & { demo?: boolean };

/**
 * Hook returning the selected patient (as a DoctorPatientSummary for the
 * existing PatientPicker API) and a setter that keeps the global context in
 * sync. Pass the setter straight into <PatientPicker onSelect={setPatient} />.
 */
export function useClinicianPatient(): [
  ClinicianPatient | null,
  (p: DoctorPatientSummary | null) => void,
] {
  const patient = usePatientContext((s) => s.patient);
  const setPatient = usePatientContext((s) => s.setPatient);
  const clearPatient = usePatientContext((s) => s.clearPatient);

  const summary: ClinicianPatient | null = patient
    ? {
        patient_id: patient.patientId,
        username: patient.username || patient.name,
        full_name: patient.name,
        demo: patient.demo,
      } as ClinicianPatient
    : null;

  return [summary, (p) => (p ? setPatient(p) : clearPatient())];
}
