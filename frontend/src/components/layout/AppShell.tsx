/**
 * Application shell — left sidebar + top header + content area.
 * The unified clinical frame for the whole platform.
 */
import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, BrainCircuit, FileText, Activity, ClipboardList,
  Bot, Microscope, CheckSquare, CalendarDays, Bell, Settings, Stethoscope,
  Search, Menu, ChevronDown, LogOut, ShieldCheck, X, PanelLeftClose, PanelLeft,
  Wifi, WifiOff, Database, Cpu, Server, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { useDemoStore } from '@/lib/demoMode';
import { Avatar, Badge, Modal, Pill, Skeleton } from '@/components/ui';
import { GlobalSearch } from './GlobalSearch';
import { NotificationsPanel } from './NotificationsPanel';
import { useTelemetry } from '@/lib/useTelemetry';
import { getDemoReadiness } from '@/lib/api';
import { API_BASE, authHeaders } from '@/lib/apiCore';

interface NavItem { title: string; href: string; icon: React.ElementType; roles?: string[] }
interface NavGroup { label: string; items: NavItem[]; roles?: string[] }

const ALL_NAV_GROUPS: NavGroup[] = [
  { label: 'Overview', items: [{ title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }] },
  {
    label: 'Clinical',
    roles: ['admin', 'doctor', 'nurse', 'pharmacist'],
    items: [
      { title: 'Patients', href: '/patients', icon: Users },
      { title: 'Clinical Intelligence', href: '/intelligence', icon: BrainCircuit },
      { title: 'Reports', href: '/reports', icon: FileText },
      { title: 'Medications', href: '/medications', icon: Pill },
      { title: 'Risk Center', href: '/risk', icon: Activity },
      { title: 'Care Gaps', href: '/care-gaps', icon: ClipboardList },
    ],
  },
  {
    label: 'AI',
    roles: ['admin', 'doctor', 'nurse'],
    items: [
      { title: 'AI Agents', href: '/agents', icon: Bot },
      { title: 'Evidence', href: '/evidence', icon: Microscope },
      { title: 'Clinical Reviews', href: '/reviews', icon: CheckSquare },
    ],
  },
  {
    label: 'Operations',
    roles: ['admin', 'doctor', 'nurse'],
    items: [
      { title: 'Appointments', href: '/appointments', icon: CalendarDays },
      { title: 'Notifications', href: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'Patient',
    items: [{ title: 'My Health', href: '/patient', icon: Stethoscope }],
  },
  { label: 'System', items: [{ title: 'Settings', href: '/settings', icon: Settings }] },
];

function filterNavGroups(role: string | undefined): NavGroup[] {
  const r = role || 'patient';
  return ALL_NAV_GROUPS.map((group) => {
    if (group.roles && !group.roles.includes(r)) {
      return { label: group.label, items: [] };
    }
    const items = group.items.filter((item) => !item.roles || item.roles.includes(r));
    return { label: group.label, items };
  }).filter((group) => group.items.length > 0);
}

export const NAV_GROUPS: NavGroup[] = ALL_NAV_GROUPS;

// ── System Status Bar Component ──────────────────────────────
function SystemStatusBar() {
  const { data: telemetry, status: wsStatus } = useTelemetry();
  const [demoReadiness, setDemoReadiness] = useState<{ status: string; demo_mode: boolean } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    getDemoReadiness()
      .then(setDemoReadiness)
      .catch(console.error);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setLastUpdated(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const capacityPct = telemetry
    ? Math.round((telemetry.active_census / telemetry.total_capacity) * 100)
    : null;

  return (
    <div className="hidden lg:flex flex-col md:flex-row md:items-center md:justify-between gap-2 px-4 py-2 font-mono text-[10px] tracking-wider text-[var(--text-dim)] uppercase bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl" role="status" aria-label="System status bar">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {demoReadiness?.demo_mode && (
          <span className="flex items-center gap-1.5 text-[var(--warning)] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] animate-pulse" aria-hidden="true" />
            DEMO MODE · SYNTHETIC DATA
          </span>
        )}
        <span className="flex items-center gap-1.5 text-[var(--success)] font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" aria-hidden="true" />
          System Operational
        </span>
        <span>API: {telemetry ? telemetry.system_latency_ms : "--"}ms</span>
        <span>DB: Connected</span>
        {wsStatus === "connected" ? (
          <span className="flex items-center gap-1 text-[var(--success)] font-semibold"><Wifi size={11} aria-hidden="true" /> WS Live</span>
        ) : wsStatus === "connecting" ? (
          <span className="flex items-center gap-1 text-[var(--warning)] font-semibold"><Wifi size={11} aria-hidden="true" className="animate-pulse" /> WS Connecting</span>
        ) : (
          <span className="flex items-center gap-1 text-[var(--warning)] font-semibold"><WifiOff size={11} aria-hidden="true" /> WS Offline</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span>Last Updated: {lastUpdated.toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

function useActiveCrumb() {
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const navGroups = useMemo(() => filterNavGroups(user?.role), [user?.role]);
  return useMemo(() => {
    for (const group of navGroups) {
      for (const item of group.items) {
        if (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))) {
          return { group: group.label, item: item.title, href: item.href };
        }
      }
    }
    return { group: '', item: '', href: '/dashboard' };
  }, [pathname, navGroups]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [demoInfo, setDemoInfo] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isDemo = useDemoStore((s) => s.isDemo);
  const crumb = useActiveCrumb();
  const navGroups = useMemo(() => filterNavGroups(user?.role), [user?.role]);

  useEffect(() => { useDemoStore.getState().detect(); }, []);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Sidebar (desktop) */}
      <aside
        className={`hidden md:flex flex-col bg-[var(--bg-app)] border-r border-[var(--border)] transition-[width] duration-200 ${collapsed ? 'w-[72px]' : 'w-[248px]'}`}
      >
        <SidebarInner collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} navGroups={navGroups} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] bg-[var(--bg-app)] border-r border-[var(--border)] anim-rise flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <BrandMark />
              <button className="btn btn-ghost btn-icon" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={16} /></button>
            </div>
            <SidebarInner collapsed={false} navGroups={navGroups} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-[var(--bg-app)]/85 backdrop-blur border-b border-[var(--border)]">
          <div className="h-16 flex items-center gap-3 px-4 sm:px-6">
            <button className="btn btn-ghost btn-icon md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={18} /></button>

            <nav className="hidden sm:flex items-center gap-1.5 text-sm min-w-0" aria-label="Breadcrumb">
              {crumb.group && <span className="text-[var(--text-dim)]">{crumb.group}</span>}
              {crumb.group && <ChevronDown size={14} className="text-[var(--text-muted)] -rotate-90" />}
              <span className="font-semibold text-[var(--text-primary)] truncate">{crumb.item || 'AI Healthcare Intelligence'}</span>
            </nav>

            {/* Search trigger */}
            <button
              onClick={() => setSearchOpen(true)}
              className="ml-auto hidden sm:flex items-center gap-2 h-9 px-3 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border-strong)] transition-smooth w-64"
            >
              <Search size={15} />
              <span className="text-sm">Search patients, reports…</span>
              <kbd className="ml-auto text-[10px] font-mono border border-[var(--border)] rounded px-1.5 py-0.5">⌘K</kbd>
            </button>
            <button className="btn btn-ghost btn-icon sm:hidden ml-auto" onClick={() => setSearchOpen(true)} aria-label="Search"><Search size={18} /></button>

            {/* Demo mode indicator */}
            <button
              onClick={() => setDemoInfo(true)}
              className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)] hover:brightness-110 transition-smooth"
              title="Synthetic demonstration data"
            >
              <ShieldCheck size={15} />
              <span className="text-xs font-semibold hidden lg:inline">Demo Mode</span>
            </button>

            {/* Notifications */}
            <div className="relative">
              <button className="btn btn-ghost btn-icon relative" onClick={() => setNotifOpen((o) => !o)} aria-label="Notifications">
                <Bell size={18} />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--danger)]" />
              </button>
              {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
            </div>

            {/* Profile */}
            <div className="relative">
              <button className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-[var(--bg-surface-2)] transition-smooth" onClick={() => setProfileOpen((o) => !o)}>
                <Avatar name={user?.full_name || user?.username || 'User'} size={30} />
                <ChevronDown size={14} className="text-[var(--text-dim)] hidden sm:inline" />
              </button>
              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 surface shadow-[var(--shadow-pop)] z-40 anim-scale-in p-1.5">
                    <div className="px-3 py-2 border-b border-[var(--border)]">
                      <div className="text-sm font-semibold">{user?.full_name || user?.username}</div>
                      <div className="text-xs text-[var(--text-dim)] truncate">{user?.email}</div>
                      <div className="mt-1"><Badge tone="info" className="capitalize">{user?.role || 'clinician'}</Badge></div>
                    </div>
                    <Link to="/settings" className="block px-3 py-2 text-sm rounded-md hover:bg-[var(--bg-surface-2)]" onClick={() => setProfileOpen(false)}>Settings</Link>
                    <Link to="/profile" className="block px-3 py-2 text-sm rounded-md hover:bg-[var(--bg-surface-2)]" onClick={() => setProfileOpen(false)}>Profile</Link>
                    <button
                      className="w-full text-left px-3 py-2 text-sm rounded-md text-[var(--danger)] hover:bg-[var(--danger-soft)] flex items-center gap-2"
                      onClick={() => { logout(); navigate('/login'); }}
                    >
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0">
          <div className="responsive-padding py-4 max-w-[1600px] mx-auto w-full">
            <SystemStatusBar />
            <div className="mt-4">
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Demo mode info modal */}
      <Modal open={demoInfo} onClose={() => setDemoInfo(false)} title={<span className="flex items-center gap-2"><ShieldCheck className="text-[var(--warning)]" size={20} /> Demonstration Environment</span>}
        subtitle="Synthetic data notice">
        <div className="space-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
          <p>
            This environment is using <strong className="text-[var(--text-primary)]">synthetic demonstration data</strong>.
            No real patient information is being used.
          </p>
          <p>
            All patients, labs, reports, medications, and clinical findings shown here are artificially generated for
            demonstration and evaluation purposes only. They must not be interpreted as real clinical records.
          </p>
          <div className="surface-2 p-3 rounded-lg flex items-start gap-2 text-xs text-[var(--text-dim)]">
            <ShieldCheck size={16} className="text-[var(--warning)] mt-0.5 shrink-0" />
            <span>AI-generated insights are decision-support only and do not replace qualified clinical judgement.</span>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SidebarInner({ collapsed, onToggle, navGroups }: { collapsed: boolean; onToggle?: () => void; navGroups: NavGroup[]; }) {
  const { pathname } = useLocation();
  return (
    <>
      <div className={`h-16 flex items-center gap-2.5 px-4 border-b border-[var(--border)] ${collapsed ? 'justify-center' : ''}`}>
        <BrandMark />
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight text-[var(--text-primary)]">Clinical Intelligence</div>
            <div className="text-[10px] text-[var(--text-dim)] leading-tight">AI Healthcare Platform</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && <div className="section-label px-2 mb-2">{group.label}</div>}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    title={collapsed ? item.title : undefined}
                    className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-smooth ${
                      active
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]'
                    } ${collapsed ? 'justify-center' : ''}`}
                  >
                    <Icon size={18} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.title}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {onToggle && (
        <div className="p-3 border-t border-[var(--border)]">
          <button className={`btn btn-ghost w-full ${collapsed ? 'btn-icon' : ''}`} onClick={onToggle}>
            {collapsed ? <PanelLeft size={16} /> : <><PanelLeftClose size={16} /> Collapse</>}
          </button>
        </div>
      )}
    </>
  );
}

function BrandMark() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 shrink-0" aria-label="Home">
      <span className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center shadow-sm">
        <Stethoscope size={18} className="text-white" />
      </span>
    </Link>
  );
}
