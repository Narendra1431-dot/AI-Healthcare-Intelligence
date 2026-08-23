/**
 * Appointments — view and book clinical appointments.
 */
import { useState } from 'react';
import { CalendarDays, Plus, Clock, Stethoscope, Video, CheckCircle2 } from 'lucide-react';
import { getAppointments, bookAppointment, getDoctors, type Appointment } from '@/lib/apiBilling';
import { getAdminPatients, getDoctorPatients, type DoctorPatientSummary } from '@/lib/apiAdmin';
import { useAsync } from '@/lib/useAsync';
import { useAuthStore } from '@/lib/auth';
import { PageHeader, Card, Button, EmptyState, ErrorState, Spinner, Badge, Modal } from '@/components/ui';
import { toast } from '@/lib/toast';

interface SelectablePatient {
  id: number;
  name: string;
}

export default function Appointments() {
  const user = useAuthStore((s) => s.user);
  const userRole = user?.role || 'patient';
  const isPrivileged = userRole === 'admin' || userRole === 'doctor' || userRole === 'nurse';

  const { data, loading, error, refetch } = useAsync<Appointment[]>(getAppointments, []);
  const doctors = useAsync(getDoctors, []);
  const patients = useAsync<SelectablePatient[]>(() => {
    if (!isPrivileged) return Promise.resolve([]);
    const fetch = userRole === 'admin'
      ? getAdminPatients()
      : getDoctorPatients();
    return fetch.then((list) => {
      if (userRole === 'admin') {
        return (list as any[]).map((p: any) => ({ id: p.id, name: p.full_name || p.username }));
      }
      return (list as DoctorPatientSummary[]).map((p) => ({ id: p.patient_id, name: p.full_name || p.username }));
    });
  }, [isPrivileged, userRole]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ doctor_id: 0, appointment_date: '', notes: '', patient_id: 0 });
  const [busy, setBusy] = useState(false);
  const [bookedSuccess, setBookedSuccess] = useState(false);

  const book = async () => {
    if (!form.doctor_id || !form.appointment_date) return;
    if (isPrivileged && !form.patient_id) return;
    setBusy(true);
    setBookedSuccess(false);
    try {
      await bookAppointment({
        doctor_id: form.doctor_id,
        appointment_date: form.appointment_date,
        notes: form.notes,
        patient_id: isPrivileged ? form.patient_id : undefined,
      });
      setOpen(false);
      setForm({ doctor_id: 0, appointment_date: '', notes: '', patient_id: 0 });
      setBookedSuccess(true);
      toast.success('Appointment booked successfully');
      refetch();
      setTimeout(() => setBookedSuccess(false), 4000);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to book appointment');
    } finally {
      setBusy(false);
    }
  };

  const statusTone = (status: string) => {
    switch (status) {
      case 'Completed': return 'success';
      case 'Cancelled': return 'danger';
      case 'Rescheduled': return 'warning';
      default: return 'info';
    }
  };

  const upcoming = (data || []).filter((a) => new Date(a.appointment_date) >= new Date() && a.status !== 'Cancelled').sort((x, y) => +new Date(x.appointment_date) - +new Date(y.appointment_date));
  const past = (data || []).filter((a) => new Date(a.appointment_date) < new Date() || a.status === 'Cancelled');

  return (
    <div>
      <PageHeader
        icon={<CalendarDays size={20} />}
        title="Appointments"
        subtitle="Schedule and manage clinical appointments."
        actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> Book Appointment</Button>}
      />

      {loading && <div className="flex justify-center py-12"><Spinner /></div>}
      {error && <ErrorState onRetry={refetch} />}

      {!loading && !error && (
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <Card className="p-5">
              <h3 className="section-title mb-3">Upcoming</h3>
              {upcoming.length === 0 ? <EmptyState icon={<CalendarDays size={22} />} title="No upcoming appointments" /> :
                <div className="space-y-2">
                  {upcoming.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-surface-2)]">
                      <CalendarDays size={16} className="text-[var(--accent)]" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{a.doctor?.name || 'Appointment'}</div>
                        <div className="text-xs text-[var(--text-dim)]">{a.notes || a.doctor?.specialization || ''}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm data-value">{new Date(a.appointment_date).toLocaleDateString()}</div>
                        <div className="text-xs text-[var(--text-dim)]">{new Date(a.appointment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                    </div>
                  ))}
                </div>}
            </Card>
            {past.length > 0 && (
              <Card className="p-5">
                <h3 className="section-title mb-3">Past</h3>
                <div className="space-y-2">
                  {past.slice(0, 8).map((a) => (
                    <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)]">
                      <Clock size={15} className="text-[var(--text-dim)]" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{a.doctor?.name || 'Appointment'}</div>
                        <div className="text-xs text-[var(--text-dim)]">{new Date(a.appointment_date).toLocaleDateString()}</div>
                      </div>
                      <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          <Card className="p-5 h-fit">
            <h3 className="section-title mb-3 flex items-center gap-2"><Stethoscope size={15} className="text-[var(--accent)]" /> Quick actions</h3>
            {bookedSuccess && (
              <div className="mb-3 p-2 rounded-lg bg-[var(--success-muted)] border border-[var(--success-border)] text-xs text-[var(--success)] flex items-center gap-2">
                <CheckCircle2 size={14} /> Appointment booked!
              </div>
            )}
            <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
              <li className="flex gap-2"><Video size={15} className="text-[var(--accent)] mt-0.5" /> {(data || []).length} total appointments</li>
              <li className="flex gap-2"><CalendarDays size={15} className="text-[var(--accent)] mt-0.5" /> {upcoming.length} upcoming</li>
              <li className="flex gap-2"><Clock size={15} className="text-[var(--accent)] mt-0.5" /> {past.length} past visits</li>
            </ul>
            <Button variant="primary" className="mt-4 w-full" onClick={() => setOpen(true)}><Plus size={15} /> New appointment</Button>
          </Card>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Book appointment" size="sm">
        <div className="space-y-4">
          {isPrivileged && (
            <div>
              <label className="label-clinical">Patient</label>
              <select className="input-clinical" value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: Number(e.target.value) })}>
                <option value={0}>Select a patient…</option>
                {(patients.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label-clinical">Clinician</label>
            <select className="input-clinical" value={form.doctor_id} onChange={(e) => setForm({ ...form, doctor_id: Number(e.target.value) })}>
              <option value={0}>Select a clinician…</option>
              {(doctors.data || []).map((d) => <option key={d.id} value={d.id}>{d.name} — {d.specialization}</option>)}
            </select>
          </div>
          <div>
            <label className="label-clinical">Date & time</label>
            <input type="datetime-local" className="input-clinical" value={form.appointment_date} onChange={(e) => setForm({ ...form, appointment_date: e.target.value })} />
          </div>
          <div>
            <label className="label-clinical">Reason / notes</label>
            <textarea className="input-clinical" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={book} disabled={busy || !form.doctor_id || !form.appointment_date || (isPrivileged && !form.patient_id)}>{busy ? <Spinner size={14} /> : 'Book'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
