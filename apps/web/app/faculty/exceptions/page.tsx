'use client';

import React, { useState } from 'react';
import { useSmartAdvisor } from '@/store/smartAdvisorStore';
import { FacultyHeader } from '@/components/FacultyHeader';
import { computeCreditPercentage, enrichAuditChecks } from '@/store/scheduleUtils';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Check,
  X
} from 'lucide-react';

export default function FacultyExceptionsPage() {
  const {
    exceptions,
    sections,
    bypassRules,
    student,
    lastError,
    clearError,
    approveException,
    rejectException,
    flagException
  } = useSmartAdvisor();

  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('CASE #EX-2025-0841');
  const [decisionBusy, setDecisionBusy] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const pendingExceptions = exceptions.filter((e) => e.status === 'pending');
  const approvedCount = exceptions.filter((e) => e.status === 'approved').length;
  const flaggedCount = exceptions.filter((e) => e.status === 'flagged').length;

  const filteredList = exceptions.filter((e) => {
    if (filterCategory === 'All') return true;
    if (filterCategory === 'Prereqs') return e.category === 'Prereqs';
    if (filterCategory === 'Capacity') return e.category === 'Capacity';
    if (filterCategory === 'Standing') return e.category === 'Credit Standing';
    return true;
  });

  const selectedCase =
    exceptions.find((e) => e.id === selectedCaseId) || filteredList[0] || exceptions[0];

  const totalCreditsRequired = student.creditsTotal || 130;
  const selectedCreditPercent = selectedCase
    ? computeCreditPercentage(selectedCase.creditsCompleted, totalCreditsRequired)
    : 0;
  const auditChecks = selectedCase
    ? enrichAuditChecks(selectedCase, sections, bypassRules, totalCreditsRequired)
    : [];

  const isFinalized =
    selectedCase?.status === 'approved' || selectedCase?.status === 'rejected';
  const isFlagged = selectedCase?.status === 'flagged';

  const handleDecision = async (action: 'approve' | 'reject' | 'flag') => {
    if (!selectedCase || isFinalized) return;
    if (action === 'flag' && isFlagged) return;
    setDecisionBusy(true);
    setActionFeedback(null);
    const res =
      action === 'approve'
        ? await approveException(selectedCase.id)
        : action === 'reject'
        ? await rejectException(selectedCase.id)
        : await flagException(selectedCase.id);
    setDecisionBusy(false);
    if (res.ok) {
      setActionFeedback(
        `Case ${selectedCase.id} marked ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'flagged'}.`
      );
    }
  };

  return (
    <div className="min-h-[calc(100vh-2.75rem)] bg-slate-50 flex flex-col">
      <FacultyHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* 4 KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 mb-1">
              Pending Exceptions
            </div>
            <div className="text-2xl font-black text-slate-900 tabular-nums">
              {pendingExceptions.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Requires advisor sign-off</div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-1">
              Approved in Queue
            </div>
            <div className="text-2xl font-black text-slate-900 tabular-nums">
              {approvedCount}
            </div>
            <div className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              100% SLA Compliant
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 mb-1">
              Flagged for Advising
            </div>
            <div className="text-2xl font-black text-slate-900 tabular-nums">{flaggedCount}</div>
            <div className="text-[11px] text-slate-500 mt-1">In-person consultation</div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-teal-600 mb-1">
              Active Bypass Policies
            </div>
            <div className="text-2xl font-black text-slate-900 tabular-nums">
              {bypassRules.filter((r) => r.enabled).length} / {bypassRules.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Senate Standing Rules</div>
          </div>
        </div>

        {(lastError || actionFeedback) && (
          <div
            role={lastError ? 'alert' : 'status'}
            className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
              lastError
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <span>{lastError || actionFeedback}</span>
            <button
              type="button"
              onClick={() => {
                clearError();
                setActionFeedback(null);
              }}
              className="font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Split Screen Queue & Inspector */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Queue List */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-sm text-slate-900">Advising Exception Queue</h2>
                <p className="text-xs text-slate-500">Select case to inspect 6-point rule audit</p>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
                {['All', 'Standing', 'Capacity', 'Prereqs'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFilterCategory(cat)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                      filterCategory === cat
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[580px] overflow-y-auto">
              {filteredList.map((item) => {
                const isSelected = item.id === selectedCase?.id;
                const isApproved = item.status === 'approved';
                const isRejected = item.status === 'rejected';
                const itemFlagged = item.status === 'flagged';

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedCaseId(item.id);
                      setActionFeedback(null);
                    }}
                    className={`p-4 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-teal-50/50 border-l-4 border-nsu-teal'
                        : 'hover:bg-slate-50/80 border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[11px] font-bold text-slate-600">
                        {item.id}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          isApproved
                            ? 'bg-emerald-100 text-emerald-800'
                            : isRejected
                            ? 'bg-rose-100 text-rose-800'
                            : itemFlagged
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="font-bold text-sm text-slate-900">{item.studentName}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      ID: {item.studentId} &bull; {item.program}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                      <span className="font-bold text-slate-800">
                        {item.courseCode} Sec {item.sectionNumber}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">{item.submittedAt}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Case Inspector */}
          {selectedCase && (
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-500">
                      {selectedCase.id}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {selectedCase.category}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">
                    {selectedCase.studentName} ({selectedCase.studentId})
                  </h3>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {selectedCase.program} &bull; {selectedCase.standing} &bull; CGPA{' '}
                    <strong className="text-slate-800 tabular-nums">{selectedCase.cgpa.toFixed(2)}</strong>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500">Requested Course</div>
                  <div className="text-base font-black text-nsu-teal">
                    {selectedCase.courseCode} Sec {selectedCase.sectionNumber}
                  </div>
                </div>
              </div>

              {(isFinalized || isFlagged) && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                    selectedCase.status === 'approved'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : selectedCase.status === 'rejected'
                      ? 'bg-rose-50 border-rose-200 text-rose-900'
                      : 'bg-indigo-50 border-indigo-200 text-indigo-900'
                  }`}
                >
                  <span className="font-semibold">
                    Status: <strong className="uppercase">{selectedCase.status}</strong>
                    {selectedCase.facultyDecisionBy ? ` by ${selectedCase.facultyDecisionBy}` : ''}
                    {selectedCase.facultyDecisionAt ? ` at ${selectedCase.facultyDecisionAt}` : ''}
                  </span>
                  {isFinalized && (
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/80 border border-current">
                      Finalized
                    </span>
                  )}
                </div>
              )}

              {/* 6-Point Automated Rule Engine Verification */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  Automated Rule Engine Verification ({auditChecks.length}-Point Audit)
                </div>

                <div className="space-y-2">
                  {auditChecks.map((check, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                        check.passed
                          ? 'bg-emerald-50/50 border-emerald-200/80 text-emerald-950'
                          : 'bg-rose-50/60 border-rose-200/80 text-rose-950'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold flex items-center gap-1.5">
                          {check.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          )}
                          <span>{check.rule}</span>
                        </div>
                        <div className="text-[11px] opacity-80 pl-6">{check.description}</div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider font-mono shrink-0 ${
                          check.passed ? 'bg-emerald-200 text-emerald-900' : 'bg-rose-200 text-rose-900'
                        }`}
                      >
                        {check.passed ? 'PASSED' : 'FAILED'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dynamic Degree Completion Progress */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between font-semibold text-slate-700">
                  <span>Degree Completion Progress:</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {selectedCase.creditsCompleted} / {totalCreditsRequired} Cr (
                    {selectedCreditPercent.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-2 rounded-full"
                    style={{ width: `${Math.min(100, selectedCreditPercent)}%` }}
                  ></div>
                </div>
              </div>

              {/* Student Statement Quote Card */}
              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  STUDENT STATEMENT
                </div>
                <blockquote className="text-xs text-slate-700 italic leading-relaxed">
                  &ldquo;{selectedCase.statement}&rdquo;
                </blockquote>
              </div>

              {/* Decision Actions */}
              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={decisionBusy || isFinalized || isFlagged}
                  onClick={() => handleDecision('flag')}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span>Flag for In-Person Advising</span>
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={decisionBusy || isFinalized}
                    onClick={() => handleDecision('reject')}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-rose-200 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed text-rose-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>Reject</span>
                  </button>

                  <button
                    type="button"
                    disabled={decisionBusy || isFinalized}
                    onClick={() => handleDecision('approve')}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Approve Exception &amp; Enroll</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
