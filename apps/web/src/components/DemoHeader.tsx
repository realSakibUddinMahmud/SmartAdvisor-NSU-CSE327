'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSmartAdvisor } from '@/store/smartAdvisorStore';
import { UserRole } from '@/types';
import {
  Sparkles,
  Zap,
  RotateCcw,
  AlertTriangle,
  Users,
  ChevronDown,
  GraduationCap,
  Activity,
  CheckCircle2,
  LogOut
} from 'lucide-react';

export function DemoHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    authUser,
    switchDemoRole,
    logout,
    simulateSurgeSpike,
    simulateSectionFull,
    resetDemoState,
    approveException,
    wsConnected,
    sseConnected
  } = useSmartAdvisor();

  const [isOpen, setIsOpen] = useState(false);

  const isStudent = pathname?.startsWith('/student');
  const isFaculty = pathname?.startsWith('/faculty');
  const isAdmin = pathname?.startsWith('/admin');

  const handlePortalSwitch = async (targetRole: UserRole, targetPath: string) => {
    if (!authUser || authUser.role !== targetRole) {
      await switchDemoRole(targetRole);
    }
    router.push(targetPath);
  };

  const handleSignOut = async () => {
    await logout();
    router.push('/');
  };

  const syncActive = wsConnected || sseConnected;

  return (
    <div className="bg-nsu-navy text-white text-xs border-b border-slate-700/80 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-1.5 sm:py-0 sm:h-11 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-2 gap-y-1.5">
        {/* Left: Branding */}
        <div className="flex items-center space-x-3 order-1 shrink-0">
          <Link
            href="/"
            className="flex items-center gap-1.5 font-bold tracking-tight text-white hover:text-indigo-200 transition-colors shrink-0"
          >
            <div className="w-5 h-5 rounded bg-indigo-500 flex items-center justify-center text-white font-black text-xs shadow-sm">
              S
            </div>
            <span className="font-mono font-semibold text-[11px] sm:text-xs">SmartAdvisor NSU</span>
          </Link>

          <span className="text-slate-600 hidden md:inline">|</span>
        </div>

        {/* Quick Portal Switcher Pills (full legible row on mobile, inline on sm+) */}
        <div className="order-3 sm:order-2 w-full sm:w-auto sm:mr-auto sm:ml-2 flex items-center justify-between sm:justify-start gap-1 border-t border-slate-700/70 sm:border-t-0 pt-1.5 sm:pt-0">
          <button
            type="button"
            onClick={() => handlePortalSwitch('student', '/student/dashboard')}
            className={`flex-1 sm:flex-initial justify-center px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              isStudent
                ? 'bg-nsu-teal text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5 shrink-0" />
            Student
          </button>

          <button
            type="button"
            onClick={() => handlePortalSwitch('faculty', '/faculty/exceptions')}
            className={`flex-1 sm:flex-initial justify-center px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              isFaculty
                ? 'bg-nsu-teal text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            Faculty
          </button>

          <button
            type="button"
            onClick={() => handlePortalSwitch('admin', '/admin/health')}
            className={`flex-1 sm:flex-initial justify-center px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              isAdmin
                ? 'bg-nsu-teal text-white shadow-sm font-semibold'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5 shrink-0" />
            IT Admin
          </button>
        </div>

        {/* Right: Auth status, Live Sync & Demo Controls Popover */}
        <div className="order-2 sm:order-3 flex items-center space-x-2 shrink-0">
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-700/80 text-[11px] text-emerald-400">
            <span
              className={`w-2 h-2 rounded-full ${
                syncActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            ></span>
            <span className="font-mono">
              {syncActive ? 'Live Sync ≤500ms' : 'Production Sync Ready'}
            </span>
          </div>

          {authUser && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/90 border border-slate-700 text-[11px] text-slate-200">
              <span className="hidden sm:inline font-semibold truncate max-w-[120px]">
                {authUser.name}
              </span>
              <span className="hidden sm:inline text-[10px] font-mono uppercase text-teal-300">
                ({authUser.role})
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                title="Sign Out"
                aria-label="Sign Out"
                className="sm:ml-1 text-slate-300 hover:text-rose-300 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Demo Controls Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-sm transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Demo Controls</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
              <div
                className="absolute right-0 mt-2 w-72 bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 p-3 z-50 text-xs animate-in fade-in slide-in-from-top-2"
                onMouseLeave={() => setIsOpen(false)}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    Presentation Controls
                  </div>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                    Production • Live Sync
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 mb-2.5">
                  Trigger real-time backend events to demonstrate cross-tab Redis/WS synchronization:
                </p>

                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      await simulateSurgeSpike();
                      setIsOpen(false);
                      if (!isAdmin) await handlePortalSwitch('admin', '/admin/health');
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg bg-slate-50 hover:bg-rose-50 border border-slate-200/80 hover:border-rose-300 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-rose-600 group-hover:scale-110 transition-transform" />
                      <div>
                        <div className="font-medium text-slate-900 group-hover:text-rose-900">
                          Simulate Surge Spike
                        </div>
                        <div className="text-[10px] text-slate-500">
                          3,450 req/s &bull; 275ms latency spike
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-rose-600 font-bold">SEV-1</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await simulateSectionFull('CSE327-01');
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg bg-slate-50 hover:bg-amber-50 border border-slate-200/80 hover:border-amber-300 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 group-hover:scale-110 transition-transform" />
                      <div>
                        <div className="font-medium text-slate-900 group-hover:text-amber-900">
                          Fill CSE 327 Sec 01
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Forces 40/40 &bull; Triggers alternatives
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-amber-600 font-bold">40/40</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (!authUser || (authUser.role !== 'faculty' && authUser.role !== 'admin')) {
                        await switchDemoRole('faculty');
                      }
                      await approveException('CASE #EX-2025-0841');
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg bg-slate-50 hover:bg-emerald-50 border border-slate-200/80 hover:border-emerald-300 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                      <div>
                        <div className="font-medium text-slate-900 group-hover:text-emerald-900">
                          Dr. Nova Approves CSE 425
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Faculty JWT &bull; Updates all open tabs
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-600 font-bold">Auto</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await resetDemoState();
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors flex items-center justify-between text-slate-700 mt-2"
                  >
                    <div className="flex items-center gap-2">
                      <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                      <span className="font-medium">Reset Demo State</span>
                    </div>
                    <span className="text-[10px] text-slate-500">Pristine</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
