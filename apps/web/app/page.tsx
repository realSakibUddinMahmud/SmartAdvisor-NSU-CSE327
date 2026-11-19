'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useSmartAdvisor,
  DEMO_DEFAULT_PASSWORD,
  SEEDED_DEMO_ACCOUNTS
} from '@/store/smartAdvisorStore';
import { UserRole } from '@/types';
import {
  GraduationCap,
  Users,
  Lock,
  Activity,
  AlertTriangle,
  Info,
  Loader2
} from 'lucide-react';

function getRoleDestination(role: UserRole): string {
  if (role === 'student') return '/student/dashboard';
  if (role === 'faculty') return '/faculty/exceptions';
  return '/admin/health';
}

export default function LoginPage() {
  const router = useRouter();
  const { login, switchDemoRole, authLoading, authUser, metrics } = useSmartAdvisor();

  const [activeTab, setActiveTab] = useState<UserRole>('student');
  const [nsuId, setNsuId] = useState(SEEDED_DEMO_ACCOUNTS.student.id);
  const [password, setPassword] = useState(DEMO_DEFAULT_PASSWORD);
  const [rememberMe, setRememberMe] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [showCredentialHint, setShowCredentialHint] = useState(false);

  const handleRoleTabChange = (role: UserRole) => {
    setActiveTab(role);
    setNsuId(SEEDED_DEMO_ACCOUNTS[role].id);
    setFormError(null);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const result = await login(nsuId, password, activeTab, rememberMe);
    if (!result.ok || !result.data) {
      setFormError(result.message || 'Authentication failed. Please check your credentials.');
      return;
    }
    router.push(getRoleDestination(result.data.user.role));
  };

  const quickDemoLogin = async (role: UserRole, targetRoute: string) => {
    setFormError(null);
    setActiveTab(role);
    setNsuId(SEEDED_DEMO_ACCOUNTS[role].id);
    setPassword(DEMO_DEFAULT_PASSWORD);
    const result = await switchDemoRole(role);
    if (!result.ok) {
      setFormError(result.message || 'Quick demo sign-in failed.');
      return;
    }
    router.push(targetRoute);
  };

  const handleSsoSignIn = async () => {
    setFormError(null);
    const result = await switchDemoRole(activeTab);
    if (!result.ok || !result.data) {
      setFormError(result.message || 'NSU Workspace SSO authentication failed.');
      return;
    }
    router.push(getRoleDestination(result.data.user.role));
  };

  return (
    <div className="min-h-[calc(100vh-2.75rem)] flex flex-col lg:flex-row bg-slate-50 selection:bg-teal-500 selection:text-white">
      {/* Left Dark Navy Hero Panel */}
      <div className="lg:w-1/2 bg-[#0F2942] text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 rounded-full bg-teal-500/10 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none"></div>

        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs text-teal-300 font-mono tracking-wide mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            RDS GATEWAY LIVE &bull; NSU Official &bull; Bashundhara Campus
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white mb-4 leading-tight">
            Register smarter, <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 via-sky-300 to-indigo-300">
              not harder.
            </span>
          </h1>

          <p className="text-slate-300 text-sm sm:text-base max-w-lg leading-relaxed mb-10 font-normal">
            Autonomous advising and registration engine engineered to eliminate launch-minute seat contention,
            prerequisite errors, and manual approval bottlenecks.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
            <div className="p-4 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:border-teal-400/30 transition-all">
              <div className="text-xl sm:text-2xl font-black text-white tabular-nums">10,000+</div>
              <div className="text-xs text-slate-400 mt-1 font-medium">Concurrent Users</div>
              <div className="text-[10px] text-teal-400 mt-0.5">Stress-Tested</div>
            </div>

            <div className="p-4 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:border-teal-400/30 transition-all">
              <div className="text-xl sm:text-2xl font-black text-white tabular-nums">
                &lt;{metrics.slaCeilingMs} ms
              </div>
              <div className="text-xs text-slate-400 mt-1 font-medium">P95 Latency</div>
              <div className="text-[10px] text-teal-400 mt-0.5">
                Current: {metrics.p95LatencyMs} ms
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 hover:border-teal-400/30 transition-all">
              <div className="text-xl sm:text-2xl font-black text-white tabular-nums">&le;500 ms</div>
              <div className="text-xs text-slate-400 mt-1 font-medium">Seat State Sync</div>
              <div className="text-[10px] text-teal-400 mt-0.5">Redis Pub/Sub + WS</div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-white/10 text-xs text-slate-400 space-y-1">
          <div className="font-semibold text-slate-300">North South University &bull; Dept. of ECE</div>
          <div>
            <strong>Course:</strong> CSE 327 Sec 04 (Software Engineering) &bull; <strong>Supervisor:</strong> Intisar
            Tahmeed Sir [ITN]
          </div>
        </div>
      </div>

      {/* Right Authentication Card */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/90 p-8 sm:p-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Portal Gateway</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {authUser
                  ? `Signed in as ${authUser.name} (${authUser.role})`
                  : 'Select role and authenticate'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Phase 2 Registration: Open
            </span>
          </div>

          {/* Interactive Role Switcher Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => handleRoleTabChange('student')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'student'
                  ? 'bg-white text-nsu-navy shadow-sm border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
              Student
            </button>

            <button
              type="button"
              onClick={() => handleRoleTabChange('faculty')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'faculty'
                  ? 'bg-white text-nsu-navy shadow-sm border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-teal-600" />
              Faculty
            </button>

            <button
              type="button"
              onClick={() => handleRoleTabChange('admin')}
              className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'admin'
                  ? 'bg-white text-nsu-navy shadow-sm border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-rose-600" />
              IT Admin
            </button>
          </div>

          {formError && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Sign In Form */}
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label
                htmlFor="login-id"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                {activeTab === 'student'
                  ? '10-Digit NSU ID'
                  : activeTab === 'faculty'
                  ? 'Faculty Username'
                  : 'Administrator UID'}
              </label>
              <div className="relative">
                <input
                  id="login-id"
                  type="text"
                  value={nsuId}
                  onChange={(e) => setNsuId(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-nsu-teal focus:bg-white transition-all"
                  placeholder={SEEDED_DEMO_ACCOUNTS[activeTab].id}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowCredentialHint((v) => !v)}
                  className="text-xs text-nsu-teal hover:underline font-medium"
                >
                  Demo Credentials?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-nsu-teal focus:bg-white transition-all font-mono"
                />
              </div>
              {showCredentialHint && (
                <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-nsu-teal shrink-0 mt-0.5" />
                  <div>
                    Seeded IDs: <code className="font-mono">2412159042</code> (Student),{' '}
                    <code className="font-mono">nova.ahmed</code> /{' '}
                    <code className="font-mono">nabeel.mohammed</code> (Faculty),{' '}
                    <code className="font-mono">admin.itops</code> (Admin). Default password:{' '}
                    <code className="font-mono font-semibold">{DEMO_DEFAULT_PASSWORD}</code>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded text-nsu-teal focus:ring-nsu-teal"
                />
                Keep tab session active
              </label>
              <span className="flex items-center gap-1 text-slate-400 font-mono text-[11px]">
                <Lock className="w-3 h-3 text-slate-400" />
                JWT + RBAC
              </span>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 px-4 rounded-xl bg-[#0F2942] hover:bg-[#0B3B59] disabled:opacity-60 text-white text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <span>Sign in &rarr;</span>
              )}
            </button>
          </form>

          {/* NSU Google Workspace SSO */}
          <div className="mt-5">
            <button
              type="button"
              disabled={authLoading}
              onClick={handleSsoSignIn}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>NSU Google Workspace (@northsouth.edu)</span>
            </button>
          </div>

          {/* 1-Click Fast Track Demo Links */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 text-center">
              1-Click Authenticated Demo Access:
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={authLoading}
                onClick={() => quickDemoLogin('student', '/student/dashboard')}
                className="py-1.5 px-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60 text-indigo-700 text-[11px] font-semibold text-center transition-colors"
              >
                Rahim Ahmed
              </button>
              <button
                type="button"
                disabled={authLoading}
                onClick={() => quickDemoLogin('faculty', '/faculty/exceptions')}
                className="py-1.5 px-2 rounded-lg bg-teal-50 hover:bg-teal-100 disabled:opacity-60 text-teal-700 text-[11px] font-semibold text-center transition-colors"
              >
                Dr. Nova Ahmed
              </button>
              <button
                type="button"
                disabled={authLoading}
                onClick={() => quickDemoLogin('admin', '/admin/health')}
                className="py-1.5 px-2 rounded-lg bg-rose-50 hover:bg-rose-100 disabled:opacity-60 text-rose-700 text-[11px] font-semibold text-center transition-colors"
              >
                IT Operations
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
