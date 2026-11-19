'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSmartAdvisor } from '@/store/smartAdvisorStore';
import { AdminSidebar } from '@/components/AdminSidebar';
import {
  Flame,
  Plus,
  ArrowRight,
  ArrowLeft,
  Layers,
  RefreshCw,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

export default function AdminEscalationsPage() {
  const {
    escalations,
    sections,
    openModal,
    addSeatsToAllSections,
    syncRds4,
    lastError,
    clearError
  } = useSmartAdvisor();

  const [selectedEscalationId, setSelectedEscalationId] = useState<string>('#ESC-9481');
  const [syncBusy, setSyncBusy] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const selectedEscalation =
    escalations.find((e) => e.id === selectedEscalationId) || escalations[0];

  const openEscalationsCount = escalations.filter((e) => e.status === 'Open').length;

  // Derive live enrolled, capacity, and openSeats from sections matching courseCode
  const getLiveStats = (courseCode: string, fallbackEnrolled: number, fallbackCap: number) => {
    const matching = sections.filter((s) => s.courseCode === courseCode);
    if (matching.length === 0) {
      return {
        enrolled: fallbackEnrolled,
        totalCapacity: fallbackCap,
        openSeats: Math.max(0, fallbackCap - fallbackEnrolled)
      };
    }
    const enrolled = matching.reduce((acc, s) => acc + s.enrolled, 0);
    const totalCapacity = matching.reduce((acc, s) => acc + s.capacity, 0);
    return {
      enrolled,
      totalCapacity,
      openSeats: Math.max(0, totalCapacity - enrolled)
    };
  };

  const handleRds4Sync = async () => {
    setSyncBusy(true);
    setSyncMessage(null);
    const res = await syncRds4();
    setSyncBusy(false);
    if (res.ok) {
      const data = res.data as
        | {
            totalProcessed?: number;
            driftCount?: number;
            syncResult?: { totalProcessed?: number; driftCount?: number };
          }
        | undefined;
      const totalProcessed =
        data?.syncResult?.totalProcessed ?? data?.totalProcessed ?? sections.length;
      const driftCount = data?.syncResult?.driftCount ?? data?.driftCount ?? 0;
      setSyncMessage(
        `RDS4 snapshot synced (${totalProcessed} sections processed, ${driftCount} updates).`
      );
    }
  };

  return (
    <div className="flex bg-slate-100 min-h-[calc(100vh-2.75rem)]">
      <AdminSidebar />

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Dynamic SEV-1 Shortage Banner */}
          <div
            className={`p-5 rounded-2xl shadow-md border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              openEscalationsCount > 0
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-emerald-600 text-white border-emerald-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl shrink-0 ${
                  openEscalationsCount > 0 ? 'bg-rose-700 animate-bounce' : 'bg-emerald-700'
                }`}
              >
                {openEscalationsCount > 0 ? (
                  <Flame className="w-6 h-6 text-white" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-xs font-black px-2 py-0.5 rounded bg-white ${
                      openEscalationsCount > 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {openEscalationsCount > 0
                      ? `SEV-1 ACTIVE (${openEscalationsCount} OPEN)`
                      : 'ALL ESCALATIONS MITIGATED'}
                  </span>
                  <span className="text-xs font-semibold opacity-90">
                    {openEscalationsCount > 0
                      ? 'High Seat Deficit Detected'
                      : 'Capacity Healthy'}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white mt-0.5">
                  Critical Shortage Escalation Registry
                </h2>
                <p className="text-xs opacity-90">
                  {openEscalationsCount > 0
                    ? `${openEscalationsCount} course escalation(s) require capacity expansion or emergency sections.`
                    : 'All waitlisted demand has been absorbed by added capacity or emergency sections.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                disabled={syncBusy}
                onClick={handleRds4Sync}
                className="px-4 py-2 rounded-xl bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-60 text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncBusy ? 'animate-spin' : ''}`} />
                <span>{syncBusy ? 'Syncing RDS4...' : 'Sync RDS4'}</span>
              </button>

              <Link
                href="/admin/health"
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Telemetry Hub
              </Link>
            </div>
          </div>

          {(lastError || syncMessage) && (
            <div
              role={lastError ? 'alert' : 'status'}
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                lastError
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {lastError ? (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <span>{lastError || syncMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setSyncMessage(null);
                }}
                className="font-semibold underline"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Escalations Registry */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Live Shortage Incidents</h3>
                  <p className="text-xs text-slate-500">Live capacity derived from section rows</p>
                </div>
                <span className="text-xs font-mono font-bold text-rose-600">
                  {openEscalationsCount} Open Incidents
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {escalations.map((item) => {
                  const isSelected = item.id === selectedEscalation?.id;
                  const isResolved = item.status === 'Resolved' || item.status === 'Mitigated';
                  const live = getLiveStats(item.courseCode, item.enrolled, item.totalCapacity);

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedEscalationId(item.id)}
                      className={`p-4 cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-rose-50/50 border-l-4 border-rose-600'
                          : 'hover:bg-slate-50 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-slate-600">
                            {item.id}
                          </span>
                          {item.autoGenerated && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                              Auto-Generated
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isResolved
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800 animate-pulse'
                          }`}
                        >
                          {item.status} &bull; {item.severity}
                        </span>
                      </div>

                      <div className="font-bold text-base text-slate-900">{item.courseCode}</div>
                      <div className="text-xs text-slate-500 truncate">{item.courseTitle}</div>

                      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs pt-2.5 border-t border-slate-100">
                        <div className="p-1.5 rounded-lg bg-slate-50">
                          <span className="text-[10px] text-slate-400 block">Enrolled</span>
                          <span className="font-mono font-bold text-slate-700 tabular-nums">
                            {live.enrolled}
                          </span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-slate-50">
                          <span className="text-[10px] text-slate-400 block">Capacity</span>
                          <span className="font-mono font-bold text-slate-700 tabular-nums">
                            {live.totalCapacity}
                          </span>
                        </div>
                        <div className="p-1.5 rounded-lg bg-slate-50">
                          <span className="text-[10px] text-slate-400 block">Open</span>
                          <span className="font-mono font-bold text-emerald-700 tabular-nums">
                            {live.openSeats}
                          </span>
                        </div>
                        <div
                          className={`p-1.5 rounded-lg ${
                            item.deficit > 0 ? 'bg-rose-50/80' : 'bg-emerald-50/80'
                          }`}
                        >
                          <span
                            className={`text-[10px] block ${
                              item.deficit > 0 ? 'text-rose-500' : 'text-emerald-600'
                            }`}
                          >
                            Deficit
                          </span>
                          <span
                            className={`font-mono font-bold tabular-nums ${
                              item.deficit > 0 ? 'text-rose-700' : 'text-emerald-700'
                            }`}
                          >
                            {item.deficit > 0 ? `-${item.deficit}` : '0'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Escalation Inspector */}
            {selectedEscalation && (
              <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-6">
                {(() => {
                  const live = getLiveStats(
                    selectedEscalation.courseCode,
                    selectedEscalation.enrolled,
                    selectedEscalation.totalCapacity
                  );
                  return (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-500">
                              {selectedEscalation.id}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                              {selectedEscalation.severity}
                            </span>
                            {selectedEscalation.autoGenerated && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                                Auto-Generated (0 Open Seats)
                              </span>
                            )}
                          </div>
                          <h2 className="text-xl font-black text-slate-900 mt-1">
                            {selectedEscalation.courseCode} &mdash; {selectedEscalation.courseTitle}
                          </h2>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            Live Seats: {live.enrolled}/{live.totalCapacity} enrolled &bull;{' '}
                            {live.openSeats} open &bull; {selectedEscalation.waitlisted} waitlisted
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-slate-500">Total Unmet Demand</div>
                          <div
                            className={`text-2xl font-black tabular-nums font-mono ${
                              selectedEscalation.deficit > 0 ? 'text-rose-600' : 'text-emerald-600'
                            }`}
                          >
                            {selectedEscalation.deficit > 0
                              ? `-${selectedEscalation.deficit} Seats`
                              : '0 Seats'}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center justify-between">
                          <span>Demand Surge Over Past 2 Hours</span>
                          <span className="font-mono text-slate-400 text-[11px]">Interval: 30m</span>
                        </div>

                        <div className="grid grid-cols-5 gap-2 text-center text-xs">
                          {selectedEscalation.demandSurge?.map((pt, idx) => (
                            <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                              <div className="text-[10px] font-mono text-slate-400">{pt.time}</div>
                              <div className="font-mono font-bold text-slate-900 mt-1">{pt.requests}</div>
                              <div className="text-[10px] text-teal-600">reqs</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          Queue Breakdown by Student Major
                        </div>

                        <div className="space-y-2">
                          {selectedEscalation.breakdown?.map((item, idx) => (
                            <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-800">{item.major}</span>
                                <span className="font-mono font-bold text-slate-700">
                                  {item.count} students ({item.percentage}%)
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-indigo-600 h-1.5 rounded-full"
                                  style={{ width: `${item.percentage}%` }}
                                ></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-slate-100 space-y-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                          Actionable Resolution Pathways:
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => addSeatsToAllSections(selectedEscalation.courseCode, 5)}
                            className="p-3.5 rounded-xl border border-indigo-200 hover:border-indigo-400 bg-indigo-50/60 hover:bg-indigo-50 text-indigo-900 text-xs font-bold transition-all flex items-center justify-between group cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <Layers className="w-4 h-4 text-indigo-600" />
                              <div className="text-left">
                                <div>+5 Seats to All Secs</div>
                                <div className="text-[10px] text-indigo-600/80 font-normal">
                                  Expands existing classrooms
                                </div>
                              </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-1 transition-transform" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              openModal('emergency_section', {
                                courseCode: selectedEscalation.courseCode
                              })
                            }
                            className="p-3.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-between group cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <Plus className="w-4 h-4 text-white" />
                              <div className="text-left">
                                <div>Allocate Emergency Section</div>
                                <div className="text-[10px] text-rose-100 font-normal">
                                  Provision new section (+40 Seats)
                                </div>
                              </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-rose-200 group-hover:translate-x-1 transition-transform" />
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
