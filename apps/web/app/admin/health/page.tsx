'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSmartAdvisor } from '@/store/smartAdvisorStore';
import { AdminSidebar } from '@/components/AdminSidebar';
import { buildTelemetryChartGeometry } from '@/store/scheduleUtils';
import {
  Activity,
  Zap,
  Server,
  Database,
  Flame,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  History,
  RefreshCw
} from 'lucide-react';

export default function AdminHealthPage() {
  const {
    metrics,
    auditLog,
    healthCheck,
    telemetryHistory,
    autoScaleApiNodes,
    acknowledgeIncident,
    fetchHealth,
    lastError,
    clearError
  } = useSmartAdvisor();

  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [breachSeconds, setBreachSeconds] = useState<number>(0);
  const breachStartRef = useRef<number | null>(null);

  // Poll /health every 5s (reads both 200 and 503)
  useEffect(() => {
    void fetchHealth();
    const timer = setInterval(() => {
      void fetchHealth();
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  const isBreached = metrics.p95LatencyMs > metrics.slaCeilingMs;
  const slaDelta = Math.round(metrics.p95LatencyMs - metrics.slaCeilingMs);
  const poolReserve = Math.max(0, metrics.poolTotal - metrics.poolUsed);
  const sustainedBreach = breachSeconds >= 60;

  // Track sustained >= 1m SLA breach duration
  useEffect(() => {
    if (!isBreached) {
      breachStartRef.current = null;
      setBreachSeconds(0);
      return;
    }
    if (breachStartRef.current === null) {
      breachStartRef.current = Date.now();
    }
    const timer = setInterval(() => {
      if (breachStartRef.current !== null) {
        setBreachSeconds(Math.floor((Date.now() - breachStartRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isBreached]);

  const geometry = buildTelemetryChartGeometry(telemetryHistory, metrics.slaCeilingMs);

  const slaLabelPlacement = (() => {
    const labelText = `CRITICAL SLA CEILING (${metrics.slaCeilingMs} ms)`;
    const boxWidth = Math.max(170, labelText.length * 6.4);
    const candidates = [
      {
        x: 590,
        anchor: 'end' as const,
        xMin: 590 - boxWidth,
        xMax: 594,
        y: Math.max(16, geometry.slaY - 8),
        yCenter: Math.max(12, geometry.slaY - 12)
      },
      {
        x: 590,
        anchor: 'end' as const,
        xMin: 590 - boxWidth,
        xMax: 594,
        y: Math.min(184, geometry.slaY + 15),
        yCenter: Math.min(180, geometry.slaY + 11)
      },
      {
        x: 10,
        anchor: 'start' as const,
        xMin: 6,
        xMax: 10 + boxWidth,
        y: Math.max(16, geometry.slaY - 8),
        yCenter: Math.max(12, geometry.slaY - 12)
      },
      {
        x: 10,
        anchor: 'start' as const,
        xMin: 6,
        xMax: 10 + boxWidth,
        y: Math.min(184, geometry.slaY + 15),
        yCenter: Math.min(180, geometry.slaY + 11)
      }
    ];

    let best = candidates[0];
    let bestClearance = -1;
    for (const cand of candidates) {
      let minClearance = Number.POSITIVE_INFINITY;
      for (const pt of geometry.points) {
        for (const cy of [pt.cyLatency, pt.cyRps]) {
          const dx = pt.cx < cand.xMin ? cand.xMin - pt.cx : pt.cx > cand.xMax ? pt.cx - cand.xMax : 0;
          const dy =
            cy < cand.yCenter - 8
              ? cand.yCenter - 8 - cy
              : cy > cand.yCenter + 8
                ? cy - (cand.yCenter + 8)
                : 0;
          const dist = Math.hypot(dx, dy);
          if (dist < minClearance) {
            minClearance = dist;
          }
        }
      }
      if (minClearance > bestClearance) {
        bestClearance = minClearance;
        best = cand;
      }
    }
    return { ...best, labelText, boxWidth };
  })();

  const apiHealth = healthCheck?.checks?.api;
  const pgHealth = healthCheck?.checks?.postgres;
  const redisHealth = healthCheck?.checks?.redis;

  const renderHealthStatusBadge = (status?: 'up' | 'down' | 'memory') => {
    if (status === 'up') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 uppercase">
          up
        </span>
      );
    }
    if (status === 'memory') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 uppercase">
          memory
        </span>
      );
    }
    if (status === 'down') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-100 text-rose-800 uppercase">
          down
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700 uppercase">
        checking
      </span>
    );
  };

  return (
    <div className="flex bg-slate-100 min-h-[calc(100vh-2.75rem)]">
      <AdminSidebar />

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  System Health &amp; Telemetry Hub
                </h1>
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                    healthCheck?.status === 'degraded'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {healthCheck
                    ? `${healthCheck.status.toUpperCase()} (${healthCheck.mode ?? 'memory'})`
                    : 'Node Cluster Active'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time connection pool, p95 latency monitoring, /health probe polling (5s), and auto-scaling
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchHealth()}
                className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Probe</span>
              </button>
              <Link
                href="/admin/escalations"
                className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Seat Escalations</span>
              </Link>
            </div>
          </div>

          {lastError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3"
            >
              <span>{lastError}</span>
              <button type="button" onClick={clearError} className="font-semibold underline">
                Dismiss
              </button>
            </div>
          )}

          {/* Live /health Component Cards: API, PostgreSQL, Redis */}
          <div id="services" className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-indigo-600" />
                  API Service
                </span>
                {renderHealthStatusBadge(apiHealth?.status)}
              </div>
              <div className="text-xs text-slate-600">
                {metrics.apiNodes} Active Node(s) &bull;{' '}
                {apiHealth?.latencyMs !== undefined ? `${apiHealth.latencyMs}ms probe` : 'Express + WS/SSE'}
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                {apiHealth?.details || 'REST / WebSocket / SSE Gateway'}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-teal-600" />
                  PostgreSQL 16
                </span>
                {renderHealthStatusBadge(pgHealth?.status)}
              </div>
              <div className="text-xs text-slate-600">
                Row-Lock ACID Engine{' '}
                {pgHealth?.latencyMs !== undefined ? `• ${pgHealth.latencyMs}ms` : ''}
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                {pgHealth?.details || 'Mode: ' + (healthCheck?.mode ?? 'memory')}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-rose-600" />
                  Redis 7 Pub/Sub
                </span>
                {renderHealthStatusBadge(redisHealth?.status)}
              </div>
              <div className="text-xs text-slate-600">
                smartadvisor-sync &amp; BullMQ{' '}
                {redisHealth?.latencyMs !== undefined ? `• ${redisHealth.latencyMs}ms` : ''}
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                {redisHealth?.details || 'Cross-process event bus'}
              </div>
            </div>
          </div>

          {/* 4 Live-Updating KPI Cards */}
          <div id="database" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Requests / Sec
              </div>
              <div className="text-2xl font-black text-slate-900 tabular-nums font-mono">
                {metrics.requestsPerSec.toLocaleString()}{' '}
                <span className="text-xs font-normal text-slate-400">req/s</span>
              </div>
              <div className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>
                  {metrics.surgeSpikeActive ? 'Surge Load Active' : 'Peak Registration Phase'}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  P95 Latency
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                    isBreached ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  SLA: {metrics.slaCeilingMs} ms
                </span>
              </div>
              <div
                className={`text-2xl font-black tabular-nums font-mono ${
                  isBreached ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {metrics.p95LatencyMs}{' '}
                <span className="text-xs font-normal text-slate-400">ms</span>
              </div>
              <div
                className={`text-[11px] mt-1 font-semibold flex items-center gap-1 ${
                  isBreached ? 'text-rose-600 animate-pulse' : 'text-emerald-600'
                }`}
              >
                {isBreached ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>
                      Breached SLA Ceiling (+{slaDelta} ms)
                      {sustainedBreach ? ` • Sustained ${breachSeconds}s` : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Compliant with SLA</span>
                  </>
                )}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                HTTP 5xx Error Rate
              </div>
              <div className="text-2xl font-black text-slate-900 tabular-nums font-mono">
                {metrics.errorRate.toFixed(2)}%
              </div>
              <div className="text-[11px] text-emerald-600 mt-1 font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Zero Database Panics</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                PostgreSQL Pool
              </div>
              <div className="text-2xl font-black text-slate-900 tabular-nums font-mono">
                {metrics.poolUsed} / {metrics.poolTotal}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-mono">
                {Math.round((metrics.poolUsed / metrics.poolTotal) * 100)}% Used &bull;{' '}
                {poolReserve} slots reserve
              </div>
            </div>
          </div>

          {/* Data-Driven SVG Dual-Axis Chart */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600" />
                  Throughput &amp; Latency Dynamics (Data-Driven Stream)
                </h2>
                <p className="text-xs text-slate-500">
                  Live rolling telemetry history ({geometry.points.length} samples)
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono">
                <div className="flex items-center gap-1.5 text-indigo-600 font-semibold">
                  <span className="w-3 h-0.5 bg-indigo-600"></span>
                  Throughput (req/s)
                </div>
                <div className="flex items-center gap-1.5 text-teal-600 font-semibold">
                  <span className="w-3 h-0.5 bg-teal-600"></span>
                  P95 Latency (ms)
                </div>
                <div className="flex items-center gap-1.5 text-rose-600 font-semibold">
                  <span className="w-3 h-0.5 border-t border-dashed border-rose-600"></span>
                  SLA Ceiling ({metrics.slaCeilingMs} ms)
                </div>
              </div>
            </div>

            <div className="relative h-64 w-full pt-4">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 600 205">
                <line x1="0" y1="40" x2="600" y2="40" stroke="#F1F5F9" strokeWidth="1" />
                <line x1="0" y1="90" x2="600" y2="90" stroke="#F1F5F9" strokeWidth="1" />
                <line x1="0" y1="140" x2="600" y2="140" stroke="#F1F5F9" strokeWidth="1" />
                <line x1="0" y1="190" x2="600" y2="190" stroke="#E2E8F0" strokeWidth="1" />

                {/* SLA Ceiling Line computed on exact same Y scale */}
                <line
                  x1="0"
                  y1={geometry.slaY}
                  x2="600"
                  y2={geometry.slaY}
                  stroke="#DC2626"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
                <rect
                  x={slaLabelPlacement.xMin}
                  y={slaLabelPlacement.y - 10}
                  width={slaLabelPlacement.boxWidth}
                  height="13"
                  rx="3"
                  fill="#FFFFFF"
                  fillOpacity="0.9"
                />
                <text
                  x={slaLabelPlacement.x}
                  y={slaLabelPlacement.y}
                  fill="#DC2626"
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor={slaLabelPlacement.anchor}
                  fontFamily="monospace"
                >
                  {slaLabelPlacement.labelText}
                </text>

                {/* Data-Driven Throughput Polyline (Indigo) */}
                <path
                  d={geometry.rpsPath}
                  fill="none"
                  stroke="#4F46E5"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* Data-Driven Latency Polyline (Teal) */}
                <path
                  d={geometry.latencyPath}
                  fill="none"
                  stroke="#0D7A91"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* Interactive Data Points */}
                {geometry.points.map((pt, idx) => (
                  <g
                    key={`${pt.time}-${idx}`}
                    className="cursor-pointer group"
                    onMouseEnter={() => setHoveredPoint(idx)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  >
                    <circle
                      cx={pt.cx}
                      cy={pt.cyRps}
                      r="3.5"
                      fill="#4F46E5"
                      stroke="#FFFFFF"
                      strokeWidth="1.5"
                    />
                    <circle
                      cx={pt.cx}
                      cy={pt.cyLatency}
                      r="5"
                      fill={pt.latency > metrics.slaCeilingMs ? '#DC2626' : '#0D7A91'}
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                    <text
                      x={pt.cx}
                      y="202"
                      fill="#64748B"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {pt.time}
                    </text>
                  </g>
                ))}
              </svg>

              {hoveredPoint !== null && geometry.points[hoveredPoint] && (
                <div
                  className="absolute bg-slate-900 text-white text-xs p-2.5 rounded-xl shadow-xl pointer-events-none z-10 font-mono -translate-x-1/2 -translate-y-full"
                  style={{
                    left: `${(geometry.points[hoveredPoint].cx / 600) * 100}%`,
                    top: '40%'
                  }}
                >
                  <div className="font-bold text-teal-400">
                    Time: {geometry.points[hoveredPoint].time}
                  </div>
                  <div>Throughput: {geometry.points[hoveredPoint].rps} req/s</div>
                  <div
                    className={
                      geometry.points[hoveredPoint].latency > metrics.slaCeilingMs
                        ? 'text-rose-400'
                        : 'text-emerald-400'
                    }
                  >
                    P95 Latency: {geometry.points[hoveredPoint].latency} ms
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Active Alerts & Actionable Incident Resolution Box */}
          <div
            id="infrastructure"
            className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isBreached ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                    }`}
                  ></span>
                  <h3 className="font-bold text-sm text-slate-900">
                    {sustainedBreach
                      ? `SEV-1 Sustained SLA Breach (${breachSeconds}s > 60s Threshold)`
                      : isBreached
                      ? 'SEV-1 Telemetry Alert: Edge API Capacity Under Pressure'
                      : 'All Service Level Objectives Meeting Strict Standards'}
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  {metrics.lastScalingEvent ||
                    `Currently ${metrics.apiNodes} worker instances active in ap-south-1 Dhaka Edge zone.`}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => acknowledgeIncident()}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold"
                >
                  Acknowledge
                </button>

                <button
                  type="button"
                  onClick={() => autoScaleApiNodes()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>Auto-Scale API Nodes (+2)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Live Alert & Audit Log Section (#alerts) */}
          <div
            id="alerts"
            className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-rose-600" />
                <h2 className="font-bold text-sm text-slate-900">
                  Operations Alert &amp; Scaling Audit Log
                </h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {auditLog.length} recorded events
              </span>
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
        </div>
      </main>
    </div>
  );
}
