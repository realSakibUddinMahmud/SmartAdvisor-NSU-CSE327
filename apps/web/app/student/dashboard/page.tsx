'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSmartAdvisor } from '@/store/smartAdvisorStore';
import { StudentSidebar } from '@/components/StudentSidebar';
import {
  computeCreditPercentage,
  computeSlotCountdown
} from '@/store/scheduleUtils';
import { ScheduleStrategy, SolveScheduleResult } from '@/types';
import {
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  MapPin,
  Sparkles,
  Plus,
  Bell,
  FileClock,
  GitBranch,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';

export default function StudentDashboardPage() {
  const {
    authUser,
    authToken,
    authHydrated,
    student,
    sections,
    stagedSectionIds,
    stagedSections,
    totalCredits,
    clashes,
    exceptions,
    notifications,
    waitlistEntries,
    waitlistSectionIds,
    dagSummary,
    rdsFallbackPrompt,
    lastError,
    clearError,
    stageSection,
    unstageSection,
    solveSchedule,
    applySolvedSchedule,
    confirmSchedule,
    submitPetition,
    fetchDagEligible,
    markNotificationRead,
    openModal,
    demoResetVersion
  } = useSmartAdvisor();

  const [selectedDept, setSelectedDept] = useState<string>('All Departments');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [strategy, setStrategy] = useState<ScheduleStrategy>('MilestoneFirst');
  const [solverPreview, setSolverPreview] = useState<SolveScheduleResult | null>(null);
  const [solving, setSolving] = useState<boolean>(false);
  const [simulateRdsFailure, setSimulateRdsFailure] = useState<boolean>(false);
  const [confirmBusy, setConfirmBusy] = useState<boolean>(false);

  // Petition quick form
  const [showPetitionForm, setShowPetitionForm] = useState<boolean>(false);
  const [petitionCourse, setPetitionCourse] = useState<string>('CSE 425');
  const [petitionRule, setPetitionRule] = useState<string>('RULE-4.2');
  const [petitionReason, setPetitionReason] = useState<string>('');
  const [petitionMessage, setPetitionMessage] = useState<string | null>(null);
  const [petitionError, setPetitionError] = useState<string | null>(null);

  // Dynamic countdown derived from student.slotClosesAt (deterministic initial state for SSR parity)
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    expired: boolean;
  }>({ hours: 0, minutes: 0, seconds: 0, expired: false });

  useEffect(() => {
    setTimeLeft(computeSlotCountdown(student.slotClosesAt));
    const timer = setInterval(() => {
      setTimeLeft(computeSlotCountdown(student.slotClosesAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [student.slotClosesAt]);

  useEffect(() => {
    if (authHydrated && authToken && authUser?.role === 'student') {
      void fetchDagEligible();
    }
  }, [authHydrated, authToken, authUser?.role, fetchDagEligible]);

  useEffect(() => {
    if (demoResetVersion > 0) {
      setSolverPreview(null);
    }
  }, [demoResetVersion]);

  const handleStrategySelect = async (nextStrategy: ScheduleStrategy) => {
    setStrategy(nextStrategy);
    setSolving(true);
    const res = await solveSchedule({
      strategy: nextStrategy,
      maxCredits: student.maxCredits ?? 15
    });
    setSolverPreview(res);
    setSolving(false);
  };

  const handleSolveAndApply = async () => {
    setSolving(true);
    const res = await applySolvedSchedule({
      strategy,
      maxCredits: student.maxCredits ?? 15
    });
    setSolverPreview(res);
    setSolving(false);
  };

  const handleConfirmEnrollment = async () => {
    setConfirmBusy(true);
    await confirmSchedule({ simulateRdsFailure });
    setConfirmBusy(false);
  };

  const filteredSections = sections.filter((sec) => {
    const matchesDept = selectedDept === 'All Departments' || sec.department === selectedDept;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      sec.courseCode.toLowerCase().includes(q) ||
      sec.courseTitle.toLowerCase().includes(q) ||
      sec.faculty.toLowerCase().includes(q) ||
      sec.room.toLowerCase().includes(q);
    return matchesDept && matchesQuery;
  });

  const departmentTabs = [
    'All Departments',
    'ECE / CSE',
    'Math & Physics',
    'BBA',
    'English & Mod. Lang'
  ];

  const firstName = student.name.trim().split(/\s+/)[0] || student.name;
  const maxCredits = student.maxCredits ?? 15.0;
  const creditPercent = computeCreditPercentage(student.creditsCompleted, student.creditsTotal);
  const myExceptions = exceptions.filter((e) => e.studentId === student.id);
  const myNotifications = notifications.filter((n) => n.studentId === student.id);
  const unreadCount = myNotifications.filter((n) => !n.read).length;

  return (
    <div className="flex bg-slate-50 min-h-[calc(100vh-2.75rem)]">
      <StudentSidebar />

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Top Banner: Welcome + Advising Clearance + Slot Countdown */}
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Welcome back, {firstName}
                </h1>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {student.standing}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ADVISING CLEARANCE:{' '}
                  {student.advisingClearedBy
                    ? `Cleared by ${student.advisingClearedBy}`
                    : 'Pending Advisor'}
                </span>
                <span className="text-xs text-slate-400 hidden sm:inline">&bull;</span>
                <span className="text-xs text-slate-500 font-mono">
                  Cart Token: {student.cartToken}
                </span>
              </div>
            </div>

            <div className="bg-slate-900 text-white px-5 py-3 rounded-xl flex items-center gap-4 shrink-0 shadow-sm border border-slate-800">
              <div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  YOUR SLOT CLOSES IN
                </div>
                <div className="text-lg font-black font-mono tracking-wider tabular-nums text-emerald-400">
                  {String(timeLeft.hours).padStart(2, '0')}h :{' '}
                  {String(timeLeft.minutes).padStart(2, '0')}m :{' '}
                  {String(timeLeft.seconds).padStart(2, '0')}s
                </div>
              </div>
              <Clock className="w-5 h-5 text-emerald-400/80 animate-pulse" />
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

          {rdsFallbackPrompt && !rdsFallbackPrompt.resolved && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-amber-950 space-y-0.5">
                <div className="font-bold flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 text-amber-700" />
                  RDS Enrollment Fallback Required for {rdsFallbackPrompt.failedCourseCode} (
                  {rdsFallbackPrompt.failedSectionId})
                </div>
                <p className="text-amber-800">{rdsFallbackPrompt.reason}</p>
              </div>
              <button
                type="button"
                onClick={() => openModal('rds_fallback', rdsFallbackPrompt)}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shrink-0"
              >
                Open 1-Click Fallback
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Columns: Live Seat Radar + Petitions + Notifications + Clearance */}
            <div className="lg:col-span-2 space-y-6">
              {/* Department Filter Pills + Search */}
              <div id="radar" className="space-y-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {departmentTabs.map((dept) => (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => setSelectedDept(dept)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                        selectedDept === dept
                          ? 'bg-nsu-navy text-white shadow-sm'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {dept}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search course code, faculty, room (e.g. CSE 327, Nabeel, SAC 502)..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-nsu-teal shadow-sm transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Interactive Live Seat Radar Table */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    <h2 className="font-bold text-sm text-slate-900 tracking-tight">
                      Live Seat Radar &bull; Phase 2 Advising
                    </h2>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">
                    Showing {filteredSections.length} sections
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 text-slate-500 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
                        <th className="py-3 px-4">Course &amp; DAG Status</th>
                        <th className="py-3 px-3">Faculty &amp; Room</th>
                        <th className="py-3 px-3">Schedule</th>
                        <th className="py-3 px-3">Seat Availability</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredSections.map((sec) => {
                        const available = sec.capacity - sec.enrolled;
                        const isStaged = stagedSectionIds.includes(sec.id);
                        const isFull = available <= 0;
                        const isFew = available > 0 && available <= 5;
                        const percentage = Math.min(100, Math.round((sec.enrolled / sec.capacity) * 100));

                        const isCriticalPath = dagSummary.criticalPath.includes(sec.courseCode);
                        const missingList = dagSummary.blockedCourses[sec.courseCode];
                        const isEligible = dagSummary.eligibleCourses.includes(sec.courseCode);
                        const myWl = waitlistEntries.find(
                          (w) =>
                            w.sectionId === sec.id &&
                            w.studentId === student.id &&
                            w.status === 'waiting'
                        );
                        const isWaitlisted = Boolean(myWl) || waitlistSectionIds.includes(sec.id);

                        return (
                          <tr
                            key={sec.id}
                            className={`hover:bg-slate-50/70 transition-colors ${
                              isStaged ? 'bg-teal-50/30' : ''
                            }`}
                          >
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                                {sec.courseCode}
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 font-mono text-slate-600">
                                  Sec {sec.sectionNumber}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 truncate max-w-[190px]">
                                {sec.courseTitle}
                              </div>
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {missingList && missingList.length > 0 ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                                    Blocked: {missingList.join(', ')}
                                  </span>
                                ) : isEligible ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                                    DAG Eligible
                                  </span>
                                ) : null}
                                {isCriticalPath && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-semibold">
                                    Critical Path
                                  </span>
                                )}
                                {isWaitlisted && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold">
                                    Waitlisted {myWl ? `#${myWl.position}` : ''}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3.5 px-3">
                              <div className="font-medium text-slate-800 truncate max-w-[150px]">
                                {sec.faculty}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                {sec.room}
                              </div>
                            </td>

                            <td className="py-3.5 px-3">
                              <div className="font-semibold text-slate-700">{sec.days}</div>
                              <div className="text-[11px] text-slate-500 font-mono">{sec.timeSlot}</div>
                            </td>

                            <td className="py-3.5 px-3 min-w-[160px]">
                              <div className="flex items-center justify-between text-[11px] mb-1 font-mono">
                                <span className="font-bold tabular-nums">
                                  {String(Math.max(0, available)).padStart(2, '0')}/{sec.capacity}
                                </span>
                                <span
                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                    isFull
                                      ? 'bg-rose-100 text-rose-700'
                                      : isFew
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {isFull ? 'Full (0 Left)' : isFew ? 'Few Seats' : 'Available'}
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-1.5 rounded-full transition-all duration-300 ${
                                    isFull
                                      ? 'bg-rose-500'
                                      : isFew
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${percentage}%` }}
                                ></div>
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              {isStaged ? (
                                <button
                                  type="button"
                                  onClick={() => unstageSection(sec.id)}
                                  className="px-3 py-1.5 rounded-lg bg-teal-100 text-teal-800 hover:bg-rose-100 hover:text-rose-800 text-xs font-semibold transition-colors flex items-center gap-1 ml-auto"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                                  <span>Staged &times;</span>
                                </button>
                              ) : isFull ? (
                                <button
                                  type="button"
                                  onClick={() => stageSection(sec.id)}
                                  className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors flex items-center gap-1 ml-auto"
                                >
                                  <span>Full (Swap / Waitlist)</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => stageSection(sec.id)}
                                  className="px-3 py-1.5 rounded-lg bg-nsu-navy hover:bg-nsu-teal text-white text-xs font-semibold transition-colors shadow-sm flex items-center gap-1 ml-auto cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Stage</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* My Petitions & Rule Exceptions Panel */}
              <div
                id="petitions"
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-4"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <FileClock className="w-4 h-4 text-amber-600" />
                    <h2 className="font-bold text-sm text-slate-900">
                      My Academic Petitions &amp; Rule Overrides
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPetitionForm((v) => !v);
                      setPetitionMessage(null);
                      setPetitionError(null);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold"
                  >
                    {showPetitionForm ? 'Close Form' : '+ Submit Petition'}
                  </button>
                </div>

                {petitionMessage && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                    {petitionMessage}
                  </div>
                )}

                {petitionError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs"
                  >
                    {petitionError}
                  </div>
                )}

                {showPetitionForm && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setPetitionError(null);
                      setPetitionMessage(null);
                      if (petitionReason.trim().length < 5) {
                        setPetitionError(
                          'Please enter at least 5 characters explaining your petition.'
                        );
                        return;
                      }
                      const res = await submitPetition({
                        courseCode: petitionCourse.trim(),
                        ruleCode: petitionRule,
                        reason: petitionReason.trim()
                      });
                      if (res.ok && res.data) {
                        setPetitionMessage(
                          `Submitted ${res.data.exceptionCase.id} (Status: Pending faculty review).`
                        );
                        setPetitionReason('');
                        setShowPetitionForm(false);
                      } else if (!res.ok) {
                        setPetitionError(res.message || 'Failed to submit petition.');
                      }
                    }}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Course Code
                        </label>
                        <input
                          type="text"
                          value={petitionCourse}
                          onChange={(e) => setPetitionCourse(e.target.value)}
                          required
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Rule Code
                        </label>
                        <select
                          value={petitionRule}
                          onChange={(e) => setPetitionRule(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                        >
                          <option value="RULE-4.2">RULE-4.2 (Credit Floor)</option>
                          <option value="RULE-2.1">RULE-2.1 (Prerequisite Co-Req)</option>
                          <option value="RULE-8.4">RULE-8.4 (Seat Capacity)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Justification
                      </label>
                      <textarea
                        rows={2}
                        value={petitionReason}
                        onChange={(e) => {
                          setPetitionReason(e.target.value);
                          if (petitionError) setPetitionError(null);
                        }}
                        required
                        minLength={5}
                        placeholder="Provide justification for your faculty advisor..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                      >
                        Submit Petition
                      </button>
                    </div>
                  </form>
                )}

                {myExceptions.length === 0 ? (
                  <p className="text-xs text-slate-500">No petitions submitted yet.</p>
                ) : (
                  <div className="space-y-2">
                    {myExceptions.map((exc) => (
                      <div
                        key={exc.id}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900">
                            {exc.courseCode} Sec {exc.sectionNumber} &bull;{' '}
                            <span className="font-mono text-slate-500">{exc.id}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                            {exc.statement}
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                            exc.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : exc.status === 'rejected'
                              ? 'bg-rose-100 text-rose-800'
                              : exc.status === 'flagged'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {exc.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Live Notifications Panel */}
              <div
                id="notifications"
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-3"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-indigo-600" />
                    <h2 className="font-bold text-sm text-slate-900">
                      Live Notifications ({unreadCount} unread)
                    </h2>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => markNotificationRead()}
                      className="text-xs text-nsu-teal hover:underline font-semibold"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {myNotifications.length === 0 ? (
                  <p className="text-xs text-slate-500">No notifications received yet.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {myNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => markNotificationRead(notif.id)}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                          notif.read
                            ? 'bg-slate-50 border-slate-200 text-slate-600'
                            : 'bg-indigo-50/60 border-indigo-200 text-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold">{notif.title}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-slate-200">
                            {notif.channel}
                          </span>
                        </div>
                        <p className="text-[11px] mt-0.5">{notif.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Advising Clearance & DAG Critical Path */}
              <div
                id="clearance"
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-3"
              >
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <h2 className="font-bold text-sm text-slate-900">
                    Curriculum DAG &amp; Advising Clearance
                  </h2>
                </div>
                <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                  <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-semibold text-slate-800">Critical Path:</span>
                  {dagSummary.criticalPath.map((code, idx) => (
                    <React.Fragment key={code}>
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-mono font-semibold">
                        {code}
                      </span>
                      {idx < dagSummary.criticalPath.length - 1 && <span>&rarr;</span>}
                    </React.Fragment>
                  ))}
                </div>
                <div className="text-[11px] text-slate-500">
                  Cleared Prerequisites:{' '}
                  {student.clearedCourses.map((c) => `${c.code} (${c.grade})`).join(', ')}
                </div>
              </div>
            </div>

            {/* Right Sticky Draft Plan Panel */}
            <div className="space-y-5">
              <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm sticky top-16 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h2 className="font-bold text-sm text-slate-900 tracking-tight">My Selection</h2>
                    <p className="text-[11px] text-slate-500">Phase 2 Draft Plan</p>
                  </div>
                  {clashes.length > 0 ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1 animate-pulse">
                      <AlertTriangle className="w-3 h-3" />
                      {clashes.length} Clash Detected
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      0 Timetable Clashes
                    </span>
                  )}
                </div>

                {/* Staged Sections List */}
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Staged Courses ({stagedSections.length})</span>
                    <span className="font-bold text-indigo-700 tabular-nums font-mono">
                      {totalCredits.toFixed(1)} / {maxCredits.toFixed(1)} Cr
                    </span>
                  </div>

                  {stagedSections.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400">
                      No sections staged yet. Click &ldquo;Stage&rdquo; on any course to add it to your draft plan.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {stagedSections.map((sec) => (
                        <div
                          key={sec.id}
                          className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-all flex items-start justify-between gap-2"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900">{sec.courseCode}</span>
                              <span className="text-[10px] font-mono text-slate-600 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                                Sec {sec.sectionNumber}
                              </span>
                              <span className="text-[10px] text-indigo-700 font-semibold tabular-nums">
                                {sec.credits.toFixed(1)} Cr
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">{sec.faculty}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-2 font-mono">
                              <span>
                                {sec.days} {sec.timeSlot}
                              </span>
                              <span>&bull;</span>
                              <span>{sec.room}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => unstageSection(sec.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-white transition-colors"
                            title="Remove section"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Strategy Optimizer Toggle + Solver */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                  <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Automated Schedule Strategy
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-white rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleStrategySelect('MilestoneFirst')}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-semibold transition-all ${
                        strategy === 'MilestoneFirst'
                          ? 'bg-nsu-navy text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Milestone First
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStrategySelect('MinimizeGaps')}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-semibold transition-all ${
                        strategy === 'MinimizeGaps'
                          ? 'bg-nsu-navy text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Minimize Gaps
                    </button>
                  </div>

                  {solverPreview && (
                    <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                      <div className="font-semibold text-slate-800">
                        {solverPreview.strategy}: {solverPreview.recommendedSectionIds.join(', ')}
                      </div>
                      <div>
                        {solverPreview.totalCredits.toFixed(1)} Cr
                        {solverPreview.idleGapMinutes !== undefined
                          ? ` • ${solverPreview.idleGapMinutes}m idle gap`
                          : ''}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={solving}
                    onClick={handleSolveAndApply}
                    className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-[11px] font-bold transition-colors"
                  >
                    {solving ? 'Solving Schedule...' : `Solve & Apply (${strategy})`}
                  </button>
                </div>

                {/* Simulate RDS Failure Toggle + Confirm */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simulateRdsFailure}
                      onChange={(e) => setSimulateRdsFailure(e.target.checked)}
                      className="rounded text-amber-600"
                    />
                    Simulate RDS Failure (Trigger 1-Click Fallback)
                  </label>

                  <button
                    type="button"
                    disabled={confirmBusy || clashes.length > 0 || stagedSections.length === 0}
                    onClick={handleConfirmEnrollment}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-sm transition-all"
                  >
                    {confirmBusy
                      ? 'Confirming...'
                      : `Confirm & Lock Schedule (${totalCredits.toFixed(1)} Cr)`}
                  </button>

                  <Link
                    href="/student/schedule"
                    className="w-full py-2.5 px-4 rounded-xl bg-nsu-teal hover:bg-teal-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Open Weekly Timetable &rarr;</span>
                  </Link>
                </div>

                {/* Degree Completion Progress Bar */}
                <div className="pt-3 border-t border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Degree Progress:</span>
                    <span className="font-bold text-slate-800 tabular-nums">
                      {student.creditsCompleted} / {student.creditsTotal} Cr ({creditPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2 rounded-full"
                      style={{ width: `${Math.min(100, creditPercent)}%` }}
                    ></div>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {student.program} &bull; {student.standing}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
