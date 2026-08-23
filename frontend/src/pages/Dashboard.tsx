import { useEffect, useState, useMemo, useRef, lazy, Suspense } from "react";
import { useAuthStore } from "@/lib/auth";
import { usePatientContext } from "@/lib/patientContext";
import { getRecords, getDemoReadiness, type HealthRecord } from "@/lib/api";
import { useTelemetry } from "@/lib/useTelemetry";
import {
  Activity, Clock, FileText, AlertTriangle, Sparkles, BrainCircuit,
  Wifi, WifiOff, Heart, Thermometer, ShieldAlert, ArrowRight,
  TrendingUp, BellRing, UserCheck, RefreshCw, Send, X, AlertCircle, Monitor,
  Users, Stethoscope, Pill, ClipboardList, LayoutDashboard, BarChart2,
  CheckCircle2, Search, ChevronDown, Sunrise, Bell, User, LogOut, Menu
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { prefetchRoute } from "@/lib/prefetch";
import { useTranslation } from "@/lib/i18n";
import { useMaterialRipple } from "@/lib/ripple";
import { API_BASE, authHeaders } from "@/lib/apiCore";
import { toast } from "@/lib/toast";
import {
  MetricCard, Panel, Badge, SeverityBadge, Skeleton, EmptyState, ErrorState,
  Button, Card, PageHeader
} from "@/components/ui";
import {
  fetchDoctorDashboard,
  fetchTimeline,
  fetchRiskOverview,
  fetchCareGaps,
  fetchReviews,
  fetchReportComparisons,
  type DoctorDashboard,
  type TimelineEvent,
  type RiskOverview,
  type CareGapResult,
  type ClinicalReview,
  type ReportComparison
} from "@/lib/apiIntelligence";

const RiskTrajectoryChart = lazy(() => import("@/components/operations/RiskTrajectoryChart"));
const OperationsCockpit = lazy(() => import("@/components/operations/OperationsCockpit"));

interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface PriorityPatient {
  patient_id: number;
  name: string;
  level: string;
  bed?: string;
  mrn?: string;
}

interface AbnormalLabAlert {
  patient_id: number;
  patient_name?: string;
  result_type: string;
  title: string;
  flag: boolean;
}

interface MedicationAlert {
  patient_id: number;
  patient_name?: string;
  overall_level: string;
  interactions: number;
  duplicate_therapies: number;
  contraindications: number;
  dosage_concerns: number;
  requires_clinician_review: boolean;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { setPatientRaw } = usePatientContext();
  const { t } = useTranslation();
  const { triggerRipple } = useMaterialRipple();
  const navigate = useNavigate();
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const { data: telemetry, status: wsStatus } = useTelemetry();
  const [demoReadiness, setDemoReadiness] = useState<{ status: string; demo_mode: boolean } | null>(null);

  const [doctorDashboard, setDoctorDashboard] = useState<SectionState<DoctorDashboard>>({
    data: null,
    loading: true,
    error: null,
  });

  const [timeline, setTimeline] = useState<SectionState<TimelineEvent[]>>({
    data: null,
    loading: true,
    error: null,
  });

  const [riskOverview, setRiskOverview] = useState<SectionState<RiskOverview>>({
    data: null,
    loading: true,
    error: null,
  });

  const [careGaps, setCareGaps] = useState<SectionState<CareGapResult[]>>({
    data: null,
    loading: true,
    error: null,
  });

  const [reviews, setReviews] = useState<SectionState<ClinicalReview[]>>({
    data: null,
    loading: true,
    error: null,
  });

  const [reportComparisons, setReportComparisons] = useState<SectionState<ReportComparison[]>>({
    data: null,
    loading: true,
    error: null,
  });

  const capacityPct = telemetry
    ? Math.round((telemetry.active_census / telemetry.total_capacity) * 100)
    : null;

  useEffect(() => {
    if (user?.role !== "admin" && user?.role !== "doctor") return;

    let cancelled = false;
    setDoctorDashboard(prev => ({ ...prev, loading: true, error: null }));

    fetchDoctorDashboard()
      .then(data => {
        if (!cancelled) setDoctorDashboard({ data, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) setDoctorDashboard({ data: null, loading: false, error: err.message });
      });

    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    setRecordsLoading(true);
    setRecordsError(null);

    getRecords()
      .then(data => {
        if (!cancelled) {
          setRecords(data);
          setRecordsLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setRecordsError(err.message);
          setRecordsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    getDemoReadiness()
      .then(setDemoReadiness)
      .catch(console.error);
  }, []);

  useEffect(() => {
    const priorityPatients = doctorDashboard.data?.high_priority_patients as unknown as PriorityPatient[] || [];
    if (!priorityPatients[0]?.patient_id) return;

    const patientId = priorityPatients[0].patient_id;
    let cancelled = false;
    setTimeline(prev => ({ ...prev, loading: true, error: null }));

    fetchTimeline(patientId)
      .then(data => {
        if (!cancelled) setTimeline({ data, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) setTimeline({ data: null, loading: false, error: err.message });
      });

    return () => { cancelled = true; };
  }, [doctorDashboard.data]);

  useEffect(() => {
    const priorityPatients = doctorDashboard.data?.high_priority_patients as unknown as PriorityPatient[] || [];
    if (!priorityPatients[0]?.patient_id) return;

    const patientId = priorityPatients[0].patient_id;
    let cancelled = false;
    setRiskOverview(prev => ({ ...prev, loading: true, error: null }));

    fetchRiskOverview(patientId)
      .then(data => {
        if (!cancelled) setRiskOverview({ data, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) setRiskOverview({ data: null, loading: false, error: err.message });
      });

    return () => { cancelled = true; };
  }, [doctorDashboard.data]);

  useEffect(() => {
    const priorityPatients = doctorDashboard.data?.high_priority_patients as unknown as PriorityPatient[] || [];
    if (!priorityPatients[0]?.patient_id) return;

    const patientId = priorityPatients[0].patient_id;
    let cancelled = false;
    setCareGaps(prev => ({ ...prev, loading: true, error: null }));

    fetchCareGaps(patientId)
      .then(data => {
        if (!cancelled) setCareGaps({ data, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) setCareGaps({ data: null, loading: false, error: err.message });
      });

    return () => { cancelled = true; };
  }, [doctorDashboard.data]);

  useEffect(() => {
    const priorityPatients = doctorDashboard.data?.high_priority_patients as unknown as PriorityPatient[] || [];
    if (!priorityPatients[0]?.patient_id) return;

    const patientId = priorityPatients[0].patient_id;
    let cancelled = false;
    setReviews(prev => ({ ...prev, loading: true, error: null }));

    fetchReviews(patientId)
      .then(data => {
        if (!cancelled) setReviews({ data, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) setReviews({ data: null, loading: false, error: err.message });
      });

    return () => { cancelled = true; };
  }, [doctorDashboard.data]);

  useEffect(() => {
    if (user?.role !== "admin" && user?.role !== "doctor") return;

    let cancelled = false;
    setReportComparisons(prev => ({ ...prev, loading: true, error: null }));

    fetchReportComparisons()
      .then(data => {
        if (!cancelled) setReportComparisons({ data, loading: false, error: null });
      })
      .catch(err => {
        if (!cancelled) setReportComparisons({ data: null, loading: false, error: err.message });
      });

    return () => { cancelled = true; };
  }, [user]);

  const renderSection = <T,>(
    section: SectionState<T>,
    renderContent: (data: T) => React.ReactNode,
    emptyTitle: string,
    emptyDescription?: string
  ) => {
    if (section.loading) {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <Skeleton className="w-full h-32" />
          <Skeleton className="w-3/4 h-32 mt-4" />
        </div>
      );
    }

    if (section.error) {
      return (
        <ErrorState
          title="Unable to load"
          description={section.error}
          onRetry={() => window.location.reload()}
        />
      );
    }

    if (!section.data) {
      return (
        <EmptyState
          icon={<AlertCircle size={22} />}
          title={emptyTitle}
          description={emptyDescription}
        />
      );
    }

    return <>{renderContent(section.data)}</>;
  };

  const getPatientName = (patientId: number, fallback?: string) => {
    const patient = doctorDashboard.data?.patient_risk_overview?.find(p => p.patient_id === patientId);
    if (patient && typeof patient === 'object' && 'full_name' in patient) {
      return (patient as any).full_name || fallback;
    }
    return fallback || `Patient #${patientId}`;
  };

  const displayChartData = useMemo(() => {
    if (records.length === 0) {
      return [];
    }
    return records.slice(0, 10).reverse().map((r) => ({
      name: new Date(r.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      riskScore: r.prediction.toLowerCase().includes("high") || r.prediction.toLowerCase().includes("positive") ? 80 : r.prediction.toLowerCase().includes("medium") ? 50 : 20,
    }));
  }, [records]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="w-full space-y-6 pb-12 selection:bg-[var(--accent)] selection:text-white relative">

      {/* ── TOP SYSTEM STATUS BAR ── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[var(--bg-surface)] border-b border-[var(--border)] rounded-t-xl" role="status" aria-label="System status bar">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--text-dim)]">System Status: Operational</span>
          <span className="text-[var(--text-dim)] ml-2">API: {telemetry?.system_latency_ms !== undefined ? telemetry.system_latency_ms : "—"}ms</span>
          <span className="text-[var(--text-dim)] ml-2">DB: Connected</span>
          {wsStatus === "connected" && (
            <span className="text-[var(--text-dim)] ml-2">
              <Wifi size={11} aria-hidden="true" className="text-[var(--success)]" /> WS Live
            </span>
          )}
          {wsStatus === "connecting" && (
            <span className="text-[var(--text-dim)] ml-2">
              <Wifi size={11} aria-hidden="true" className="animate-pulse text-[var(--warning)]" /> WS Connecting
            </span>
          )}
          {wsStatus !== "connected" && wsStatus !== "connecting" && (
            <span className="text-[var(--text-dim)] ml-2">
              <WifiOff size={11} aria-hidden="true" className="text-[var(--warning)]" /> WS Offline
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm hidden sm:block">
          <span>Last Updated: {new Date().toLocaleTimeString()}</span>
          {user && (
            <span className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center font-bold text-[9px]">
                {user.full_name?.charAt(0) || user.username?.charAt(0) || 'U'}
              </span>
              <span className="font-medium text-[var(--text-secondary)]">{user.full_name || user.username}</span>
              <Badge tone="info" className="capitalize">{user.role || 'clinician'}</Badge>
            </span>
          )}
        </div>
      </div>

      {/* ── PAGE HEADER ── */}
      <div className="px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
              <LayoutDashboard size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="display-title text-xl sm:text-2xl text-[var(--text-primary)] leading-tight truncate">
                {getGreeting()}, {user?.full_name || user?.username || "Clinician"}
              </h1>
              <p className="text-sm text-[var(--text-dim)] mt-1 truncate">
                AI-assisted clinical overview for today
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
            <Link to="/patients" onMouseEnter={() => prefetchRoute('/patients')}>
              <Button variant="secondary" size="sm" className="hidden sm:flex" onClick={(e) => { triggerRipple(e); toast.info("Browse patient registry"); }}>
                <FileText size={13} className="mr-1" /> Patient Registry
              </Button>
            </Link>
            <Link to="/chat" onMouseEnter={() => prefetchRoute('/chat')}>
              <Button variant="secondary" size="sm" className="hidden sm:flex" onClick={(e) => { triggerRipple(e); toast.info("Ask AI Copilot for clinical help"); }}>
                <Sparkles size={13} className="mr-1" /> AI Copilot
              </Button>
            </Link>
            <Link to="/risk" onMouseEnter={() => prefetchRoute('/risk')}>
              <Button variant="secondary" size="sm" className="hidden sm:flex" onClick={(e) => { triggerRipple(e); toast.info("Review population risk models"); }}>
                <BarChart2 size={13} className="mr-1" /> Risk Center
              </Button>
            </Link>
            <Link to="/care-gaps" onMouseEnter={() => prefetchRoute('/care-gaps')}>
              <Button variant="primary" size="sm" className="hidden sm:flex" onClick={(e) => { triggerRipple(e); toast.info("Check overdue follow-ups and screenings"); }}>
                <ClipboardList size={13} className="mr-1" /> Care Gaps
              </Button>
            </Link>
            <Button variant="ghost" size="sm" className="sm:hidden" onClick={(e) => { triggerRipple(e); }}>
              <Menu size={16} />
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI METRIC ROW ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Active Census"
          value={telemetry?.active_census ?? "—"}
          unit={`/ ${telemetry?.total_capacity ?? "—"} beds`}
          icon={<Users size={20} />}
          tone="info"
          hint={capacityPct !== null ? `${capacityPct}% occupancy` : "Loading..."}
        />
        <MetricCard
          label="High-Priority Patients"
          value={doctorDashboard.data?.high_priority_patients?.length ?? 0}
          icon={<AlertTriangle size={20} />}
          tone={doctorDashboard.data && doctorDashboard.data.high_priority_patients && doctorDashboard.data.high_priority_patients.length > 0 ? "danger" : "success"}
          hint="Requires immediate review"
        />
        <MetricCard
          label="Abnormal Lab Alerts"
          value={doctorDashboard.data?.abnormal_lab_alerts?.length ?? 0}
          icon={<Activity size={20} />}
          tone={doctorDashboard.data && doctorDashboard.data.abnormal_lab_alerts && doctorDashboard.data.abnormal_lab_alerts.length > 0 ? "warning" : "success"}
          hint="Flagged for clinician review"
        />
        <MetricCard
          label="Pending AI Reviews"
          value={doctorDashboard.data?.pending_ai_reviews?.length ?? 0}
          icon={<ClipboardList size={20} />}
          tone="info"
          hint="Awaiting clinician sign-off"
        />
      </div>

      {/* ── MAIN COMMAND CENTER GRID (3 columns) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: Priority Patients (6 cols) */}
        <div className="lg:col-span-6">
          <Panel
            title="Priority Patients"
            subtitle="Patients requiring immediate clinical attention"
            icon={<AlertTriangle size={18} className="text-[var(--danger)]" />}
            actions={
              <Link to="/patients" className="text-xs text-[var(--accent)] hover:underline font-medium">View all →</Link>
            }
          >
            {renderSection(
              doctorDashboard,
              (data) => {
                const patients = (data.high_priority_patients as unknown as PriorityPatient[]) || [];
                if (patients.length === 0) {
                  return (
                    <EmptyState
                      icon={<UserCheck size={22} />}
                      title="No High-Priority Patients"
                      description="All assigned patients are currently stable."
                    />
                  );
                }
                return (
                  <div className="space-y-2">
                    {patients.slice(0, 8).map((patient, idx) => (
                      <Button
                        key={patient.patient_id}
                        variant="ghost"
                        className="w-full justify-start p-3 hover:bg-[var(--danger-soft)]/20 border border-[var(--danger-border)]/20 rounded-xl transition-colors"
                        onClick={() => {
                          setPatientRaw({ patient_id: patient.patient_id, full_name: patient.name, username: String(patient.patient_id) });
                          navigate(`/patients/${patient.patient_id}`);
                        }}
                      >
                        <div className="flex items-center gap-3 w-full">
                          <span className="w-8 h-8 rounded-full bg-[var(--danger-soft)] text-[var(--danger)] flex items-center justify-center font-bold text-sm">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-[var(--text-primary)] truncate">
                              {patient.name || `Patient #${patient.patient_id}`}
                            </p>
                            <p className="text-xs text-[var(--text-dim)] font-mono">
                              MRN: {patient.mrn || patient.patient_id} • Risk: {patient.level}
                            </p>
                          </div>
                          <Badge tone="danger">{patient.level.toUpperCase()}</Badge>
                          <ArrowRight size={16} className="text-[var(--text-dim)]" />
                        </div>
                      </Button>
                    ))}
                    {patients.length > 8 && (
                      <Link to="/patients" className="block text-center text-sm text-[var(--accent)] hover:underline py-2">
                        View all {patients.length} priority patients →
                      </Link>
                    )}
                  </div>
                );
              },
              "No Priority Patients",
              "All patients are currently stable with no high-risk flags."
            )}
          </Panel>
        </div>

        {/* CENTER: Requires Attention (3 cols) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Abnormal Lab Alerts */}
          <Panel title="Abnormal Lab Alerts" subtitle="Recent flagged results requiring review" icon={<Activity size={18} className="text-[var(--warning)]" />}>
            {renderSection(
              doctorDashboard,
              (data) => {
                const alerts = (data.abnormal_lab_alerts as unknown as AbnormalLabAlert[]) || [];
                if (alerts.length === 0) {
                  return (
                    <EmptyState
                      icon={<CheckCircle2 size={22} className="text-[var(--success)]" />}
                      title="No Abnormal Labs"
                      description="All recent lab results are within normal ranges."
                    />
                  );
                }
                return (
                  <div className="space-y-2">
                    {alerts.slice(0, 6).map((alert, idx) => (
                      <Card key={idx} className="p-3 border-[var(--warning-border)]/50 hover:border-[var(--warning-border)] transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[var(--text-primary)]">{alert.title}</p>
                            <p className="text-xs text-[var(--text-dim)] font-mono">
                              {alert.result_type} • {getPatientName(alert.patient_id, alert.patient_name)}
                            </p>
                          </div>
                          <SeverityBadge severity={alert.flag ? "critical" : "medium"} />
                        </div>
                      </Card>
                    ))}
                  </div>
                );
              },
              "No Abnormal Labs",
              "All recent lab results are within normal ranges."
            )}
          </Panel>

          {/* Medication Safety Alerts */}
          <Panel title="Medication Safety Alerts" subtitle="Drug interactions and safety concerns" icon={<Pill size={18} className="text-[var(--danger)]" />}>
            {renderSection(
              doctorDashboard,
              (data) => {
                const alerts = (data.medication_safety_alerts as unknown as MedicationAlert[]) || [];
                if (alerts.length === 0) {
                  return (
                    <EmptyState
                      icon={<ShieldAlert size={22} className="text-[var(--success)]" />}
                      title="No Medication Alerts"
                      description="No drug interactions or safety concerns detected."
                    />
                  );
                }
                return (
                  <div className="space-y-2">
                    {alerts.slice(0, 6).map((alert, idx) => (
                      <Card key={idx} className="p-3 border border-[var(--border)] hover:border-[var(--accent-border)]/50 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[var(--text-primary)]">
                              {getPatientName(alert.patient_id, alert.patient_name)}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-1 text-[10px] font-mono text-[var(--text-dim)]">
                              <span className="px-2 py-0.5 rounded bg-[var(--bg-surface-3)]">
                                {alert.interactions} interactions
                              </span>
                              <span className="px-2 py-0.5 rounded bg-[var(--bg-surface-3)]">
                                {alert.duplicate_therapies} duplicates
                              </span>
                              <span className="px-2 py-0.5 rounded bg-[var(--bg-surface-3)]">
                                {alert.contraindications} contraind.
                              </span>
                              {alert.dosage_concerns > 0 && (
                                <span className="px-2 py-0.5 rounded bg-[var(--warning-soft)] text-[var(--warning)]">
                                  {alert.dosage_concerns} dosage
                                </span>
                              )}
                            </div>
                          </div>
                          <Badge tone={alert.requires_clinician_review ? "danger" : alert.overall_level === "high" ? "warning" : "info"}>
                            {alert.overall_level}
                          </Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                );
              },
              "No Medication Alerts",
              "No drug interactions or safety concerns detected."
            )}
          </Panel>
        </div>

        {/* RIGHT: Risk Overview (3 cols) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Population Risk Distribution */}
          <Panel title="Population Risk Distribution" subtitle="Current census risk stratification" icon={<BarChart2 size={18} className="text-[var(--accent)]" />}>
            {renderSection(
              doctorDashboard,
              (data) => {
                const riskOverviewData = data.patient_risk_overview as unknown as Array<{ risk_level: string }> || [];
                const riskCounts = riskOverviewData.reduce((acc, p) => {
                  const level = (p.risk_level || 'unknown').toLowerCase();
                  acc[level] = (acc[level] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);

                const categories = [
                  { key: 'critical', label: 'Critical', color: 'var(--danger)', count: riskCounts.critical || 0 },
                  { key: 'high', label: 'High', color: 'var(--danger)', count: riskCounts.high || 0 },
                  { key: 'medium', label: 'Medium', color: 'var(--warning)', count: riskCounts.medium || 0 },
                  { key: 'low', label: 'Low', color: 'var(--success)', count: riskCounts.low || 0 },
                  { key: 'stable', label: 'Stable', color: 'var(--info)', count: riskCounts.stable || 0 },
                ].filter(c => c.count > 0);

                if (categories.length === 0) {
                  return (
                    <EmptyState
                      icon={<BarChart2 size={22} className="text-[var(--text-dim)]" />}
                      title="No Risk Data"
                      description="Select a priority patient to view population risk distribution."
                    />
                  );
                }

                const total = categories.reduce((sum, c) => sum + c.count, 0);

                return (
                  <div className="space-y-3">
                    {categories.map((cat) => (
                      <div key={cat.key} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium capitalize flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                            {cat.label}
                          </span>
                          <span className="font-mono font-bold">{cat.count}</span>
                        </div>
                        <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${(cat.count / total) * 100}%`, background: cat.color }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              },
              "No Risk Data",
              "Select a priority patient to view population risk distribution."
            )}
          </Panel>

          {/* Risk Trajectory */}
          <Panel title="Risk Trajectory" subtitle="Population risk trend over time" icon={<TrendingUp size={18} className="text-[var(--accent-purple)]" />}>
            <div className="h-56 w-full overflow-hidden flex items-center justify-center">
              {recordsLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <Skeleton className="w-full h-56" />
                </div>
              ) : recordsError ? (
                <ErrorState title="Chart data unavailable" description={recordsError} />
              ) : (
                <Suspense fallback={
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider font-mono">Loading chart...</p>
                  </div>
                }>
                  <RiskTrajectoryChart data={displayChartData} />
                </Suspense>
              )}
            </div>
          </Panel>

          {/* Patient Risk Overview (if selected) */}
          <Panel title="Patient Risk Overview" subtitle="Multi-category risk assessment" icon={<ShieldAlert size={18} className="text-[var(--accent-purple)]" />}>
            {renderSection(
              riskOverview,
              (data) => (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-dim)] uppercase">Overall Risk</span>
                    <Badge tone={data.overall_risk_level === "high" || data.overall_risk_level === "critical" ? "danger" : data.overall_risk_level === "medium" ? "warning" : "success"}>
                      {data.overall_risk_level.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {data.risks.slice(0, 5).map((risk) => (
                      <div key={risk.id} className="space-y-1">
                        <div className="justify-between text-xs">
                          <span className="font-medium capitalize">{risk.risk_category.replace('_', ' ')}</span>
                          <span className="font-mono font-bold">{risk.score}%</span>
                        </div>
                        <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${risk.score}%`,
                              background: risk.score > 70 ? "var(--danger)" : risk.score > 40 ? "var(--warning)" : "var(--accent)"
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-[var(--text-dim)] line-clamp-2">{data.summary}</p>
                </div>
              ),
              "Risk Data Unavailable",
              "Select a priority patient to view risk assessment."
            )}
          </Panel>
        </div>
      </div>

      {/* ── LOWER FOUR-PANEL GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Care Gaps Summary */}
        <Panel title="Care Gaps Summary" subtitle="Overdue follow-ups and screenings" icon={<ClipboardList size={18} className="text-[var(--warning)]" />} actions={<Link to="/care-gaps" className="text-xs text-[var(--accent)] hover:underline font-medium">View all →</Link>}>
          {renderSection(
            careGaps,
            (data) => {
              if (data.length === 0) {
                return (
                  <EmptyState
                    icon={<CheckCircle2 size={22} className="text-[var(--success)]" />}
                    title="No Care Gaps"
                    description="All recommended follow-ups and screenings are up to date."
                  />
                );
              }
              const gapTypes = data.reduce((acc, gap) => {
                acc[gap.gap_type] = (acc[gap.gap_type] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    {Object.entries(gapTypes).slice(0, 4).map(([type, count]) => (
                      <div key={type} className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)]">
                        <p className="text-xl font-bold text-[var(--text-primary)]">{count}</p>
                        <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-wide">{type.replace('_', ' ')}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 border-t border-[var(--border)] pt-3">
                    {data.slice(0, 3).map((gap) => (
                      <Card key={gap.id} className="p-3 border border-[var(--border)] hover:border-[var(--accent-border)]/50 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[var(--text-primary)]">{gap.title}</p>
                            <p className="text-xs text-[var(--text-dim)] font-mono">
                              {gap.gap_type.replace('_', ' ')} • {gap.severity}
                            </p>
                          </div>
                          <SeverityBadge severity={gap.severity} />
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            },
            "No Care Gaps",
            "All recommended follow-ups and screenings are up to date."
          )}
        </Panel>

        {/* Clinical Reviews */}
        <Panel title="Clinical Reviews" subtitle="AI outputs awaiting clinician sign-off" icon={<ClipboardList size={18} className="text-[var(--accent-blue)]" />} actions={<Link to="/reviews" className="text-xs text-[var(--accent)] hover:underline font-medium">View all →</Link>}>
          {renderSection(
            reviews,
            (data) => {
              if (data.length === 0) {
                return (
                  <EmptyState
                    icon={<CheckCircle2 size={22} className="text-[var(--success)]" />}
                    title="No Pending Reviews"
                    description="All AI-generated content has been reviewed."
                  />
                );
              }
              return (
                <div className="space-y-2">
                  {data.slice(0, 5).map((review) => (
                    <Card key={review.id} className="p-3 border border-[var(--border)] hover:border-[var(--accent-border)]/50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[var(--text-primary)]">
                            Review #{review.id} • {getPatientName(review.patient_id)}
                          </p>
                          <p className="text-xs text-[var(--text-dim)] font-mono">
                            {review.ai_summary?.substring(0, 80)}...
                          </p>
                        </div>
                        <Badge tone={review.priority === "urgent" || review.priority === "high" ? "danger" : review.priority === "medium" ? "warning" : "info"}>
                          {review.priority.toUpperCase()}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              );
            },
            "No Pending Reviews",
            "All AI-generated content has been reviewed."
          )}
        </Panel>

        {/* Recent Clinical Activity */}
        <Panel title="Recent Clinical Activity" subtitle="Latest timeline events across patients" icon={<Activity size={18} className="text-[var(--success)]" />}>
          {renderSection(
            timeline,
            (data) => {
              if (data.length === 0) {
                return (
                  <EmptyState
                    icon={<Activity size={22} className="text-[var(--text-dim)]" />}
                    title="No Recent Activity"
                    description="Select a patient to view their clinical timeline."
                  />
                );
              }
              return (
                <div className="space-y-2">
                  {data.slice(0, 6).map((event) => (
                    <Card key={event.id} className="p-3 border border-[var(--border)] hover:border-[var(--accent-border)]/50 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                          event.requires_review ? "bg-[var(--danger)]" :
                          event.risk_level === "high" ? "bg-[var(--warning)]" : "bg-[var(--success)]"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-[var(--text-primary)] truncate">{event.title}</p>
                            <span className="text-[10px] text-[var(--text-dim)] font-mono">
                              {new Date(event.date_time).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            {event.event_type.toUpperCase()} • {event.subtype || "General"}
                            {event.requires_review && <span className="ml-2 text-[var(--danger)] font-bold">⚠ Requires Review</span>}
                          </p>
                          {event.description && (
                            <p className="text-xs text-[var(--text-dim)] mt-1 line-clamp-1">{event.description}</p>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              );
            },
            "No Recent Activity",
            "Select a patient to view their clinical timeline."
          )}
        </Panel>

        {/* Report Comparisons */}
        <Panel title="Report Comparisons" subtitle="Cross-report change detection" icon={<FileText size={18} className="text-[var(--accent-purple)]" />} actions={<Link to="/reports" className="text-xs text-[var(--accent)] hover:underline font-medium">View all →</Link>}>
          {renderSection(
            reportComparisons,
            (data) => {
              if (data.length === 0) {
                return (
                  <EmptyState
                    icon={<FileText size={22} className="text-[var(--text-dim)]" />}
                    title="No Report Comparisons"
                    description="Run report comparisons from the Reports page."
                  />
                );
              }
              return (
                <div className="space-y-2">
                  {data.slice(0, 5).map((comp) => (
                    <Card key={comp.id} className="p-3 border border-[var(--border)] hover:border-[var(--accent-border)]/50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[var(--text-primary)]">
                            Comparison #{comp.id}
                          </p>
                          <p className="text-xs text-[var(--text-dim)] font-mono">
                            Risk trend: {comp.risk_trend || "stable"} • Score: {comp.overall_risk_score?.toFixed(1) || "N/A"}
                          </p>
                        </div>
                        <Badge tone={comp.requires_clinician_attention ? "danger" : "success"}>
                          {comp.requires_clinician_attention ? "Attention Needed" : "Reviewed"}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              );
            },
            "No Comparisons",
            "Run report comparisons from the Reports page."
          )}
        </Panel>
      </div>

      {/* ── OPERATIONS COCKPIT ── */}
      <OperationsCockpit />

      {/* ── FOOTER ── */}
      <div className="border-t border-[var(--border)] bg-[rgba(15,15,17,0.3)] px-5 py-4 rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-[11px] font-mono uppercase tracking-widest text-[var(--text-dim)]">
          <span className="flex items-center gap-1.5 text-[var(--success)] font-semibold">
            <ShieldAlert size={11} aria-hidden="true" />
            AI Healthcare Intelligence Platform · Clinical Decision Support System
          </span>
          {demoReadiness?.demo_mode && (
            <span className="flex items-center gap-1.5 text-[var(--warning)] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse" aria-hidden="true" />
              DEMO MODE · SYNTHETIC DATA
            </span>
          )}
        </div>
      </div>
    </div>
  );
}