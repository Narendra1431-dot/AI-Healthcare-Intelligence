import { render, screen } from '@testing-library/react';
import React from 'react';
import DashboardPage from '@/pages/Dashboard';
import { getDemoReadiness, getRecords } from '@/lib/api';
import { ApiConnectionError } from '@/lib/apiErrors';

vi.mock('next/link', () => ({
  default: function MockLink({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>;
  }
}));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode }) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => false,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RadarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PolarGrid: () => <div />,
  PolarAngleAxis: () => <div />,
  PolarRadiusAxis: () => <div />,
  Radar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  Area: () => <div />,
}));

const mockAuthState = {
  user: { id: 1, username: 'admin', full_name: 'Admin User', role: 'admin' },
  token: 'test-token',
  setAuth: vi.fn(),
  setUser: vi.fn(),
  logout: vi.fn(),
  isAuthenticated: () => true,
};

vi.mock('@/lib/auth', () => ({
  useAuthStore: (selector?: (state: any) => any) => selector ? selector(mockAuthState) : mockAuthState,
}));

vi.mock('@/lib/patientContext', () => ({
  usePatientContext: () => ({
    setPatientRaw: vi.fn(),
    clearPatient: vi.fn(),
    patient: null,
  }),
}));

vi.mock('@/lib/useTelemetry', () => ({
  useTelemetry: () => ({
    status: 'error',
    data: null,
  }),
}));

vi.mock('@/components/operations/OperationsCockpit', () => ({
  default: function MockOperationsCockpit() {
    return <div>Operations cockpit</div>;
  }
}));

vi.mock('@/components/operations/LiveECGMonitor', () => ({
  default: function MockLiveECGMonitor() {
    return <div data-testid="live-ecg-monitor">Live ECG Monitor</div>;
  }
}));

vi.mock('@/components/operations/RiskTrajectoryChart', () => ({
  default: function MockRiskTrajectoryChart() {
    return <div data-testid="risk-trajectory-chart">Risk Trajectory Chart</div>;
  }
}));

vi.mock('@/components/chat/ModelManager', () => ({
  ModelManager: function MockModelManager() {
    return <div>Model Manager</div>;
  }
}));

vi.mock('@/components/modals/TelemetryAlarmSnoozeModal', () => ({
  TelemetryAlarmSnoozeModal: function MockTelemetryAlarmSnoozeModal() {
    return <div>Telemetry Alarm Snooze Modal</div>;
  }
}));

vi.mock('@/lib/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
  }
}));

vi.mock('@/lib/prefetch', () => ({
  prefetchRoute: vi.fn(),
}));

vi.mock('@/lib/ripple', () => ({
  useMaterialRipple: () => ({ triggerRipple: vi.fn() }),
}));

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: {
      welcome: 'Welcome',
      patientRegistry: 'Patient Registry',
      engageCopilot: 'Engage Copilot',
    },
  }),
}));

vi.mock('@/lib/api', () => ({
  getDemoReadiness: vi.fn(() => Promise.resolve({
    status: 'demo-ready',
    demo_mode: true,
    environment: 'demo',
    required: {},
    optional: {},
    missing_required: [],
    capabilities: ['Local demo mode'],
    clinical_safety_note: 'Demo readiness is operational metadata only.',
    privacy_note: 'No patient data is returned.',
    source: 'backend.demo_readiness',
  })),
  getRecords: vi.fn(() => Promise.reject(new ApiConnectionError('/records'))),
  getAdminPatients: vi.fn(() => Promise.resolve([])),
  submitVitals: vi.fn(),
  getDoctorPatientMonitoringSignals: vi.fn(() => Promise.resolve({ open_signals: [] })),
  dispatchCareEvent: vi.fn(),
}));

vi.mock('@/lib/apiIntelligence', () => ({
  fetchDoctorDashboard: vi.fn(() => Promise.resolve({
    generated_at: new Date().toISOString(),
    high_priority_patients: [],
    abnormal_lab_alerts: [],
    recent_patient_changes: [],
    medication_safety_alerts: [],
    pending_ai_reviews: [],
    unresolved_ai_conflicts: [],
    upcoming_appointments: [],
    report_review_queue: [],
    patient_risk_overview: [],
  })),
  fetchTimeline: vi.fn(() => Promise.resolve([])),
  fetchRiskOverview: vi.fn(() => Promise.resolve({
    patient_id: 1,
    generated_at: new Date().toISOString(),
    risks: [],
    safety_events: [],
    overall_risk_level: 'low',
    recommended_review_level: 'routine',
    summary: 'No risk data available',
  })),
  fetchCareGaps: vi.fn(() => Promise.resolve([])),
  fetchReviews: vi.fn(() => Promise.resolve([])),
  fetchReportComparisons: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/components/ui', () => ({
  MetricCard: ({ label, value, unit, icon, trend, tone, hint, action, children }: any) => (
    <div data-testid="metric-card">
      <div>{label}</div>
      <div>{value}</div>
      {unit && <div>{unit}</div>}
      {hint && <div>{hint}</div>}
      {children}
    </div>
  ),
  Panel: ({ title, subtitle, icon, actions, children, className, bodyClassName }: any) => (
    <section className={className}>
      <header>
        {icon && <span>{icon}</span>}
        <div>
          {title && <h3>{title}</h3>}
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div>{actions}</div>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  ),
  Badge: ({ tone, children }: any) => <span className={`badge-${tone}`}>{children}</span>,
  SeverityBadge: ({ severity }: any) => <span className={`severity-${severity}`}>{severity}</span>,
  Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
  EmptyState: ({ icon, title, description }: any) => (
    <div data-testid="empty-state">
      {icon && <div>{icon}</div>}
      <h4>{title}</h4>
      {description && <p>{description}</p>}
    </div>
  ),
  ErrorState: ({ title, description, onRetry }: any) => (
    <div data-testid="error-state">
      <h4>{title}</h4>
      {description && <p>{description}</p>}
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  ),
  Button: ({ variant, size, className, children, onClick, ...props }: any) => (
    <button className={className} onClick={onClick} {...props}>{children}</button>
  ),
  Card: ({ className, children, hover }: any) => <div className={className}>{children}</div>,
  PageHeader: ({ title, subtitle, icon, actions }: any) => (
    <div>
      {icon && <div>{icon}</div>}
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {actions && <div>{actions}</div>}
    </div>
  ),
}));

describe('Dashboard readiness and degraded states', () => {
  it('shows demo mode indicator and handles backend errors gracefully', async () => {
    render(
      <React.Suspense fallback={<div>Loading...</div>}>
        <DashboardPage />
      </React.Suspense>
    );

    // Check for demo mode indicator in status bar
    expect(await screen.findByText('DEMO MODE', undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByText('SYNTHETIC DATA')).toBeInTheDocument();
    
    // Check that error states are handled (each section shows error/empty state)
    // The dashboard should render without crashing
    expect(screen.getByText('Clinical Command Center')).toBeInTheDocument();
    expect(getDemoReadiness).toHaveBeenCalledTimes(1);
    expect(getRecords).toHaveBeenCalledTimes(1);
  });
});