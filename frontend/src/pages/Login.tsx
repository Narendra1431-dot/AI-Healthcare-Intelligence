import { useState, useEffect } from "react";
import { useAuthStore } from "@/lib/auth";
import { login, fetchProfile, forgotPassword } from "@/lib/api";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Lock,
  Mail,
  User,
  ArrowRight,
  HeartPulse,
  ShieldCheck,
  Stethoscope,
  ClipboardList,
  BrainCircuit,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const FEATURES = [
  { icon: BrainCircuit, label: "Clinical Intelligence" },
  { icon: ClipboardList, label: "Patient Health Timeline" },
  { icon: Stethoscope, label: "AI-Assisted Decision Support" },
  { icon: ShieldCheck, label: "Secure Role-Based Access" },
];

export default function LoginPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const isExpired = searchParams.get("expired") === "1";
  const reduceMotion = useReducedMotion();

  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  // Translate backend / network errors into clear, non-leaking user messages.
  function errorMessage(err: any): string {
    const msg: string = err?.message || "";
    const lower = msg.toLowerCase();
    if (err?.name === "ApiConnectionError" || lower.includes("connect") || lower.includes("failed to fetch")) {
      return "Unable to connect to the healthcare server. Please try again.";
    }
    if (lower.includes("inactive")) {
      return "Your account is currently inactive. Contact an administrator.";
    }
    if (lower.includes("incorrect username or password")) {
      return "Email or password is incorrect.";
    }
    if (lower.includes("2fa")) return msg;
    return msg || "Unable to sign in. Please try again.";
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    if (!identifier.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await login(identifier.trim(), password);
      // Store the token FIRST so that fetchProfile() can attach a Bearer header.
      // The minimal profile is overwritten once the real profile is fetched.
      useAuthStore
        .getState()
        .setAuth(res.access_token, {
          id: 0,
          username: identifier.trim(),
          email: "",
          full_name: "",
          role: "patient",
        });

      let profile: any;
      try {
        profile = await fetchProfile();
        useAuthStore.getState().setUser(profile);
      } catch {
        // Token is valid even if the profile call is interrupted; the minimal
        // profile set above remains. This is NOT a synthetic/fake session —
        // the backend-issued JWT remains the source of truth for identity/role.
        profile = { username: identifier.trim(), email: "", full_name: "", role: "patient" };
      }
      useAuthStore.getState().setAuth(res.access_token, profile);

      // Respect existing role-based routing.
      const role = profile?.role;
      const target =
        role === "admin" ? "/admin" : role === "patient" ? "/patient" : "/dashboard";
      navigate(target, { replace: true });
    } catch (err: any) {
      setError(errorMessage(err));
      useAuthStore.getState().logout();
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    if (!email.trim()) {
      setError("Please enter your registered email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await forgotPassword(email.trim());
      setSuccessMsg(
        res.message || "If this email is registered, a password reset link has been sent.",
      );
    } catch (err: any) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const entrance = reduceMotion
    ? { initial: false as const, animate: {} }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900">
      <div className="flex min-h-screen flex-col md:flex-row">
        {/* Left: Brand / healthcare identity panel */}
        <aside
          className="relative hidden overflow-hidden bg-gradient-to-br from-teal-700 via-cyan-700 to-indigo-800 text-white md:flex md:w-1/2"
          aria-hidden="true"
        >
          {/* Soft decorative orbs (subtle, no neon grid) */}
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-cyan-300/10 blur-3xl" />

          <motion.div
            {...entrance}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex w-full flex-col justify-between p-10 lg:p-14"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
                <HeartPulse size={22} className="text-white" strokeWidth={1.8} />
              </div>
              <div className="leading-tight">
                <p className="text-lg font-semibold tracking-tight">AI Healthcare Intelligence</p>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/70">
                  AI-Assisted Clinical Decision Support
                </p>
              </div>
            </div>

            <div className="my-10 max-w-md">
              <h1 className="text-3xl font-semibold leading-snug tracking-tight lg:text-4xl">
                Connect clinicians, patients, and intelligent clinical workflows in one secure
                workspace.
              </h1>
              <p className="mt-4 text-sm leading-relaxed text-white/75">
                AI Healthcare Intelligence unifies clinical decision support, patient health
                timelines, and role-based access in a calm, trustworthy environment.
              </p>

              <ul className="mt-8 space-y-3">
                {FEATURES.map((f) => (
                  <li key={f.label} className="flex items-center gap-3 text-sm text-white/90">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
                      <CheckCircle2 size={14} className="text-emerald-200" />
                    </span>
                    {f.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <p className="rounded-xl bg-white/10 p-4 text-[11px] leading-relaxed text-white/80 ring-1 ring-white/15">
                Clinical decision support only. Final diagnostic and treatment responsibility remains
                with a licensed clinician.
              </p>
              <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-white/60">
                <ShieldCheck size={13} /> Demo Environment · Synthetic Data
              </p>
              <p className="text-[11px] text-white/55">
                No real patient information is being used in this environment.
              </p>
            </div>
          </motion.div>
        </aside>

        {/* Right: Authentication card */}
        <main className="flex w-full items-center justify-center p-6 sm:p-10 md:w-1/2">
          <motion.div
            {...entrance}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md"
          >
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50 sm:p-10">
              {/* Mobile brand (left panel is hidden on small screens) */}
              <div className="mb-6 flex items-center gap-2 md:hidden">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-teal-600 to-indigo-700 text-white">
                  <HeartPulse size={18} strokeWidth={1.8} />
                </div>
                <div className="leading-tight">
                  <p className="text-sm font-semibold">AI Healthcare Intelligence</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">
                    Clinical Decision Support
                  </p>
                </div>
              </div>

              <header className="mb-6">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                  {view === "login" ? "Sign in" : "Reset your password"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {view === "login"
                    ? "Welcome back. Access your secure healthcare workspace."
                    : "Request a secure password reset link for your account."}
                </p>
              </header>

              {isExpired && !error && (
                <div
                  role="status"
                  className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800"
                >
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>Your session expired. Please sign in again.</span>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700"
                >
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div
                  role="status"
                  className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-700"
                >
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {view === "login" ? (
                <form onSubmit={handleLogin} className="space-y-5" noValidate>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-identifier"
                      className="block text-[13px] font-medium text-slate-700"
                    >
                      {t.username} / Email
                    </label>
                    <div className="relative">
                      <User
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        id="login-identifier"
                        type="text"
                        autoComplete="username"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="you@clinic.com or username"
                        aria-label="Email or username"
                        aria-invalid={!!error}
                        aria-describedby={error ? "login-error" : undefined}
                        className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="login-password"
                        className="block text-[13px] font-medium text-slate-700"
                      >
                        {t.password}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setView("forgot");
                          setError("");
                          setSuccessMsg("");
                        }}
                        className="text-[12px] font-semibold text-teal-700 transition hover:text-teal-800 hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        aria-label="Password"
                        aria-invalid={!!error}
                        className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-[13px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      Remember me
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !identifier.trim() || !password}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-indigo-700 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-teal-700 hover:to-indigo-800 focus:outline-none focus:ring-2 focus:ring-teal-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Signing in…
                      </>
                    ) : (
                      <>
                        Sign In
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-5" noValidate>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="forgot-email"
                      className="block text-[13px] font-medium text-slate-700"
                    >
                      Registered email
                    </label>
                    <div className="relative">
                      <Mail
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        id="forgot-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@clinic.com"
                        aria-label="Registered email"
                        className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-indigo-700 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-teal-700 hover:to-indigo-800 focus:outline-none focus:ring-2 focus:ring-teal-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Sending…
                      </>
                    ) : (
                      <>
                        Send reset link
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setView("login");
                        setError("");
                        setSuccessMsg("");
                      }}
                      className="text-[12px] font-semibold text-slate-500 transition hover:text-slate-700 hover:underline"
                    >
                      Back to sign in
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5 text-[11px] text-slate-400">
                <ShieldCheck size={14} className="text-teal-600" />
                <span>Secure Healthcare Workspace</span>
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 font-medium uppercase tracking-wide text-slate-500">
                  Demo Mode · Synthetic Data
                </span>
              </div>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
