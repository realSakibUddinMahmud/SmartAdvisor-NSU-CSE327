'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSmartAdvisor } from '@/store/smartAdvisorStore';
import { StudentSidebar } from '@/components/StudentSidebar';
import {
  getBuildingTransitions,
  sectionMatchesDayAndSlot
} from '@/store/scheduleUtils';
import { CourseSection, ScheduleStrategy } from '@/types';
import {
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Sparkles,
  ShieldCheck,
  X
} from 'lucide-react';

export default function StudentSchedulePage() {
  const {
    student,
    stagedSections,
    totalCredits,
    clashes,
    confirmSchedule,
    unstageSection,
    applySolvedSchedule,
    lastError,
    clearError
  } = useSmartAdvisor();

  const [strategy, setStrategy] = useState<ScheduleStrategy>('MilestoneFirst');
  const [simulateRdsFailure, setSimulateRdsFailure] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  const maxCredits = student.maxCredits ?? 15.0;
  const buildingInfo = getBuildingTransitions(stagedSections);

  const clashSectionIds = new Set<string>();
  for (const clash of clashes) {
    clashSectionIds.add(clash.sectionA.id);
    clashSectionIds.add(clash.sectionB.id);
  }

  const handleConfirm = async () => {
    setBusy(true);
    await confirmSchedule({ simulateRdsFailure });
    setBusy(false);
  };

  const handleSolveAndApply = async (nextStrategy: ScheduleStrategy) => {
    setStrategy(nextStrategy);
    setBusy(true);
    await applySolvedSchedule({ strategy: nextStrategy, maxCredits });
    setBusy(false);
  };

  // Full 6-Day NSU Academic Week (Saturday through Thursday)
  const days = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

  const slots = [
    { label: '08:00 AM - 09:30 AM', id: '08:00 AM - 09:30 AM' },
    { label: '09:40 AM - 11:10 AM', id: '09:40 AM - 11:10 AM' },
    { label: '11:20 AM - 12:50 PM', id: '11:20 AM - 12:50 PM' },
    { label: '12:50 PM - 01:20 PM', id: 'recess', isRecess: true },
    { label: '01:20 PM - 02:50 PM', id: '01:20 PM - 02:50 PM' },
    { label: '02:40 PM - 04:10 PM', id: '02:40 PM - 04:10 PM' },
    { label: '04:20 PM - 05:50 PM', id: '04:20 PM - 05:50 PM' }
  ];

  const getSectionsForSlot = (day: string, slotId: string): CourseSection[] => {
    return stagedSections.filter((sec) => sectionMatchesDayAndSlot(sec, day, slotId));
  };

  const getCourseBadgeColor = (courseCode: string, isClashing: boolean) => {
    if (isClashing) return 'bg-rose-50 border-rose-500 text-rose-950 ring-1 ring-rose-400';
    if (courseCode.startsWith('CSE 327')) return 'bg-indigo-50 border-indigo-200 text-indigo-900';
    if (courseCode.startsWith('CSE 311')) return 'bg-teal-50 border-teal-200 text-teal-900';
    if (courseCode.startsWith('MAT')) return 'bg-amber-50 border-amber-200 text-amber-900';
    if (courseCode.startsWith('CSE 331')) return 'bg-sky-50 border-sky-200 text-sky-900';
    return 'bg-purple-50 border-purple-200 text-purple-900';
  };

  return (
    <div className="flex bg-slate-50 min-h-[calc(100vh-2.75rem)]">
      <StudentSidebar />

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Top Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Link
                  href="/student/dashboard"
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Link>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Weekly Timetable Planner
                </h1>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Phase 2 Advising
                </span>
              </div>
              <p className="text-xs text-slate-500">
                6-Day Schedule Grid (Sat&ndash;Thu, RA = Thu/Sat) &bull; Conflict-free optimization engine
              </p>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-right">
                <div className="text-xs text-slate-500 font-medium">Selected Load</div>
                <div className="text-sm font-bold text-indigo-700 tabular-nums font-mono">
                  {totalCredits.toFixed(1)} / {maxCredits.toFixed(1)} Cr
                </div>
              </div>

              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  checked={simulateRdsFailure}
                  onChange={(e) => setSimulateRdsFailure(e.target.checked)}
                  className="rounded text-amber-600"
                />
                <span>Simulate RDS Failure</span>
              </label>

              <button
                type="button"
                disabled={busy || clashes.length > 0 || stagedSections.length === 0}
                onClick={handleConfirm}
                className="py-2.5 px-5 rounded-xl bg-nsu-teal hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {busy ? 'Confirming...' : `Confirm Schedule (${totalCredits.toFixed(1)} Cr)`}
                </span>
              </button>
            </div>
          </div>

          {lastError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{lastError}</span>
              </div>
              <button
                type="button"
                onClick={clearError}
                className="text-rose-700 hover:text-rose-900 font-semibold"
              >
                Dismiss
              </button>
            </div>
          )}

          {clashes.length > 0 && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs space-y-1"
            >
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                {clashes.length} Timetable Clash{clashes.length > 1 ? 'es' : ''} Detected — Resolve before confirming:
              </div>
              {clashes.map((c, idx) => (
                <div key={idx} className="font-mono text-[11px]">
                  &bull; {c.sectionA.courseCode} Sec {c.sectionA.sectionNumber} ({c.sectionA.days}{' '}
                  {c.sectionA.timeSlot}) conflicts with {c.sectionB.courseCode} Sec{' '}
                  {c.sectionB.sectionNumber} ({c.sectionB.days} {c.sectionB.timeSlot}) on {c.day}
                </div>
              ))}
            </div>
          )}

          {/* Strategy Solver Quick Apply Toolbar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-700 font-semibold">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>1-Click Constraint Schedule Solver ({strategy})</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleSolveAndApply('MilestoneFirst')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  strategy === 'MilestoneFirst'
                    ? 'bg-nsu-navy text-white border-nsu-navy'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Apply Milestone First
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleSolveAndApply('MinimizeGaps')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  strategy === 'MinimizeGaps'
                    ? 'bg-nsu-navy text-white border-nsu-navy'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Apply Minimize Gaps
              </button>
            </div>
          </div>

          {/* Contact Hours, Campus Transitions & Clash Telemetry Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-teal-50 text-teal-600">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium">Weekly Contact Hours</div>
                <div className="text-base font-bold text-slate-900 tabular-nums">
                  {(totalCredits * 1.5).toFixed(1)} Hours / Week
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-indigo-50 text-indigo-600">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium">Campus Building Transitions</div>
                <div className="text-base font-bold text-slate-900">{buildingInfo.summary}</div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
              <div
                className={`p-2.5 rounded-lg ${
                  clashes.length > 0
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-emerald-50 text-emerald-600'
                }`}
              >
                {clashes.length > 0 ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <ShieldCheck className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="text-xs text-slate-500 font-medium">Clash Validation Status</div>
                {clashes.length > 0 ? (
                  <div className="text-base font-bold text-rose-700 flex items-center gap-1">
                    {clashes.length} Clash{clashes.length > 1 ? 'es' : ''} Detected
                  </div>
                ) : (
                  <div className="text-base font-bold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    0 Clashes (Verified)
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Full 6-Day Weekly Timetable Grid */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left min-w-[880px]">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-700 text-xs font-bold uppercase tracking-wider border-b border-slate-200">
                    <th className="py-3 px-4 w-36 border-r border-slate-200 text-slate-500 font-mono text-[11px]">
                      Time Slot
                    </th>
                    {days.map((day) => (
                      <th key={day} className="py-3 px-3 text-center border-r border-slate-200 last:border-r-0">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {slots.map((slot) => {
                    if (slot.isRecess) {
                      return (
                        <tr key={slot.id} className="bg-amber-50/70 border-y border-amber-200">
                          <td className="py-2.5 px-4 font-mono font-semibold text-[11px] text-amber-800 border-r border-amber-200">
                            {slot.label}
                          </td>
                          <td
                            colSpan={days.length}
                            className="py-2.5 px-4 text-center text-xs font-bold tracking-wide text-amber-900 uppercase"
                          >
                            &bull;&bull;&bull; CAMPUS LUNCH &amp; ZUHR PRAYER RECESS (30 MINUTES NO CONFLICTS) &bull;&bull;&bull;
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={slot.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-[11px] text-slate-500 border-r border-slate-200 whitespace-nowrap bg-slate-50/30">
                          {slot.label}
                        </td>

                        {days.map((day) => {
                          const cellSections = getSectionsForSlot(day, slot.id);
                          const cellClash = cellSections.length > 1;

                          return (
                            <td
                              key={day}
                              data-day={day}
                              data-slot={slot.id}
                              className="py-2 px-2.5 border-r border-slate-200 last:border-r-0 align-top min-w-[135px]"
                            >
                              {cellSections.length > 0 ? (
                                <div className="space-y-1.5">
                                  {cellSections.map((sec) => {
                                    const isClashing = cellClash || clashSectionIds.has(sec.id);
                                    return (
                                      <div
                                        key={sec.id}
                                        className={`p-2 rounded-xl border shadow-xs transition-transform hover:scale-[1.01] ${getCourseBadgeColor(
                                          sec.courseCode,
                                          isClashing
                                        )}`}
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="font-black text-xs tracking-tight">
                                            {sec.courseCode}
                                          </span>
                                          <div className="flex items-center gap-1">
                                            {isClashing && (
                                              <span className="text-[9px] font-bold px-1 rounded bg-rose-600 text-white">
                                                CLASH
                                              </span>
                                            )}
                                            <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-white/80 border border-current">
                                              Sec {sec.sectionNumber}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => unstageSection(sec.id)}
                                              aria-label={`Remove ${sec.id}`}
                                              className="p-0.5 rounded hover:bg-white/80 text-current opacity-70 hover:opacity-100"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                        <div className="text-[11px] font-medium truncate mt-0.5 opacity-90">
                                          {sec.faculty}
                                        </div>
                                        <div className="text-[10px] font-mono mt-1 flex items-center justify-between opacity-80">
                                          <span className="flex items-center gap-1">
                                            <MapPin className="w-3 h-3" />
                                            {sec.room}
                                          </span>
                                          <span className="font-bold">{sec.credits.toFixed(1)} Cr</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="h-14 rounded-lg border border-dashed border-slate-200/60 flex items-center justify-center text-[10px] text-slate-300">
                                  &mdash;
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
