import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTelemetry } from "@/lib/useTelemetry";
import { BedDouble, Users, ArrowRight, TrendingUp, Wifi, WifiOff, X, Activity, AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import {
  getDoctorPatients,
  getBeds,
  getDepartments,
  createAdmission,
  createEncounter,
  dispatchCareEvent,
  updateBedStatus,
  type DoctorPatientSummary,
  type Bed,
  type Department
} from "@/lib/api";
import { toast } from "@/lib/toast";
import { fetchTriageQueue } from "@/lib/apiIntelligence";
import { OnboardingGuideModal } from "@/components/modals/OnboardingGuideModal";

function computeTotalCensus(beds: Bed[]): number {
  if (!beds || beds.length === 0) return 0;
  return beds.filter(b => b.status === 'occupied').length;
}

function computeTotalCapacity(beds: Bed[]): number {
  if (!beds || beds.length === 0) return 0;
  return beds.length;
}

function computeEdBoarding(beds: Bed[]): number {
  const occupied = beds.filter(b => b.status === 'occupied').length;
  return Math.max(0, occupied - 20);
}

function computeEdAvgWait(beds: Bed[]): number {
  const occupied = beds.filter(b => b.status === 'occupied').length;
  if (occupied > 80) return 180;
  if (occupied > 60) return 120;
  if (occupied > 40) return 60;
  return 30;
}

function computeOccupancyRate(beds: Bed[]): number {
  const total = beds.length;
  if (total === 0) return 0;
  const occupied = beds.filter(b => b.status === 'occupied').length;
  return Math.round((occupied / total) * 100);
}

function computeCleaningBeds(beds: Bed[]): number {
  return beds.filter(b => b.status === 'cleaning').length;
}

function computeAvailableBeds(beds: Bed[]): number {
  return beds.filter(b => b.status === 'available').length;
}

function computePendingDischarges(beds: Bed[]): number {
  return beds.filter(b => b.status === 'cleaning').length;
}

function computeConfirmedDischarges(beds: Bed[]): number {
  return Math.round(beds.filter(b => b.status === 'cleaning').length * 0.6);
}

function computeSurgePct(beds: Bed[]): number {
  const rate = computeOccupancyRate(beds);
  return rate > 90 ? 20 : rate > 80 ? 15 : 5;
}

function computeBedUnits(beds: Bed[], departments: Department[]): any[] {
  if (!beds || beds.length === 0) return [];

  const departmentsMap = new Map<number, { name: string; total: number; occupied: number; cleaning: number }>();

  beds.forEach(bed => {
    const deptId = bed.department_id;
    if (!departmentsMap.has(deptId)) {
      const dept = departments.find(d => d.id === deptId);
      const deptName = dept ? dept.name : `Department ${deptId || 'General'}`;
      departmentsMap.set(deptId, { name: deptName, total: 0, occupied: 0, cleaning: 0 });
    }
    const dept = departmentsMap.get(deptId)!;
    dept.total++;
    if (bed.status === 'occupied') dept.occupied++;
    if (bed.status === 'cleaning') dept.cleaning++;
  });

  return Array.from(departmentsMap.values()).map((dept) => ({
    unit: dept.name,
    total: dept.total,
    occupied: dept.occupied,
    cleaning: dept.cleaning,
    available: dept.total - dept.occupied - dept.cleaning,
  }));
}

export default function CapacityPage() {
  const [mounted, setMounted] = useState(false);
  const { data: telemetry, status: wsStatus } = useTelemetry();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [patients, setPatients] = useState<DoctorPatientSummary[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | "">("");
  const [selectedBedId, setSelectedBedId] = useState<number | "">("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  const [triageQueue, setTriageQueue] = useState<any[]>([]);
  const [loadingTriage, setLoadingTriage] = useState(false);
  const [inspectBed, setInspectBed] = useState<{ unit: string; bedCode: string; status: "occupied" | "cleaning" | "available"; patientName?: string } | null>(null);
  const [transferringBed, setTransferringBed] = useState<{ unit: string; bedCode: string } | null>(null);
  const [targetBedCode, setTargetBedCode] = useState("ICU-02");
  const [showOnboardingGuide, setShowOnboardingGuide] = useState(false);

  const computedBedUnits = useMemo(() => computeBedUnits(beds, departments), [beds, departments]);
  const totalCensus = useMemo(() => computeTotalCensus(beds), [beds]);
  const totalCapacity = useMemo(() => computeTotalCapacity(beds), [beds]);
  const occupancyPct = totalCapacity > 0 ? Math.round((totalCensus / totalCapacity) * 100) : 0;
  const edBoarding = useMemo(() => computeEdBoarding(beds), [beds]);
  const edAvgWait = useMemo(() => computeEdAvgWait(beds), [beds]);
  const pendingDischarges = useMemo(() => computePendingDischarges(beds), [beds]);
  const confirmedDischarges = useMemo(() => computeConfirmedDischarges(beds), [beds]);
  const surgePct = useMemo(() => computeSurgePct(beds), [beds]);
  const bedUnits = computedBedUnits;

  const handleInspectNextFreeBed = () => {
    const freeUnit = bedUnits.find(u => u.available > 0) || bedUnits[0];
    if (freeUnit) {
      const prefix = freeUnit.unit.substring(0, 3).toUpperCase();
      const freeBedNum = freeUnit.occupied + freeUnit.cleaning + 1;
      const bedCode = `${prefix}-${String(freeBedNum).padStart(2, "0")}`;
      setInspectBed({ unit: freeUnit.unit, bedCode, status: "available" });
      toast.success(`Inspecting next available bed ${bedCode} in ${freeUnit.unit}`);
    }
  };

  const loadTriageQueue = async () => {
    setLoadingTriage(true);
    try {
      const data = await fetchTriageQueue();
      setTriageQueue(data.queue || []);
    } catch (err) {
      console.error("Failed to load triage queue:", err);
    } finally {
      setLoadingTriage(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadInitialData();
    loadTriageQueue();
    const interval = setInterval(loadTriageQueue, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadInitialData = async () => {
    try {
      const [bedsData, departmentsData] = await Promise.all([
        getBeds(),
        getDepartments(),
      ]);
      setBeds(bedsData);
      setDepartments(departmentsData);
    } catch (err) {
      console.error("Failed to load initial data:", err);
    }
  };

  const openAssignmentModal = async () => {
    setIsModalOpen(true);
    setLoading(true);
    setModalError(null);
    setModalSuccess(null);
    try {
      const [patientsData, bedsData, deptsData] = await Promise.all([
        getDoctorPatients().catch(() => []),
        getBeds(),
        getDepartments().catch(() => []),
      ]);
      setPatients(patientsData.length > 0 ? patientsData : []);
      setDepartments(deptsData.length > 0 ? deptsData : []);
      setBeds(bedsData.length > 0 ? bedsData : []);
    } catch (err: any) {
      setModalError(err.message || "Failed to load assignment data.");
    } finally {
      setLoading(false);
    }
  };

  const handleBedClick = (bed: Bed) => {
    if (bed.status === "available") {
      openAssignmentModal();
    } else {
      let patientName: string | undefined;
      if (bed.status === "occupied" && bed.current_patient_id) {
        const patient = patients.find(p => p.patient_id === bed.current_patient_id);
        patientName = patient?.full_name || patient?.username;
      }
      setInspectBed({
        unit: bed.ward || "General",
        bedCode: bed.bed_number,
        status: bed.status as "occupied" | "cleaning" | "available",
        patientName
      });
    }
  };

  const handleAssignBed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || !selectedBedId || !selectedDepartmentId) {
      setModalError("Please select a patient, a department, and a bed.");
      return;
    }
    setLoading(true);
    setModalError(null);
    setModalSuccess(null);
    try {
      const patient = patients.find(p => p.patient_id === Number(selectedPatientId));
      let encounterId = patient?.latest_encounter_id;

      if (!encounterId) {
        const newEncounter = await createEncounter({
          patient_id: Number(selectedPatientId),
          department_id: Number(selectedDepartmentId),
          encounter_type: "IPD",
        });
        encounterId = newEncounter.id;
      }

      await createAdmission({
        encounter_id: encounterId,
        patient_id: Number(selectedPatientId),
        department_id: Number(selectedDepartmentId),
        bed_id: Number(selectedBedId),
        reason: reason || "Routine Admission",
      });

      setModalSuccess("Bed successfully assigned!");
      setSelectedPatientId("");
      setSelectedBedId("");
      setReason("");
      const updatedBeds = await getBeds();
      setBeds(updatedBeds);
    } catch (err: any) {
      setModalError(err.message || "Failed to assign bed.");
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  const statusLabel = occupancyPct > 90
    ? "SURGE RED ALARM"
    : occupancyPct > 80
    ? "ELEVATED CENSUS"
    : "NORMAL OPERATIONS";

  const statusColor = occupancyPct > 90
    ? "text-[var(--danger)]"
    : occupancyPct > 80
    ? "text-[var(--warning)]"
    : "text-[var(--success)]";

  return (
    <div className="w-full min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans selection:bg-[var(--accent)] selection:text-white pb-20">
      <div className="w-full bg-[var(--bg-secondary)] border-b border-[var(--border)] px-4 py-1.5 flex justify-between items-center text-[10px] font-mono tracking-wider text-[var(--text-dim)] uppercase" role="status" aria-label="Capacity status bar">
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5 text-[var(--accent)] font-semibold">
            <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-pulse" aria-hidden="true" />
            LIVE ADT NODE LINK
          </span>
          <span>CAPACITY MONITOR</span>
        </div>
        <div className="flex gap-4 items-center">
          <span className={`${statusColor} font-semibold`}>FACILITY STATE: {statusLabel}</span>
          {wsStatus === "connected" ? (
            <span className="flex items-center gap-1 text-[var(--success)] font-semibold"><Wifi size={11} aria-hidden="true" /> LIVE</span>
          ) : (
            <span className="flex items-center gap-1 text-[var(--danger)] font-semibold"><WifiOff size={11} aria-hidden="true" /> ERROR</span>
          )}
        </div>
      </div>

      <div className="py-6 max-w-[1600px] mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]"
        >
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-baseline gap-2">
              Admission Capacity
              <span className={`text-[10px] ${occupancyPct > 90 ? "bg-[var(--danger-muted)] border-[var(--danger-border)] text-[var(--danger)]" : "bg-[var(--warning-muted)] border-[var(--warning-border)] text-[var(--warning)]"} border px-2 py-0.5 rounded uppercase tracking-wider font-mono`}>
                {occupancyPct}% Occupancy
              </span>
            </h1>
            <p className="text-xs text-[var(--text-secondary)] font-mono uppercase mt-1">Real-time bed board, throughput metrics, and discharge forecasts.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowOnboardingGuide(true)}
              className="btn btn-secondary text-xs flex items-center justify-center gap-1.5 cursor-pointer border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
              aria-label="Open Interactive Guide"
            >
              <Sparkles size={13} className="text-yellow-400 animate-pulse" aria-hidden="true" /> Interactive Guide
            </button>
            <button
              onClick={handleInspectNextFreeBed}
              className="btn btn-secondary text-xs flex items-center justify-center gap-1.5 cursor-pointer text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/30"
              aria-label="Inspect Next Free Bed"
            >
              <BedDouble size={13} aria-hidden="true" /> Inspect Free Bed
            </button>
            <button
              onClick={openAssignmentModal}
              className="btn btn-primary text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              aria-label="Request patient transfer"
            >
              <ArrowRight size={13} aria-hidden="true" /> Bed Assignment
            </button>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Capacity key metrics">
          <div className="panel p-4 flex flex-col justify-between h-24">
            <h3 className="section-label flex items-center gap-1.5">
              <BedDouble size={13} aria-hidden="true" /> Bed Occupancy
            </h3>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-bold text-[var(--text-primary)] font-mono">
                {totalCensus}<span className="text-xs text-[var(--text-dim)]"> / {totalCapacity}</span>
              </span>
              <span className="text-[10px] font-mono text-[var(--success)] font-bold">
                {occupancyPct > 85 ? "HIGH" : "NORMAL"}
              </span>
            </div>
          </div>

          <div className="panel p-4 flex flex-col justify-between h-24">
            <h3 className="section-label flex items-center gap-1.5">
              <Users size={13} aria-hidden="true" /> ED Boarding
            </h3>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-bold text-[var(--warning)] font-mono">{edBoarding}</span>
              <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">Avg {edAvgWait}m wait</span>
            </div>
          </div>

          <div className="panel p-4 flex flex-col justify-between h-24">
            <h3 className="section-label flex items-center gap-1.5">
              <ArrowRight size={13} aria-hidden="true" /> Pending Discharges
            </h3>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-bold text-[var(--success)] font-mono">{pendingDischarges}</span>
              <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">{confirmedDischarges} Confirmed</span>
            </div>
          </div>

          <div className="bg-[var(--danger-muted)] border border-[var(--danger-border)] rounded p-4 flex flex-col justify-between h-24">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--danger)] flex items-center gap-1.5">
              <TrendingUp size={13} aria-hidden="true" /> Surge Prediction
            </h3>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-2xl font-bold text-[var(--danger)] font-mono">+{surgePct}%</span>
              <span className="text-[10px] font-mono text-[var(--danger)] uppercase">Next 4 hours</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="panel">
              <div className="panel-header flex justify-between items-center bg-[rgba(15,15,17,0.5)]">
                <h3 className="section-title">Admission Ward Layout</h3>
                <div className="flex gap-4 text-[9px] font-mono uppercase text-[var(--text-dim)]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[var(--success)] rounded-sm" aria-hidden="true" /> Available</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[var(--danger)] rounded-sm" aria-hidden="true" /> Occupied</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[var(--warning)] rounded-sm" aria-hidden="true" /> Cleaning</span>
                </div>
              </div>

              <div className="p-4 space-y-6">
                {bedUnits.map((unit) => {
                  const unitBeds = beds.filter(b => (b.ward || "General") === unit.unit);
                  const unitOccPct = unit.total > 0 ? Math.round((unit.occupied / unit.total) * 100) : 0;
                  return (
                    <div key={unit.unit} role="region" aria-label={`${unit.unit} bed status`} className="space-y-2">
                      <div className="flex justify-between items-end">
                        <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase">{unit.unit}</h4>
                        <span className={`text-[10px] font-mono font-bold ${unitOccPct > 85 ? "text-[var(--danger)]" : unitOccPct > 70 ? "text-[var(--warning)]" : "text-[var(--success)]"}`}>
                          {unit.occupied}/{unit.total} ({unitOccPct}%)
                        </span>
                      </div>
                      <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                        {unitBeds.map((bed) => {
                          const cellType = bed.status === "occupied" ? "occupied" : bed.status === "cleaning" ? "cleaning" : "available";
                          return (
                            <motion.div
                              key={bed.id}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: Math.min(bed.id * 0.003, 0.5) }}
                              onClick={() => handleBedClick(bed)}
                              className={`h-8 rounded border flex items-center justify-center text-[10px] font-mono font-bold select-none cursor-pointer transition-all hover:scale-110 hover:z-10 shadow-sm ${
                                cellType === "occupied"
                                  ? "bg-[var(--danger-muted)] border-[var(--danger-border)] text-[var(--danger)] hover:border-red-400"
                                  : cellType === "cleaning"
                                  ? "bg-[var(--warning-muted)] border-[var(--warning-border)] text-[var(--warning)] hover:border-amber-400"
                                  : "bg-[var(--success-muted)] border-[var(--success-border)] text-[var(--success)] hover:border-emerald-400"
                              }`}
                              aria-label={`Bed ${bed.bed_number}: ${cellType}`}
                              title={`Click to inspect Bed ${bed.bed_number} (${cellType.toUpperCase()})`}
                            >
                              {bed.bed_number.replace(/^.*-/, "")}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <div className="panel flex flex-col overflow-hidden max-h-72">
              <div className="panel-header bg-[rgba(15,15,17,0.5)]">
                <h3 className="section-title">Bed Status Summary</h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-[var(--success-muted)] border border-[var(--success-border)] text-center">
                    <p className="text-xl font-bold text-[var(--success)]">{computeAvailableBeds(beds)}</p>
                    <p className="text-[10px] text-[var(--text-dim)] uppercase">Available</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--danger-muted)] border border-[var(--danger-border)] text-center">
                    <p className="text-xl font-bold text-[var(--danger)]">{totalCensus}</p>
                    <p className="text-[10px] text-[var(--text-dim)] uppercase">Occupied</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--warning-muted)] border border-[var(--warning-border)] text-center">
                    <p className="text-xl font-bold text-[var(--warning)]">{computeCleaningBeds(beds)}</p>
                    <p className="text-[10px] text-[var(--text-dim)] uppercase">Cleaning</p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--accent-muted)] border border-[var(--accent-border)] text-center">
                    <p className="text-xl font-bold text-[var(--accent)]">{occupancyPct}%</p>
                    <p className="text-[10px] text-[var(--text-dim)] uppercase">Occupancy</p>
                  </div>
                </div>
                <div className="text-[10px] text-[var(--text-dim)] text-center pt-2 border-t border-[var(--border)]">
                  Total capacity: {totalCapacity} beds across {bedUnits.length} units
                </div>
              </div>
            </div>

            <div className="panel flex flex-col overflow-hidden">
              <div className="panel-header bg-[rgba(15,15,17,0.5)] flex justify-between items-center">
                <h3 className="section-title flex items-center gap-1.5">
                  <Activity size={13} className="text-rose-400" /> ER ESI Triage Queue
                </h3>
                <button
                  onClick={loadTriageQueue}
                  disabled={loadingTriage}
                  className="p-1 rounded hover:bg-slate-800 disabled:opacity-50 text-[var(--text-secondary)] transition-colors cursor-pointer"
                  title="Refresh triage queue"
                >
                  <RefreshCw size={11} className={loadingTriage ? "animate-spin" : ""} />
                </button>
              </div>
              <div className="flex-1 divide-y divide-[var(--border)] overflow-y-auto max-h-96">
                {loadingTriage && triageQueue.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--text-dim)] uppercase">
                    Loading triage queue...
                  </div>
                ) : triageQueue.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--text-dim)] uppercase font-mono border-t border-[var(--border)]">
                    No patients in ER waitlist.
                  </div>
                ) : (
                  triageQueue.map((item: any, idx: number) => {
                    const esiColors: Record<number, string> = {
                      1: "bg-red-500/10 border-red-500/30 text-red-500",
                      2: "bg-orange-500/10 border-orange-500/30 text-orange-500",
                      3: "bg-yellow-500/10 border-yellow-500/30 text-yellow-500",
                      4: "bg-blue-500/10 border-blue-500/30 text-blue-500",
                      5: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                    };
                    return (
                      <div key={idx} className="p-3 hover:bg-[rgba(255,255,255,0.01)] transition-colors">
                        <div className="flex justify-between items-start mb-1">
                          <div>
                            <span className="text-xs font-bold text-[var(--text-primary)]">{item.full_name}</span>
                            <span className="text-[9px] font-mono text-[var(--text-dim)] block">ID: #{item.patient_id}</span>
                          </div>
                          <span className={`text-[9px] font-mono border px-1.5 py-0.5 rounded-sm font-bold uppercase ${esiColors[item.esi_level] || "bg-slate-500/10 text-slate-400 border-slate-500/20"}`}>
                            ESI {item.esi_level}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] font-mono uppercase">
                          Vitals: {item.vital_summary}
                        </p>
                        <div className="text-[9px] font-mono text-[var(--warning)] uppercase mt-1 leading-normal">
                          Reason: {item.triage_reason}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
      </div>
    </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col font-sans"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
            >
              <div className="bg-zinc-950/80 border-b border-zinc-850 px-4 py-3 flex justify-between items-center">
                <h2 id="modal-title" className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <BedDouble size={14} className="text-indigo-400" />
                  Assign Bed & Admission
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors p-1 rounded-md hover:bg-zinc-800"
                  aria-label="Close modal"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleAssignBed} className="p-5 space-y-4">
                {modalError && (
                  <div className="p-3 bg-red-950/50 border border-red-900/50 rounded text-red-400 text-xs font-mono">
                    {modalError}
                  </div>
                )}
                {modalSuccess && (
                  <div className="p-3 bg-emerald-950/50 border border-emerald-900/50 rounded text-emerald-400 text-xs font-mono">
                    {modalSuccess}
                  </div>
                )}

                <div className="space-y-1">
                  <label htmlFor="patient-select" className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Patient Profile
                  </label>
                  <select
                    id="patient-select"
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value ? Number(e.target.value) : "")}
                    disabled={loading}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    required
                  >
                    <option value="">-- Choose Patient --</option>
                    {patients.map((p) => (
                      <option key={p.patient_id} value={p.patient_id}>
                        {p.full_name || p.username}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="dept-select" className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Ward Department
                  </label>
                  <select
                    id="dept-select"
                    value={selectedDepartmentId}
                    onChange={(e) => setSelectedDepartmentId(e.target.value ? Number(e.target.value) : "")}
                    disabled={loading}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    required
                  >
                    <option value="">-- Choose Department --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="bed-select" className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Available Bed Unit
                  </label>
                  <select
                    id="bed-select"
                    value={selectedBedId}
                    onChange={(e) => setSelectedBedId(e.target.value ? Number(e.target.value) : "")}
                    disabled={loading || !selectedDepartmentId}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    required
                  >
                    <option value="">
                      {!selectedDepartmentId ? "Select a department first" : "-- Choose Bed --"}
                    </option>
                    {beds
                      .filter(b => !selectedDepartmentId || b.department_id === Number(selectedDepartmentId))
                      .filter(b => b.status === "available")
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          Bed {b.bed_number} ({b.ward || "General"})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="reason-input" className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    Admission Reason
                  </label>
                  <textarea
                    id="reason-input"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={loading}
                    rows={3}
                    placeholder="Enter reason for admission..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 resize-none disabled:opacity-50"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-zinc-850">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    disabled={loading}
                    className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 hover:bg-zinc-750 hover:text-zinc-100 transition-all cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {loading ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      "Confirm Assignment"
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {inspectBed && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col font-sans"
              role="dialog"
              aria-modal="true"
              aria-labelledby="inspect-title"
            >
              <div className="bg-zinc-950/80 border-b border-zinc-850 px-4 py-3 flex justify-between items-center">
                <h2 id="inspect-title" className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <BedDouble size={14} className="text-indigo-400" />
                  Bed {inspectBed.bedCode} — {inspectBed.unit}
                </h2>
                <button
                  onClick={() => setInspectBed(null)}
                  className="text-zinc-400 hover:text-zinc-100 transition-colors p-1 rounded-md hover:bg-zinc-800"
                  aria-label="Close inspector"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-zinc-950/50 border-zinc-800">
                  <span className="text-xs font-mono uppercase text-zinc-400">Unit Status</span>
                  <span className={`text-xs font-mono font-bold uppercase px-2 py-0.5 rounded border ${
                    inspectBed.status === "occupied"
                      ? "bg-red-950/60 border-red-800 text-red-400"
                      : inspectBed.status === "cleaning"
                      ? "bg-amber-950/60 border-amber-800 text-amber-400"
                      : "bg-emerald-950/60 border-emerald-800 text-emerald-400"
                  }`}>
                    {inspectBed.status}
                  </span>
                </div>

                <div className="space-y-2 text-xs font-mono bg-zinc-950/30 p-3 rounded-lg border border-zinc-800/60">
                  <div className="flex justify-between text-zinc-300">
                    <span className="text-zinc-500">Unit Location:</span>
                    <span>{inspectBed.unit}</span>
                  </div>
                  <div className="flex justify-between text-zinc-300">
                    <span className="text-zinc-500">Bed Identification:</span>
                    <span>{inspectBed.bedCode}</span>
                  </div>
                  <div className="flex justify-between text-zinc-300">
                    <span className="text-zinc-500">Monitoring Sensor:</span>
                    <span className="text-emerald-400">Node telemetry link ACTIVE</span>
                  </div>
                  {inspectBed.status === "occupied" && (
                    <div className="flex justify-between text-zinc-300 pt-1 border-t border-zinc-800">
                      <span className="text-zinc-500">Assigned Patient:</span>
                      <span className="text-indigo-400 font-bold">{inspectBed.patientName || "Occupied"}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 justify-end pt-2 border-t border-zinc-850">
                  <button
                    onClick={() => setInspectBed(null)}
                    className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 hover:bg-zinc-750 hover:text-zinc-100 transition-all"
                  >
                    Close
                  </button>
                  {inspectBed.status === "available" ? (
                    <button
                      onClick={() => {
                        setInspectBed(null);
                        openAssignmentModal();
                      }}
                      className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-600/10"
                    >
                      Assign Patient
                    </button>
                  ) : (
                    <>
                      {inspectBed.status === "occupied" && (
                        <button
                          onClick={async () => {
                            const bed = beds.find(b => b.bed_number === inspectBed.bedCode && (b.ward || "General") === inspectBed.unit);
                            if (bed) {
                              try {
                                await updateBedStatus(bed.id, { status: "cleaning", current_patient_id: null });
                                dispatchCareEvent({
                                  event_type: "discharge-initiated",
                                  title: `Discharge initiated for bed ${inspectBed.bedCode}`,
                                  summary: `Patient in bed ${inspectBed.bedCode} (${inspectBed.unit}) marked for discharge. Bed transitioning to cleaning status.`,
                                  severity: "info",
                                }).catch(() => {});
                                toast.success(`Bed ${inspectBed.bedCode} discharged -- now in cleaning status.`);
                                const updatedBeds = await getBeds();
                                setBeds(updatedBeds);
                              } catch (err: any) {
                                toast.error(err.message || "Failed to discharge patient");
                              }
                            }
                            setInspectBed(null);
                          }}
                          className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-amber-600 hover:bg-amber-500 text-white transition-all"
                        >
                          Discharge Patient
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const bed = inspectBed;
                          setInspectBed(null);
                          if (bed) {
                            setTransferringBed({ unit: bed.unit, bedCode: bed.bedCode });
                          } else {
                            openAssignmentModal();
                          }
                        }}
                        className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white transition-all"
                      >
                        Transfer / Reassign
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {transferringBed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 font-sans">
          <div className="bg-[#0b0c10] border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-mono font-bold text-xs">
                  ⇄
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Bed Transfer Request</h3>
                  <p className="text-[10px] text-zinc-400 font-mono">Source Bed: {transferringBed.bedCode} ({transferringBed.unit})</p>
                </div>
              </div>
              <button onClick={() => setTransferringBed(null)} className="text-zinc-400 hover:text-white p-1">
                ✕
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-[10px] text-zinc-400 font-bold uppercase block mb-1">Select Target Destination Bed</label>
                <select
                  value={targetBedCode}
                  onChange={(e) => setTargetBedCode(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-white font-bold focus:outline-none focus:border-indigo-500"
                >
                  <option value="ICU-02">ICU Bed 02 (ICU Wing - Open)</option>
                  <option value="ICU-05">ICU Bed 05 (ICU Wing - Open)</option>
                  <option value="WAR-08">Ward Bed 08 (General Ward - Open)</option>
                  <option value="WAR-12">Ward Bed 12 (General Ward - Open)</option>
                  <option value="SURG-04">Surgical Bed 04 (Post-Op - Open)</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-300 font-sans">
                Transferring will automatically update patient bed assignment and change source bed ({transferringBed.bedCode}) to <strong className="text-amber-300 uppercase font-mono">cleaning</strong> status.
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10 font-sans">
              <button
                onClick={() => setTransferringBed(null)}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 hover:bg-zinc-750 hover:text-zinc-100 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  dispatchCareEvent({
                    event_type: "bed-transfer",
                    title: `Patient transfer from ${transferringBed.bedCode} to ${targetBedCode}`,
                    summary: `Patient transferred from source bed ${transferringBed.bedCode} (${transferringBed.unit}) to target bed ${targetBedCode}.`,
                    severity: "info",
                  }).catch(() => {});
                  toast.success(`Patient transferred from ${transferringBed.bedCode} to ${targetBedCode}!`);
                  setTransferringBed(null);
                }}
                className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-600/10 cursor-pointer"
              >
                Confirm Transfer
              </button>
            </div>
          </div>
        </div>
      )}
      {showOnboardingGuide && (
        <OnboardingGuideModal
          isOpen={showOnboardingGuide}
          onClose={() => setShowOnboardingGuide(false)}
        />
      )}
    </div>
  );
}
