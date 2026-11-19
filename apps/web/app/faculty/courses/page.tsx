'use client';

import React from 'react';
import { useSmartAdvisor } from '@/store/smartAdvisorStore';
import { FacultyHeader } from '@/components/FacultyHeader';
import { getRoomFireCodeCap } from '@/store/scheduleUtils';
import {
  Layers,
  MapPin,
  Clock,
  Users,
  History,
  AlertTriangle,
  ShieldCheck
} from 'lucide-react';

export default function FacultyCoursesPage() {
  const { sections, openModal, auditLog, authUser, lastError, clearError } = useSmartAdvisor();

  return (
    <div className="min-h-[calc(100vh-2.75rem)] bg-slate-50 flex flex-col">
      <FacultyHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Course Capacity Oversight &amp; Roster Management
            </h1>
            <p className="text-xs text-slate-500">
              Department of Electrical &amp; Computer Engineering &bull; Physical Room Fire-Code Enforcement
            </p>
          </div>
          <span className="text-xs font-mono px-3 py-1 rounded-full bg-slate-200/80 text-slate-700 font-semibold self-start sm:self-auto">
            Room Caps: LIB 608 (45) &bull; NAC 408/510 (50) &bull; LIB 602/SAC (55)
          </span>
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
              className="font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Course Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sections.map((sec) => {
            const available = sec.capacity - sec.enrolled;
            const percentage = Math.round((sec.enrolled / sec.capacity) * 100);
            const isFull = available <= 0;
            const roomCap = getRoomFireCodeCap(sec);
            const isOwner =
              authUser?.role === 'admin' ||
              (authUser?.role === 'faculty' &&
                (authUser.id === sec.instructorId ||
                  authUser.instructorName === sec.faculty ||
                  authUser.name === sec.faculty));

            return (
              <div
                key={sec.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-4 hover:border-slate-300 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-slate-900">{sec.courseCode}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-bold">
                        Sec {sec.sectionNumber}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">
                      {sec.courseTitle}
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                      isFull
                        ? 'bg-rose-100 text-rose-800'
                        : available <= 5
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {isFull ? 'Sold Out' : `${available} Available`}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                      <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{sec.faculty}</span>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1 ${
                        isOwner
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {isOwner && <ShieldCheck className="w-3 h-3" />}
                      {isOwner ? 'Your Section' : 'Other Faculty'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {sec.days} {sec.timeSlot}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {sec.room} (Cap {roomCap})
                    </span>
                  </div>
                </div>

                {/* Capacity Progress Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-500">Capacity Load:</span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {sec.enrolled} / {sec.capacity} Enrolled ({percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        isFull
                          ? 'bg-rose-500'
                          : percentage >= 80
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, percentage)}%` }}
                    ></div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openModal('capacity_expand', sec)}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-nsu-teal hover:text-white text-slate-800 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Expand Capacity (Rule 8.4)</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Recent Advising & Override Audit Log */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600" />
              <h2 className="font-bold text-sm text-slate-900">
                Recent Advising &amp; Override Audit Log
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">Real-time ledger</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
            {auditLog.map((log) => (
              <div key={log.id} className="py-2.5 flex items-start justify-between gap-4 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{log.action}</span>
                    <span className="text-slate-400 font-mono text-[10px]">&bull; {log.actor}</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">{log.details}</p>
                </div>
                <span className="text-[10px] font-mono text-slate-400 shrink-0 tabular-nums">
                  {log.timestamp}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
