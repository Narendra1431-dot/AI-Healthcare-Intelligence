/**
 * Medical Reports — premium clinical intelligence workspace.
 *
 * Upload → extract → analyze → compare → verify → clinical review, every stage
 * calling the backend report-workflow endpoints and reflecting the persisted state.
 * On completion the patient's timeline, risk, care gaps and reviews are updated
 * server-side, so navigating to those pages shows the refreshed state.
 *
 * DEMO MODE · SYNTHETIC DATA is surfaced per the product brief.
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, UploadCloud, FileSearch, GitCompare, AlertTriangle, CheckCircle2,
  ArrowDownRight, ArrowUpRight, Minus, ShieldAlert, ListChecks,
  Loader2, Clock, Search,
} from 'lucide-react';
import { PatientPicker } from '@/components/PatientPicker';
import { Avatar } from '@/components/ui';
import { useClinicianPatient } from '@/lib/patientContext';
import type { ClinicianPatient } from '@/lib/patientContext';
import {
  uploadReport, runReportStage, fetchReportList, fetchReportAnalysis,
  fetchReportComparisons, createReportComparison, type ReportAnalysisResponse,
  type ReportListItem, type ReportComparison, type ReportStatus, type AbnormalFinding,
  type ReportStageEntry,
} from '@/lib/apiIntelligence';
import { useAsync } from '@/lib/useAsync';
import { toast } from '@/lib/toast';
import {
  PageHeader, Card, Button, EmptyState, ErrorState, Spinner, Disclaimer, Badge, Pill, SeverityBadge,
} from '@/components/ui';
import { useDemoStore } from '@/lib/demoMode';

type Tab = 'analyze' | 'comparisons';

// Pipeline step keys - these map to ReportStatus backend keys
type PipelineKey = 'upload' | 'extract' | 'analyze' | 'compare' | 'verify' | 'review';

const STAGES: { key: PipelineKey; label: string; backendKey: ReportStatus }[] = [
  { key: 'upload' as PipelineKey, label: 'Upload', backendKey: 'uploaded' },
  { key: 'extract' as PipelineKey, label: 'Extract', backendKey: 'extracted' },
  { key: 'analyze' as PipelineKey, label: 'Analyze', backendKey: 'analyzed' },
  { key: 'compare' as PipelineKey, label: 'Compare', backendKey: 'compared' },
  { key: 'verify' as PipelineKey, label: 'Verify', backendKey: 'completed' },
  { key: 'review' as PipelineKey, label: 'Review', backendKey: 'completed' },
];

// Status badges for all ReportStatus values including pipeline intermediates
const STATUS_BADGES: Record<ReportStatus, { tone: 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
  uploaded: { tone: 'info', label: 'Uploaded' },
  extracting: { tone: 'info', label: 'Processing' },
  extracted: { tone: 'info', label: 'Extracted' },
  analyzing: { tone: 'info', label: 'Analyzing' },
  analyzed: { tone: 'info', label: 'Analyzed' },
  comparing: { tone: 'info', label: 'Comparing' },
  compared: { tone: 'info', label: 'Compared' },
  verifying: { tone: 'info', label: 'Verifying' },
  completed: { tone: 'success', label: 'Verified' },
  failed: { tone: 'danger', label: 'Failed' },
};

function getStatusTone(status: ReportStatus): 'success' | 'warning' | 'danger' | 'info' {
  return STATUS_BADGES[status]?.tone ?? 'info';
}
function getStatusLabel(status: ReportStatus): string {
  return STATUS_BADGES[status]?.label ?? status;
}

const STATUS_ORDER: ReportStatus[] = ['uploaded', 'extracted', 'analyzed', 'compared', 'completed'];

function getPipelineStatusLabels(current: ReportAnalysisResponse | null) {
  const status = current?.status as ReportStatus | undefined;
  const completed = status ? STATUS_ORDER.indexOf(status) : -1;
  const isDone = (idx: number) => completed >= idx;
  return {
    extract: isDone(STATUS_ORDER.indexOf('extracted')) ? 'completed' : isDone(STATUS_ORDER.indexOf('uploaded')) ? 'active' : 'pending',
    analyze: isDone(STATUS_ORDER.indexOf('analyzed')) ? 'completed' : isDone(STATUS_ORDER.indexOf('extracted')) ? 'active' : 'pending',
    compare: isDone(STATUS_ORDER.indexOf('compared')) ? 'completed' : isDone(STATUS_ORDER.indexOf('analyzed')) ? 'active' : 'pending',
    verify: isDone(STATUS_ORDER.indexOf('completed')) ? 'completed' : isDone(STATUS_ORDER.indexOf('compared')) ? 'active' : 'pending',
    review: isDone(STATUS_ORDER.indexOf('completed')) ? 'completed' : isDone(STATUS_ORDER.indexOf('compared')) ? 'active' : 'pending',
  };
}

function formatTimestamp(iso: string | undefined | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

// Get patient info from the clinician patient hook
// useClinicianPatient() returns [patient, setPatient] tuple
function getPatientInfo(patient: ClinicianPatient | null): { name: string; mrn?: string; ageSex?: string; lastReport?: string; condition?: string } {
  if (!patient) return { name: 'Unknown' };
  const p = patient as { mrn?: number | string; age_sex?: string; condition?: string; last_report_date?: string } | null;
  return {
    name: patient.full_name || patient.username || 'Unknown',
    mrn: p?.mrn !== undefined ? String(p.mrn) : undefined,
    ageSex: p?.age_sex ?? undefined,
    lastReport: p?.last_report_date ?? undefined,
    condition: p?.condition ?? undefined,
  };
}

// Compute column class based on screen width
function getColumnClass(isDesktop: boolean): string {
  return isDesktop ? 'lg:col-span-1 space-y-5' : 'space-y-5';
}

// Compute pipeline step classes
const pipelineStepCompletedClass = 'bg-[var(--success-soft)] text-[var(--success)] border-[var(--success-border)]';
const pipelineStepActiveClass = 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]';
const pipelineStepFailedClass = 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger-border)]';
const pipelineStepPendingClass = 'text-[var(--text-dim)] border-[var(--border)]';

// Compute timeline span classes
function getTimelineExtractClass(status: string): string {
  return status === 'completed' ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]';
}
function getTimelineAnalyzeClass(status: string): string {
  return status === 'completed' ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]';
}
function getTimelineCompareClass(status: string): string {
  return status === 'completed' ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]';
}
function getTimelineVerifyClass(status: string): string {
  return status === 'completed' ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]';
}
function getTimelineReviewClass(status: string): string {
  return status === 'completed' ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]';
}
function getTimelineApprovedClass(): string {
  return 'text-[var(--success)]';
}

// Render pipeline steps
function renderPipelineSteps(current: ReportAnalysisResponse | null) {
  const status = current?.status as ReportStatus | undefined;
  const completed = status ? STATUS_ORDER.indexOf(status) : -1;
  const isDone = (idx: number) => completed >= idx;
  return (
    <div className="flex gap-1.5 pt-2">
      {STAGES.map((s) => {
        const key = s.key === 'extract' ? 'extract' : s.key;
const st: 'completed' | 'active' | 'failed' | 'pending' = isDone(STATUS_ORDER.indexOf(key as ReportStatus)) ? 'completed' :
              completed >= STATUS_ORDER.indexOf('uploaded') ? 'active' : 'pending';
        const cls = st === 'completed' ? pipelineStepCompletedClass :
                    st === 'active' ? pipelineStepActiveClass :
                    (st as string) === 'failed' ? pipelineStepFailedClass : pipelineStepPendingClass;
        return (
          <span key={s.key} className={cls}>
            {st === 'completed' && <CheckCircle2 size={11} />}{s.label}
          </span>
        );
      })}
    </div>
  );
}

export default function Reports() {
  const [tab, setTab] = useState<Tab>('analyze');
  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'analyze', label: 'Analyze Report', icon: FileSearch },
    { key: 'comparisons', label: 'Comparisons', icon: GitCompare },
  ];

  // useClinicianPatient returns [patient, setPatient] tuple
  const [patient, setPatient] = useClinicianPatient();
  const demo = useDemoStore();
  const [file, setFile] = useState<File | null>(null);
  const [current, setCurrent] = useState<ReportAnalysisResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pipelineLabel = busy
    ? <><Spinner size={14} /> Processing…</>
    : file ? 'Run report workflow' : 'Upload report';

  const patientInfo = getPatientInfo(patient);
  const pipelineStatus = getPipelineStatusLabels(current);
  const [comparisons, setComparisons] = useState<ReportComparison[]>([]);
  const [loadingComparisons, setLoadingComparisons] = useState(false);

  const list = useAsync<ReportListItem[]>(
    () => patient ? fetchReportList(patient.patient_id) : Promise.resolve([]),
    [patient?.patient_id],
  );

  useEffect(() => {
    if (patient && (list.data || []).length >= 2) {
      setLoadingComparisons(true);
      fetchReportComparisons()
        .then((comps) => {
          const patientComps = comps.filter((c: ReportComparison) =>
            (c.report_a_id && ((list.data || []).some((r: ReportListItem) => r.id === c.report_a_id)) ||
             c.report_b_id && ((list.data || []).some((r: ReportListItem) => r.id === c.report_b_id)))
          );
          setComparisons(patientComps);
        })
        .catch(() => {})
        .finally(() => setLoadingComparisons(false));
    } else {
      setComparisons([]);
    }
  }, [patient?.patient_id, list.data]);

  const onPick = (f: File | null) => { setFile(f); setError(null); };

  const refreshCurrent = async (id: number) => {
    const a = await fetchReportAnalysis(id);
    setCurrent(a);
    return a;
  };

  // ── Report pipeline visual ──────────────────────────────────────
  const pipelineSteps = [
    { key: 'upload', label: 'Upload', id: 'p-upload' },
    { key: 'extract', label: 'Extract', id: 'p-extract' },
    { key: 'analyze', label: 'Analyze', id: 'p-analyze' },
    { key: 'compare', label: 'Compare', id: 'p-compare' },
    { key: 'verify', label: 'Verify', id: 'p-verify' },
    { key: 'review', label: 'Clinical Review', id: 'p-review' },
  ];

  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth > 768 : true);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth > 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const runPipeline = async () => {
    if (!file || !patient) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadReport(file, patient!.patient_id!);
      setCurrent(uploaded);
      let a = uploaded;
      for (const stage of STAGES) {
        a = await runReportStage(a.id, stage.key as any);
        setCurrent(a);
        if (a.status === 'failed') {
          throw new Error(a.error_detail || `Report processing failed during ${stage.key}.`);
        }
      }
      toast.success('Report workflow completed');
      list.refetch();
      if (a.review_id) toast.info('A clinical review was created for this report.');
    } catch (e: any) {
      setError(e?.message || 'Report processing failed.');
    } finally {
      setBusy(false);
    }
  };

  // ── Empty analysis state ───────────────────────────────────────
  const emptyAnalysis = (
    <div className="text-center py-8">
      <AlertTriangle size={48} className="text-[var(--text-dim)] mx-auto mb-3" />
      <h4 className="text-sm font-medium text-[var(--text-secondary)]">No report selected</h4>
      <p className="text-xs text-[var(--text-dim)] mt-2">Upload or select a patient report to view AI-assisted clinical analysis.</p>
    </div>
  );

  // ── Report history item ────────────────────────────────────────
  const ReportHistoryItem = ({ r }: { r: ReportListItem }) => (
    <button
      key={r.id}
      onClick={() => refreshCurrent(r.id).catch(() => {})}
      className="w-full text-left py-3 flex items-center gap-3 hover:bg-[var(--bg-surface-2)] rounded transition-smooth"
    >
      <FileText size={16} className="text-[var(--accent)]" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{r.file_name}</div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span>{formatTimestamp(r.created_at)}</span>
          {r.abnormal_count > 0 && <Badge tone="danger">{r.abnormal_count} abnormal</Badge>}
        </div>
      </div>
      <Badge tone={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'danger' : 'info'}>
        {getStatusLabel(r.status)}
      </Badge>
    </button>
  );

  // ── Comparison summary ─────────────────────────────────────────
  const ComparisonSummary = ({ c }: { c: ReportComparison }) => {
    const changed = (c.what_changed?.items || []).length;
    const improved = (c.what_improved?.items || []).length;
    const worsened = (c.what_worsened?.items || []).length;
    const stable = (c.what_stayed_stable?.items || []).length;

    return (
      <div className="flex gap-2">
        <Pill tone="warning">{changed} Changed</Pill>
        <Pill tone="success">{improved} Improved</Pill>
        <Pill tone="danger">{worsened} Worsened</Pill>
        <Pill tone="info">{stable} Stable</Pill>
      </div>
    );
  };

  // ── Link card ──────────────────────────────────────────────────
  const LinkCard = ({ label, value, to }: { label: string; value: string; to: string }) => (
    <Link to={to} className="surface-2 p-2 rounded hover:border-[var(--accent-border)] transition-smooth">
      <span className="text-[var(--text-dim)]">{label}</span>
      <div className="font-medium text-[var(--accent)]">{value}</div>
    </Link>
  );

// ── Analysis detail ────────────────────────────────────────────
  const AnalysisDetail = ({ a }: { a: ReportAnalysisResponse }) => {
    // Clinical summary
    const summary = a.summary ? (
      <div className="mb-4">
        <div className="section-label mb-1.5">Clinical Summary</div>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{a.summary}</p>
      </div>
    ) : null;

    // Comparison changes - these properties exist at runtime but not on the type
    // @ts-ignore - comparison properties exist in runtime data but not on ReportAnalysisResponse type
    const comparison_changed_arr = a.comparison_changed;
    // @ts-ignore - comparison properties exist in runtime data but not on ReportAnalysisResponse type
    const comparison_improved_arr = a.comparison_improved;
    // @ts-ignore - comparison properties exist in runtime data but not on ReportAnalysisResponse type
    const comparison_worsened_arr = a.comparison_worsened;
    // @ts-ignore - comparison properties exist in runtime data but not on ReportAnalysisResponse type
    const comparison_stable_arr = a.comparison_stable;

    // Important findings - from abnormal_findings
    const findings = a.abnormal_findings.map((f, i) => (
      <div key={i} className="p-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)]">
        <div className="flex items-center gap-2">
          <SeverityBadge severity={f.severity} />
          <span className="text-sm font-medium">{f.marker}{f.value != null ? `: ${String(f.value)}` : ''}</span>
        </div>
        {f.message && <p className="text-xs text-[var(--text-secondary)] mt-1">{f.message}</p>}
      </div>
    ));

    // Abnormal findings section
    const abnormalSection = a.abnormal_findings.length > 0 ? (
      <div>
        <div className="section-label mb-1.5 text-[var(--danger)]">Important Findings</div>
        <div className="space-y-2">{findings}</div>
      </div>
    ) : null;

// Changes from comparison - using data from comparison_id on the analysis
    // Note: comparison_changed/improved/worsened/stable are not on ReportAnalysisResponse
    // They are on the ReportComparison object. Here we use what's stored on the analysis.
    const comparisonChanges = a.comparison_id ? (
      <div className="mb-4">
        <div className="section-label mb-1.5">Changes from Previous</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {comparison_changed_arr && (
            <div key="changed" className="text-xs text-[var(--text-secondary)]">
              {comparison_changed_arr.map(// @ts-ignore - comparison properties exist in runtime data but not on ReportAnalysisResponse type
                (it, i) => (
                  <div key={i} className="text-xs text-[var(--text-secondary)]">
                    <span className="font-medium">Changed:</span> {it.label ? `${it.label}` : JSON.stringify(it)}
                  </div>
                )
              )}
            </div>
          )}
          {comparison_improved_arr && (
            <div key="improved" className="text-xs text-[var(--success)]">
              {comparison_improved_arr.map(// @ts-ignore
                (it, i) => (
                  <div key={i} className="text-xs text-[var(--success)]">
                    <span className="font-medium">Improved:</span> {it.label ? `${it.label}: ${String(it.value)}` : JSON.stringify(it)}
                  </div>
                )
              )}
            </div>
          )}
          {comparison_worsened_arr && (
            <div key="worsened" className="text-xs text-[var(--danger)]">
              {comparison_worsened_arr.map(// @ts-ignore
                (it, i) => (
                  <div key={i} className="text-xs text-[var(--danger)]">
                    <span className="font-medium">Worsened:</span> {it.label ? `${it.label}: ${it.value}` : JSON.stringify(it)}
                  </div>
                )
              )}
            </div>
          )}
          {comparison_stable_arr && (
            <div key="stable" className="text-xs text-[var(--info)]">
              {comparison_stable_arr.map(// @ts-ignore
                (it, i) => (
                  <div key={i} className="text-xs text-[var(--info)]">
                    <span className="font-medium">Stable:</span> {it.label ? `${it.label}: ${it.value}` : JSON.stringify(it)}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    ) : null;

    // Evidence references - from backend disclaimer
    const evidenceSection = a.disclaimer ? (
      <div>
        <div className="section-label mb-1.5">Evidence</div>
        <p className="text-xs text-[var(--text-secondary)]">{a.disclaimer}</p>
      </div>
    ) : null;

    // Clinical review badge and navigation
    const reviewSection = (
      <div className="flex items-center gap-2">
        <Badge tone={a.requires_clinician_review ? 'warning' : 'info'}>
          {a.requires_clinician_review ? 'Clinician review' : 'No review'}
        </Badge>
        {a.review_id && (
          <Link to={`/reviews/${a.review_id}`} className="text-[var(--accent)] text-sm hover:underline">
            Open Review
          </Link>
        )}
      </div>
    );

    return (
      <div>
        {/* Report header badge */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-sm font-medium">{a.file_name}</span>
          <Badge tone={a.status === 'completed' ? 'success' : a.status === 'failed' ? 'danger' : 'info'}>{getStatusLabel(a.status)}</Badge>
          {a.requires_clinician_review && <Badge tone="warning">Clinician review</Badge>}
        </div>

        {/* Processing stages history */}
        <div className="mb-4">
          <div className="section-label mb-1.5">Processing stages</div>
          <ol className="space-y-1.5">
            {a.stage_history.map((s, i) => (
              <li key={i} className="text-xs text-[var(--text-secondary)] flex gap-2">
                <CheckCircle2 size={13} className="text-[var(--success)] mt-0.5 shrink-0" />
                <span>
                  <span className="font-medium capitalize">{s.stage}</span>
                  {s.detail ? ` — ${s.detail}` : ''}
                  <span className="text-[var(--text-dim)]">· {formatTimestamp(s.at)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {summary}
        {abnormalSection}
        {comparisonChanges}
        {evidenceSection}
        {reviewSection}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        icon={<FileText size={20} />}
        title="Medical Reports"
        subtitle="Upload, process, and compare medical reports through the real clinical workflow."
      />
      <Disclaimer className="mb-4" />

      {/* Demo mode banner */}
      {demo.isDemo && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--bg-surface-3)] border border-[var(--border)] text-xs">
          <span className="font-medium text-[var(--text-dim)]">DEMO MODE · SYNTHETIC DATA</span>
        </div>
      )}

      {/* Main content grid */}
      <div className="grid gap-4">

        {/* LEFT COLUMN: Patient selector + Upload */}
        <div className={getColumnClass(isDesktop)}>

          {/* Patient selector */}
          <Card className="p-5">
            <h3 className="section-title mb-3">Patient & report</h3>

            {patient ? (
              <div className="space-y-3">
<div className="flex items-center gap-3 w-10 h-10">
                  <Avatar name={patient.full_name || patient.username} />
                  <div>
                    <div className="text-sm font-medium text-[var(--text-primary)]">{patient.full_name || patient.username}</div>
                    <div className="text-xs text-[var(--text-dim)]">
                      MRN: {patientInfo.mrn !== undefined ? patientInfo.mrn : '—'}
                      {patientInfo.ageSex && <span className="mx-2">·</span>}
                      {patientInfo.ageSex && <span className="text-xs text-[var(--text-dim)]">{patientInfo.ageSex}</span>}
                    </div>
                  </div>
                </div>

                {/* Key condition / last report date */}
                {patientInfo.condition && (
                  <div className="text-xs text-[var(--text-dim)]">{patientInfo.condition}</div>
                )}
                {patientInfo.lastReport && (
                  <div className="text-xs text-[var(--text-dim)]">Last report: {patientInfo.lastReport}</div>
                )}
                {patient.patient_id && list.loading === false && list.data && list.data.length > 0 && (
                  <div>
                    <div className="text-xs text-[var(--text-dim)]">Reports: {list.data.length}</div>
                  </div>
                )}

                <PatientPicker value={patient?.patient_id} onSelect={setPatient} />
{error && <ErrorState title="Workflow error" description={error} onRetry={runPipeline} />}
              </div>
            ) : (
              <div className="pt-6 text-center">
                <AlertTriangle size={32} className="text-[var(--text-dim)] mx-auto mb-3" />
                <p className="text-sm text-[var(--text-secondary)]">Select a patient to view and analyze reports.</p>
                <PatientPicker value={patient!.patient_id} onSelect={setPatient} />
              </div>
            )}
          </Card>

          {/* Report upload area */}
          <Card className="p-5">
            <h3 className="section-title mb-3">Upload medical report</h3>

            <div className="flex items-center justify-between gap-2 mb-4">
              <span className="text-sm text-[var(--text-secondary)]">Supported formats:</span>
              <div className="flex flex-wrap gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-dim)]">PDF</span>
                <span className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-dim)]">Image</span>
                <span className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-dim)]">JSON</span>
                <span className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-dim)]">CSV</span>
                <span className="text-[10px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-dim)]">TXT</span>
              </div>
            </div>

            <div className="border-2 border-dashed border-[var(--border-strong)] rounded-xl p-6 text-center cursor-pointer hover:border-[var(--accent)] transition-smooth bg-[var(--bg-surface-2)] mb-5">
              <UploadCloud size={28} className="text-[var(--accent)] mb-2" />
              <div className="text-sm font-medium">Drag and drop or browse files</div>
              <div className="text-xs text-[var(--text-dim)]">PDF, PNG, JPG, JPEG, TXT, CSV, JSON</div>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.json"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
            </div>

            {file && (
              <div className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <FileText size={15} /> {file.name}
                <button className="btn btn-ghost btn-sm ml-auto" onClick={() => onPick(null)}>Clear</button>
              </div>
            )}

<div className="mt-4 flex items-center gap-1.5 flex-wrap">
              {renderPipelineSteps(current)}
              {busy
                ? <><Spinner size={14} /> Processing…</>
                : file ? 'Run report workflow' : 'Upload report'}
            </div>

            {!patient && <p className="text-xs text-[var(--text-dim)] mt-2">Select a patient first.</p>}
            {error && <ErrorState title="Workflow error" description={error} onRetry={runPipeline} />}
          </Card>
        </div>

        {/* MIDDLE COLUMN: AI Clinical Analysis (desktop) */}
        {isDesktop && (
          <div className="space-y-5">
            <Card className="p-5">
              <h3 className="section-title mb-3 flex items-center gap-2"><ListChecks size={15} /> AI Clinical Analysis</h3>
              {!current && (
                <EmptyState
                  icon={<FileSearch size={22} />}
                  title="No analysis yet"
                  description="Upload and run a report to see its persisted state, abnormal values, and review status."
                />
              )}
              {current && <AnalysisDetail a={current} />}
            </Card>
          </div>
        )}

        {/* RIGHT COLUMN: Report history + comparison (desktop only) */}
        {isDesktop && (
          <div className="space-y-5">
            {/* Patient Report History */}
            <Card className="p-5">
              <h3 className="section-title mb-3 flex items-center gap-2"><ListChecks size={15} /> Patient Reports</h3>

              {list.loading && <div className="flex justify-center py-6"><Spinner /></div>}
              {list.error && <ErrorState onRetry={list.refetch} />}

              {!patient && (
                <EmptyState title="Select a patient" description="Reports for the selected patient will appear here." />
              )}

              {patient && !list.loading && ((list.data || []).length === 0) && (
                <EmptyState title="No reports yet" />
              )}

              {patient && !list.loading && ((list.data || []).length > 0) && (
                <div className="divide-y divide-[var(--border)] max-h-80 overflow-y-auto">
                  {(list.data || []).map((r) => (
                    <ReportHistoryItem r={r} />
                  ))}
                </div>
              )}
            </Card>

            {/* Report Comparison */}
            <Card className="p-5">
              <h3 className="section-title mb-3 flex items-center gap-2"><GitCompare size={15} /> Report Comparison</h3>

              <div className="space-y-3">
                <p className="text-xs text-[var(--text-dim)]">Compare two analyzed reports to track changes over time.</p>

                {list.loading && <div className="flex justify-center py-4"><Spinner /></div>}
                {list.error && <ErrorState onRetry={list.refetch} />}

                {!patient && (
                  <EmptyState icon={<GitCompare size={22} />} title="Select a patient" description="Reports for comparison will appear here." />
                )}

                {patient && !list.loading && ((list.data || []).length < 2) && (
                  <EmptyState icon={<GitCompare size={22} />} title="Need 2 reports" description="Select a patient with at least 2 analyzed reports to enable comparison." />
                )}

                <div className="space-y-3">
                  {(list.data || []).length >= 2 && (
                    <div>
                      <p className="text-xs text-[var(--text-dim)]">Select reports to compare:</p>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {(list.data || []).map((r, i) => (
                          <button
                            key={r.id}
                            onClick={() => setTab('comparisons')}
                            className="border rounded px-3 py-1.5 text-xs font-medium transition-smooth text-[var(--text-primary)] hover:bg-[var(--bg-surface-2)]">
                              {r.file_name}
                            </button>
                          ))}
                      </div>
                      {(list.data || []).length >= 2 && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            const analyzed = ((list.data || []).filter(r => r.status === 'completed'));
                            if (analyzed.length >= 2) {
                              createReportComparison({ report_a_id: analyzed[0].id, report_b_id: analyzed[1].id }).then(() => list.refetch());
                            }
                          }}
                        >
                          Generate Comparison
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Comparison detail */}
                  {(list.data || []).length >= 2 && (
                    <div>
                      <h4 className="text-xs font-medium text-[var(--text-secondary)]">Or select a comparison:</h4>
                      <div className="mt-3">
                        {loadingComparisons ? (
                          <div className="p-3 text-xs text-[var(--text-dim)]">Loading comparisons...</div>
                        ) : comparisons.length === 0 ? (
                          <div className="p-3 text-xs text-[var(--text-dim)]">No comparisons available. Generate one above.</div>
                        ) : (
                          comparisons.map((c: ReportComparison) => (
                            <div key={c.id} className="p-3 rounded bg-[var(--bg-surface-2)] border border-[var(--border)] mb-2">
                              <div className="text-xs text-[var(--text-primary)]">Comparison {c.id}</div>
                              <div className="text-xs text-[var(--text-dim)]">Reports {c.report_a_id} vs {c.report_b_id}</div>
                              <div className="mt-2">
                                <button
                                  className="text-[var(--accent)] text-sm hover:underline"
                                  onClick={() => setTab('comparisons')}
                                >
                                  View Comparison
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Analysis panel on mobile (full width below grid) */}
        {!isDesktop && (
          <div className="space-y-5">
            <Card className="p-5">
              <h3 className="section-title mb-3 flex items-center gap-2"><ListChecks size={15} /> AI Clinical Analysis</h3>
              {!current && (
                <EmptyState
                  icon={<FileSearch size={22} />}
                  title="No analysis yet"
                  description="Upload and run a report to see its persisted state, abnormal values, and review status."
                />
              )}
              {current && <AnalysisDetail a={current} />}
            </Card>
          </div>
        )}

      </div>

      {/* Report timeline - full width below grid */}
      <div className="my-6 px-4 text-xs text-[var(--text-dim)]">
        <div className="flex gap-3 bg-[var(--bg-surface-2)] rounded-lg p-3">
          <span className="font-medium text-[var(--text-secondary)]">Report Lifecycle</span>
          <span>→</span>
          <span className={getTimelineExtractClass(pipelineStatus.extract)}>Extract</span>
          <span>→</span>
          <span className={getTimelineAnalyzeClass(pipelineStatus.analyze)}>Analyze</span>
          <span>→</span>
          <span className={getTimelineCompareClass(pipelineStatus.compare)}>Compare</span>
          <span>→</span>
          <span className={getTimelineVerifyClass(pipelineStatus.verify)}>Verify</span>
          <span>→</span>
          <span className={getTimelineReviewClass(pipelineStatus.review)}>Review</span>
          <span>→</span>
          <span className={getTimelineApprovedClass()}>Approved</span>
        </div>
      </div>
    </div>
  );
}
