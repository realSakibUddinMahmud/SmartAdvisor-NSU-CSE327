'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSmartAdvisor } from '@/store/smartAdvisorStore';
import {
  Activity,
  Flame,
  Server,
  Database,
  Bell,
  Settings,
  Cpu
} from 'lucide-react';

export function AdminSidebar() {
  const pathname = usePathname();
  const { escalations, metrics, healthCheck } = useSmartAdvisor();

  const [activeHash, setActiveHash] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncHash = () => setActiveHash(window.location.hash || '');
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [pathname]);

  const openEscalationsCount = escalations.filter((e) => e.status === 'Open').length;

  const navItems = [
    {
      label: 'System Health',
      href: '/admin/health',
      matchPath: '/admin/health',
      matchHash: '',
      icon: Activity
    },
    {
      label: 'Seat Escalations',
      href: '/admin/escalations',
      matchPath: '/admin/escalations',
      matchHash: '',
      icon: Flame,
      badge: openEscalationsCount > 0 ? `${openEscalationsCount} SEV-1` : undefined
    },
    {
      label: 'Service Nodes',
      href: '/admin/health#services',
      matchPath: '/admin/health',
      matchHash: '#services',
      icon: Server,
      badge: `${metrics.apiNodes} Active`
    },
    {
      label: 'Database Pool',
      href: '/admin/health#database',
      matchPath: '/admin/health',
      matchHash: '#database',
      icon: Database,
      badge: `${metrics.poolUsed}/${metrics.poolTotal}`
    },
    {
      label: 'Alert Log',
      href: '/admin/health#alerts',
      matchPath: '/admin/health',
      matchHash: '#alerts',
      icon: Bell
    },
    {
      label: 'Infrastructure',
      href: '/admin/health#infrastructure',
      matchPath: '/admin/health',
      matchHash: '#infrastructure',
      icon: Settings
    }
  ];

  const isHealthy = !healthCheck || healthCheck.status === 'ok';

  return (
    <aside className="w-64 bg-slate-900 text-white border-r border-slate-800 flex flex-col justify-between shrink-0 hidden md:flex min-h-[calc(100vh-2.75rem)]">
      <div className="p-4 space-y-6">
        {/* Title */}
        <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600 text-white font-bold flex items-center justify-center text-sm shadow-sm shrink-0">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-sm text-white">IT Operations Hub</div>
              <div className="text-[10px] font-mono text-slate-400">Dhaka Edge Gateway</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 mb-2 font-mono">
            Telemetry &amp; Infrastructure
          </div>
          {navItems.map((item) => {
            const isActive =
              pathname === item.matchPath &&
              (item.matchPath === '/admin/escalations' || activeHash === item.matchHash);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setActiveHash(item.matchHash)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-rose-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold tabular-nums font-mono ${
                      item.badge.includes('SEV-1')
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer telemetry */}
      <div className="p-4 border-t border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            ></span>
            PRODUCTION RDS
          </span>
          <span className="text-slate-300">{healthCheck?.mode ?? 'ap-south-1'}</span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          Dhaka Edge &bull; {isHealthy ? 'Cluster Healthy' : 'Degraded Mode'}
        </div>
      </div>
    </aside>
  );
}
