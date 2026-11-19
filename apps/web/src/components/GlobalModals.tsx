'use client';

import React, { useEffect, useState } from 'react';
import { useSmartAdvisor } from '@/store/smartAdvisorStore';
import { getRoomFireCodeCap } from '@/store/scheduleUtils';
import { CourseSection, RdsFallbackPrompt } from '@/types';
import {
  AlertTriangle,
  CheckCircle2,
  X,
  ShieldAlert,
  ArrowRight,
  Printer,
  Layers,
  Clock,
  MapPin,
  Building2,
  FileCheck2,
  ListPlus,
  RefreshCw
} from 'lucide-react';

export function GlobalModals() {
  const {
    activeModal,
    modalPayload,
    closeModal,
    student,
    stageSection,
    submitPetition,
    joinWaitlist,
    resolveRdsFallback,
    expandCapacity,
    allocateEmergencySection,
    waitlistEntries,
    rdsFallbackPrompt
  } = useSmartAdvisor();

  // Capacity Expansion Modal state
  const [selectedDelta, setSelectedDelta] = useState<number>(5);

  // Petition form state (rule_alert)
  const [petitionReason, setPetitionReason] = useState<string>(
    'I require this course this semester to stay on track for my degree graduation milestone.'
  );
  const [petitionSubmittedId, setPetitionSubmittedId] = useState<string | null>(null);

  // Waitlist feedback (section_full)
  const [waitlistJoinedPos, setWaitlistJoinedPos] = useState<number | null>(null);

  // Shared modal error / loading state
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalBusy, setModalBusy] = useState<boolean>(false);

  // Emergency Section Modal state
  const [emergencyFaculty, setEmergencyFaculty] = useState('Mr. Tanvir Rahman');
  const [emergencyRoom, setEmergencyRoom] = useState('LIB 608');
  const [emergencySlot, setEmergencySlot] = useState('04:20 PM - 05:50 PM');
  const [emergencyDays, setEmergencyDays] = useState<'MW' | 'ST' | 'RA'>('MW');

  // Reset per-modal transient feedback whenever activeModal or modalPayload changes
  useEffect(() => {
    setModalError(null);
    setModalBusy(false);
    setPetitionSubmittedId(null);
    setWaitlistJoinedPos(null);
    if (activeModal === 'capacity_expand' && modalPayload) {
      const cap = getRoomFireCodeCap(modalPayload);
      const current = modalPayload.capacity || 40;
      const maxDelta = Math.max(0, cap - current);
      setSelectedDelta(maxDelta >= 10 ? 10 : maxDelta >= 5 ? 5 : Math.max(1, maxDelta));
    }
  }, [activeModal, modalPayload]);

  useEffect(() => {
    if (!activeModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModal, closeModal]);

  if (!activeModal) return null;

  const fallbackData: RdsFallbackPrompt | null =
    activeModal === 'rds_fallback' ? modalPayload || rdsFallbackPrompt : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      {/* 1. RULE ALERT / PETITION SUBMISSION MODAL (NO SELF-APPROVAL!) */}
      {activeModal === 'rule_alert' && (
        <div
          role="dialog"
          aria-modal="true"
          className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        >
          <div className="bg-amber-500 text-white p-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-600 rounded-xl">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg leading-tight">
                  {modalPayload?.ruleCode === 'RULE-6.3'
                    ? 'Academic RULE-6.3 Exam Load Alert'
                    : modalPayload?.ruleCode === 'RULE-2.1' ||
                        (modalPayload?.missingPrerequisites?.length ?? 0) > 0
                      ? `Academic ${modalPayload?.ruleCode || 'RULE-2.1'} Prerequisite Alert`
                      : `Academic ${modalPayload?.ruleCode || 'RULE-4.2'} Standing Alert`}
                </h3>
                <p className="text-amber-100 text-xs">
                  Pre-Advising Automated Rule Engine Audit
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeModal}
              aria-label="Close modal"
              className="text-amber-100 hover:text-white p-1 rounded-lg hover:bg-amber-600/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {(() => {
              const stuCredits = modalPayload?.studentCredits ?? student.creditsCompleted;
              const missingPrereqs: string[] = modalPayload?.missingPrerequisites ?? [];
              const conflictingSections: CourseSection[] =
                modalPayload?.conflictingSections ?? [];
              const ruleCode: string = modalPayload?.ruleCode || 'RULE-4.2';
              const isExamLoadRule = ruleCode === 'RULE-6.3';
              const isPrereqRule =
                !isExamLoadRule &&
                (ruleCode === 'RULE-2.1' || missingPrereqs.length > 0);
              const isCreditFloorRule = !isExamLoadRule && !isPrereqRule;
              const reqCredits = isCreditFloorRule
                ? (modalPayload?.requiredCredits ??
                  modalPayload?.section?.minCreditsRequired ??
                  100)
                : 0;
              const deficit = isCreditFloorRule
                ? Math.max(0, reqCredits - stuCredits)
                : 0;
              const courseCode: string = modalPayload?.section?.courseCode || 'CSE 425';
              const courseTitle: string =
                modalPayload?.section?.courseTitle || 'Concepts of Programming Languages';

              return (
                <>
                  <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 text-sm space-y-2">
                    <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      {isExamLoadRule
                        ? 'Consecutive Final Exam Load Conflict (3+ Exams in 24h)'
                        : isPrereqRule
                          ? missingPrereqs.length > 0
                            ? `Missing Prerequisites: ${missingPrereqs.join(', ')}`
                            : 'Prerequisite Requirement Not Met'
                          : 'Academic Standing / Rule Requirement Not Met'}
                    </div>
                    <p className="text-amber-800 text-xs leading-relaxed">
                      Registration for <strong>{courseCode}</strong> ({courseTitle}) triggered{' '}
                      <strong>{ruleCode}</strong>
                      {isExamLoadRule
                        ? ' (3 or more consecutive final exams within a 24-hour window).'
                        : isCreditFloorRule && reqCredits > 0
                          ? ` (requires ${reqCredits} completed credits).`
                          : '.'}
                    </p>
                    {isExamLoadRule && conflictingSections.length > 0 && (
                      <div className="pt-1 space-y-1">
                        <div className="text-[11px] font-semibold text-amber-900 uppercase tracking-wider">
                          Conflicting Exam Schedule:
                        </div>
                        <ul className="space-y-1 text-xs text-amber-900 font-mono">
                          {conflictingSections.map((sec) => (
                            <li
                              key={sec.id}
                              className="px-2.5 py-1 rounded-lg bg-white/80 border border-amber-200 flex items-center justify-between gap-2"
                            >
                              <span>
                                {sec.courseCode} Sec {sec.sectionNumber}
                              </span>
                              <span className="text-[11px] text-amber-700">
                                {sec.examSlot
                                  ? new Date(sec.examSlot).toUTCString()
                                  : `${sec.days} ${sec.timeSlot}`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-slate-500 mb-0.5">
                        {isExamLoadRule
                          ? 'Exam Window Load'
                          : isPrereqRule
                            ? 'Prerequisite Audit'
                            : 'Your Completed Credits'}
                      </div>
                      <div className="font-bold text-base text-slate-800 tabular-nums">
                        {stuCredits} / {student.creditsTotal} Cr
                      </div>
                      <div className="text-[11px] text-amber-600 font-medium mt-0.5">
                        {isExamLoadRule
                          ? conflictingSections.length > 0
                            ? `${conflictingSections.length} exams in 24h window`
                            : 'Consecutive exam load limit exceeded'
                          : isPrereqRule
                            ? missingPrereqs.length > 0
                              ? `Missing: ${missingPrereqs.join(', ')}`
                              : 'Prerequisite waiver required'
                            : deficit > 0
                              ? `Deficit: -${deficit.toFixed(1)} Credits`
                              : 'Credit floor met'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-slate-500 mb-0.5">Student Standing &amp; CGPA</div>
                      <div className="font-bold text-base text-slate-800 tabular-nums">
                        CGPA {student.cgpa.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {student.standing}
                      </div>
                    </div>
                  </div>

                  {modalError && (
                    <div
                      role="alert"
                      className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs"
                    >
                      {modalError}
                    </div>
                  )}

                  {petitionSubmittedId ? (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Petition Submitted for Faculty Review ({petitionSubmittedId})
                      </div>
                      <p className="text-emerald-800">
                        Your petition status is <strong>Pending</strong>. {student.advisingClearedBy} will review and
                        approve/decline your request in the Faculty Exceptions Queue.
                      </p>
                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={closeModal}
                          className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5 text-xs">
                        <label
                          htmlFor="petition-reason"
                          className="block font-semibold text-slate-700"
                        >
                          Petition Justification (Sent to Faculty Advisor)
                        </label>
                        <textarea
                          id="petition-reason"
                          rows={3}
                          value={petitionReason}
                          onChange={(e) => setPetitionReason(e.target.value)}
                          placeholder="Explain why you need a waiver for this course..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs text-slate-800"
                        />
                      </div>

                      <div className="pt-2 flex items-center justify-end gap-2.5">
                        <button
                          type="button"
                          onClick={closeModal}
                          className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={modalBusy}
                          onClick={async () => {
                            if (petitionReason.trim().length < 5) {
                              setModalError('Please enter at least 5 characters explaining your petition.');
                              return;
                            }
                            setModalError(null);
                            setModalBusy(true);
                            const res = await submitPetition({
                              sectionId: modalPayload?.section?.id,
                              courseCode,
                              ruleCode,
                              reason: petitionReason.trim()
                            });
                            setModalBusy(false);
                            if (!res.ok) {
                              setModalError(res.message || 'Could not submit petition.');
                              return;
                            }
                            setPetitionSubmittedId(res.data?.exceptionCase.id || 'Submitted');
                          }}
                          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5"
                        >
                          <span>{modalBusy ? 'Submitting...' : 'Submit Petition for Advisor Review'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* 2. SECTION FULL ALTERNATIVES & WAITLIST MODAL */}
      {activeModal === 'section_full' && (
        <div
          role="dialog"
          aria-modal="true"
          className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        >
          {(() => {
            const fullSection: CourseSection | undefined = modalPayload?.fullSection;
            const alternatives: CourseSection[] = modalPayload?.alternatives || [];
            const enrolled = fullSection?.enrolled ?? 40;
            const capacity = fullSection?.capacity ?? 40;
            const waitlisted = fullSection?.waitlisted ?? 0;
            const existingEntry = fullSection
              ? waitlistEntries.find(
                  (w) =>
                    w.sectionId === fullSection.id &&
                    w.studentId === student.id &&
                    w.status === 'waiting'
                )
              : undefined;
            const displayPosition =
              waitlistJoinedPos ?? existingEntry?.position ?? waitlisted + 1;

            return (
              <>
                <div className="bg-rose-600 text-white p-5 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-rose-700 rounded-xl">
                      <AlertTriangle className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg leading-tight">
                        Section Sold Out (0 Seats Remaining)
                      </h3>
                      <p className="text-rose-100 text-xs">
                        {fullSection?.courseCode} &bull; Section {fullSection?.sectionNumber} is Full
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    aria-label="Close modal"
                    className="text-rose-100 hover:text-white p-1 rounded-lg hover:bg-rose-700/50 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <p className="text-xs text-slate-600">
                    This section currently has <strong>{Math.max(0, capacity - enrolled)} open seats</strong> (
                    {enrolled}/{capacity} enrolled) and <strong>{waitlisted} students waitlisted</strong>.
                    SmartAdvisor detected open alternative sections or you can join the live waitlist:
                  </p>

                  {modalError && (
                    <div
                      role="alert"
                      className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs"
                    >
                      {modalError}
                    </div>
                  )}

                  {waitlistJoinedPos !== null && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Added to waitlist for <strong>{fullSection?.id}</strong> at position{' '}
                        <strong>#{waitlistJoinedPos}</strong>. You will be notified if a seat opens.
                      </span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Instant Section Swap Options:
                    </div>

                    {alternatives.length > 0 ? (
                      alternatives.map((alt) => {
                        const available = alt.capacity - alt.enrolled;
                        return (
                          <div
                            key={alt.id}
                            className="p-3.5 rounded-xl border border-slate-200 hover:border-nsu-teal bg-slate-50/50 hover:bg-teal-50/30 transition-all flex items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-slate-900">
                                  Section {alt.sectionNumber}
                                </span>
                                <span className="text-xs text-slate-600">&bull; {alt.faculty}</span>
                              </div>
                              <div className="text-xs text-slate-500 flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  {alt.days} {alt.timeSlot}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                  {alt.room}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 tabular-nums">
                                {available} seats open
                              </span>
                              <button
                                type="button"
                                disabled={modalBusy}
                                onClick={async () => {
                                  setModalBusy(true);
                                  const ok = await stageSection(alt.id);
                                  setModalBusy(false);
                                  if (ok) {
                                    closeModal();
                                  }
                                }}
                                className="px-3.5 py-1.5 rounded-lg bg-nsu-teal hover:bg-teal-700 disabled:opacity-60 text-white text-xs font-semibold shadow-sm transition-colors"
                              >
                                Select Section
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-4 rounded-xl bg-slate-100 text-slate-600 text-xs text-center">
                        All standard sections are currently full. Join the waitlist to receive instant seat-open alerts.
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500 tabular-nums">
                      {existingEntry || waitlistJoinedPos !== null
                        ? `Current Waitlist Position: #${displayPosition}`
                        : `Next Waitlist Position: #${displayPosition}`}
                    </span>
                    <div className="flex items-center gap-2">
                      {fullSection && (
                        <button
                          type="button"
                          disabled={modalBusy || Boolean(existingEntry) || waitlistJoinedPos !== null}
                          onClick={async () => {
                            setModalError(null);
                            setModalBusy(true);
                            const res = await joinWaitlist(fullSection.id);
                            setModalBusy(false);
                            if (!res.ok) {
                              setModalError(res.message || 'Unable to join waitlist.');
                              return;
                            }
                            setWaitlistJoinedPos(res.data?.position ?? displayPosition);
                          }}
                          className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                          <span>
                            {existingEntry || waitlistJoinedPos !== null
                              ? `Waitlisted (#${displayPosition})`
                              : 'Join Waitlist'}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={closeModal}
                        className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* 3. FACULTY CAPACITY EXPANSION MODAL */}
      {activeModal === 'capacity_expand' && (
        <div
          role="dialog"
          aria-modal="true"
          className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        >
          {(() => {
            const currentCapacity = modalPayload?.capacity || 40;
            const roomCap = modalPayload ? getRoomFireCodeCap(modalPayload) : 55;
            const requestedCapacity = currentCapacity + selectedDelta;
            const exceedsCap = requestedCapacity > roomCap;

            return (
              <>
                <div className="bg-nsu-navy text-white p-5 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-nsu-teal rounded-xl">
                      <Layers className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg leading-tight">Expand Section Capacity</h3>
                      <p className="text-slate-300 text-xs">
                        {modalPayload?.courseCode} &bull; Section {modalPayload?.sectionNumber} (
                        {modalPayload?.faculty})
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeModal}
                    aria-label="Close modal"
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <div className="text-xs text-slate-500 uppercase font-semibold">Current Cap</div>
                      <div className="text-2xl font-black text-slate-800 tabular-nums">
                        {currentCapacity}
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-400" />
                    <div>
                      <div className="text-xs text-emerald-600 uppercase font-semibold">Expanded Cap</div>
                      <div
                        className={`text-2xl font-black tabular-nums ${
                          exceedsCap ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {requestedCapacity}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500 uppercase font-semibold">Delta</div>
                      <div className="text-lg font-bold text-indigo-600 tabular-nums">
                        +{selectedDelta}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Select Capacity Delta (Room Max: {roomCap}):
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[5, 10, 15].map((delta) => {
                        const overLimit = currentCapacity + delta > roomCap;
                        return (
                          <button
                            key={delta}
                            type="button"
                            disabled={overLimit}
                            onClick={() => setSelectedDelta(delta)}
                            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all border disabled:opacity-40 disabled:cursor-not-allowed ${
                              selectedDelta === delta && !overLimit
                                ? 'bg-nsu-teal text-white border-nsu-teal shadow-sm'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            +{delta} Seats
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-lg border text-xs space-y-1 ${
                      exceedsCap
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-teal-50/70 border-teal-200 text-teal-900'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-1.5">
                      <Building2 className="w-4 h-4" />
                      Physical Room Fire-Code Ceiling Check
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Room <strong>{modalPayload?.room || 'LIB 602'}</strong> has a certified maximum capacity of{' '}
                      <strong>{roomCap} physical workstations</strong>.{' '}
                      {exceedsCap
                        ? `Requested ${requestedCapacity} exceeds fire-code limit (${roomCap}).`
                        : `Expanding to ${requestedCapacity} is compliant with fire and safety codes.`}
                    </p>
                  </div>

                  {modalError && (
                    <div
                      role="alert"
                      className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs"
                    >
                      {modalError}
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={exceedsCap || modalBusy}
                      onClick={async () => {
                        setModalError(null);
                        setModalBusy(true);
                        const res = await expandCapacity(modalPayload.id, selectedDelta);
                        setModalBusy(false);
                        if (!res.ok) {
                          setModalError(res.message || 'Capacity expansion rejected.');
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-sm flex items-center gap-1.5"
                    >
                      {modalBusy ? 'Expanding...' : `Confirm Capacity Expansion (+${selectedDelta})`}
                    </button>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* 4. SCHEDULE CONFIRMATION RECEIPT MODAL */}
      {activeModal === 'receipt' && (
        <div
          role="dialog"
          aria-modal="true"
          className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        >
          <div className="bg-emerald-600 text-white p-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-700 rounded-xl">
                <FileCheck2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg leading-tight">Advising Enrollment Confirmed</h3>
                <p className="text-emerald-100 text-xs font-mono">
                  {modalPayload?.transactionId || 'Pending Transaction ID'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeModal}
              aria-label="Close modal"
              className="text-emerald-100 hover:text-white p-1 rounded-lg hover:bg-emerald-700/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-3 border-b border-slate-100">
              <div>
                <span className="text-slate-500">Student:</span>{' '}
                <strong className="text-slate-900">
                  {student.name} ({modalPayload?.studentId || student.id})
                </strong>
              </div>
              <div className="flex items-center gap-2">
                <span>
                  <span className="text-slate-500">Semester:</span>{' '}
                  <strong className="text-slate-900">
                    {modalPayload?.semester || 'Spring 2025'}
                  </strong>
                </span>
                {modalPayload?.status && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800">
                    {modalPayload.status}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Confirmed &amp; Locked Courses:
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {modalPayload?.sections?.map((sec: CourseSection) => (
                  <div
                    key={sec.id}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{sec.courseCode}</span>{' '}
                      <span className="text-slate-600">Sec {sec.sectionNumber}</span>
                      <div className="text-[11px] text-slate-500">
                        {sec.days} {sec.timeSlot} &bull; {sec.room}
                      </div>
                    </div>
                    <span className="font-semibold text-indigo-700 tabular-nums">
                      {sec.credits.toFixed(1)} Cr
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-100 font-mono text-[10px] text-slate-600 break-all space-y-1">
              <div>
                <strong>Digital Signature:</strong> {modalPayload?.digitalSignature}
              </div>
              <div>
                <strong>Timestamp:</strong> {modalPayload?.timestamp}
              </div>
              {modalPayload?.source && (
                <div>
                  <strong>Verification Source:</strong> {modalPayload.source}
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between">
              <div className="text-xs text-slate-700 font-bold">
                Total Enrolled Credits:{' '}
                <span className="text-emerald-600 tabular-nums">
                  {modalPayload?.totalCredits?.toFixed(1) || '0.0'} Cr
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Receipt
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. 1-CLICK RDS FALLBACK RECOVERY MODAL (US-S4) */}
      {activeModal === 'rds_fallback' && fallbackData && (
        <div
          role="dialog"
          aria-modal="true"
          className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        >
          <div className="bg-amber-600 text-white p-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-700 rounded-xl">
                <RefreshCw className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg leading-tight">
                  1-Click RDS Fallback Recovery
                </h3>
                <p className="text-amber-100 text-xs">
                  {fallbackData.failedCourseCode} ({fallbackData.failedSectionId}) failed RDS handshake
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeModal}
              aria-label="Close modal"
              className="text-amber-100 hover:text-white p-1 rounded-lg hover:bg-amber-700/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <strong>RDS Worker Diagnostic:</strong> {fallbackData.reason}
            </div>

            {modalError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs"
              >
                {modalError}
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                DAG-Compliant Open Alternatives:
              </div>
              {fallbackData.alternatives && fallbackData.alternatives.length > 0 ? (
                fallbackData.alternatives.map((alt) => {
                  const openSeats = alt.capacity - alt.enrolled;
                  return (
                    <div
                      key={alt.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="font-bold text-xs text-slate-900">
                          {alt.courseCode} Sec {alt.sectionNumber} &bull; {alt.faculty}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {alt.days} {alt.timeSlot} &bull; {alt.room} ({openSeats} open)
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={modalBusy}
                        onClick={async () => {
                          setModalError(null);
                          setModalBusy(true);
                          const res = await resolveRdsFallback(
                            fallbackData.failedSectionId,
                            alt.id
                          );
                          setModalBusy(false);
                          if (!res.ok) {
                            setModalError(res.message || 'Fallback swap failed.');
                          }
                        }}
                        className="px-3.5 py-2 rounded-lg bg-nsu-teal hover:bg-teal-700 disabled:opacity-60 text-white text-xs font-bold shrink-0"
                      >
                        {modalBusy ? 'Swapping...' : 'Swap & Re-Confirm'}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 rounded-xl bg-slate-100 text-xs text-slate-600 text-center">
                  No open alternative sections available for {fallbackData.failedCourseCode}.
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. EMERGENCY SECTION MODAL (IT ADMIN) */}
      {activeModal === 'emergency_section' && (
        <div
          role="dialog"
          aria-modal="true"
          className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
        >
          <div className="bg-rose-700 text-white p-5 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-800 rounded-xl">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg leading-tight">Provision Emergency Section</h3>
                <p className="text-rose-100 text-xs">
                  {modalPayload?.courseCode || 'CSE 327'} &bull; Direct Database Dispatch
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeModal}
              aria-label="Close modal"
              className="text-rose-200 hover:text-white p-1 rounded-lg hover:bg-rose-800/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-xs text-slate-600">
              Allocating an emergency section creates a new section (+40 capacity) in PostgreSQL/RDS and
              broadcasts availability to student clients in &le;500ms.
            </p>

            {modalError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs"
              >
                {modalError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Faculty In-Charge:</label>
                <input
                  type="text"
                  value={emergencyFaculty}
                  onChange={(e) => setEmergencyFaculty(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Days Pattern:</label>
                  <select
                    value={emergencyDays}
                    onChange={(e) => setEmergencyDays(e.target.value as 'MW' | 'ST' | 'RA')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                  >
                    <option value="MW">MW (Mon/Wed)</option>
                    <option value="ST">ST (Sun/Tue)</option>
                    <option value="RA">RA (Thu/Sat)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Room Assignment:</label>
                  <input
                    type="text"
                    value={emergencyRoom}
                    onChange={(e) => setEmergencyRoom(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Time Slot:</label>
                <input
                  type="text"
                  value={emergencySlot}
                  onChange={(e) => setEmergencySlot(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modalBusy}
                onClick={async () => {
                  setModalError(null);
                  setModalBusy(true);
                  const res = await allocateEmergencySection(
                    modalPayload?.courseCode || 'CSE 327',
                    {
                      faculty: emergencyFaculty,
                      days: emergencyDays,
                      room: emergencyRoom,
                      timeSlot: emergencySlot,
                      capacity: 40
                    }
                  );
                  setModalBusy(false);
                  if (!res.ok) {
                    setModalError(res.message || 'Failed to allocate emergency section.');
                  }
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-xs font-semibold shadow-sm"
              >
                {modalBusy ? 'Deploying...' : 'Deploy Emergency Section (+40 Seats)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
