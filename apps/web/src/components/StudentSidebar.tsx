'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSmartAdvisor } from '@/store/smartAdvisorStore';
import { getInitials } from '@/store/scheduleUtils';
import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  FileClock,
  Bell,
  ShieldCheck
} from 'lucide-react';

export function StudentSidebar() {
  const pathname = usePathname();
  const {
    student,
    stagedSectionIds,
    exceptions,
    notifications,
    waitlistEntries,
    wsConnected,
    sseConnected
  } = useSmartAdvisor();

  const [activeHash, setActiveHash] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncHash = () => setActiveHash(window.location.hash || '');
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [pathname]);

  const pendingExceptionsCount = exceptions.filter(
    (e) => e.studentId === student.id && e.status === 'pending'
  ).length;
  const unreadNotifCount = notifications.filter(
    (n) => n.studentId === student.id && !n.read
  ).length;
  const myWaitlistCount = waitlistEntries.filter(
    (w) => w.studentId === student.id && w.status === 'waiting'
  ).length;

  const isCleared = Boolean(student.advisingClearedBy);

  const navItems = [
    {
      label: 'Dashboard',
      href: '/student/dashboard',
      matchPath: '/student/dashboard',
      matchHash: '',
      icon: LayoutDashboard
    },
    {
      label: 'Courses Radar',
      href: '/student/dashboard#radar',
      matchPath: '/student/dashboard',
      matchHash: '#radar',
      icon: BookOpen,
      badge: myWaitlistCount > 0 ? `${myWaitlistCount} WL` : undefined
    },
    {
      label: 'Weekly Schedule',
      href: '/student/schedule',
      matchPath: '/student/schedule',
      matchHash: '',
      icon: CalendarDays,
      badge: `${stagedSectionIds.length} staged`
    },
    {
      label: 'Requests & Exceptions',
      href: '/student/dashboard#petitions',
      matchPath: '/student/dashboard',
      matchHash: '#petitions',
      icon: FileClock,
      badge: pendingExceptionsCount > 0 ? `${pendingExceptionsCount}` : undefined
    },
    {
      label: 'Notifications',
      href: '/student/dashboard#notifications',
      matchPath: '/student/dashboard',
      matchHash: '#notifications',
      icon: Bell,
      badge: unreadNotifCount > 0 ? `${unreadNotifCount} new` : undefined
    },
    {
      label: 'Advising Clearance',
      href: '/student/dashboard#clearance',
      matchPath: '/student/dashboard',
      matchHash: '#clearance',
      icon: ShieldCheck,
      badge: isCleared ? 'Cleared' : 'Pending'
    }
  ];

  const initials = getInitials(student.name);
  const realtimeOnline = wsConnected || sseConnected;

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 hidden md:flex min-h-[calc(100vh-2.75rem)]">
      <div className="p-4 space-y-6">
        {/* Student Profile Card */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-sm shrink-0">
              {initials}
            </div>
            <div className="overflow-hidden">
              <div className="font-bold text-sm text-slate-900 truncate">{student.name}</div>
              <div className="text-[11px] font-mono text-slate-500 tabular-nums">{student.id}</div>
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-200/80 grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <span className="text-slate-400 block">Standing</span>
              <span className="font-semibold text-slate-700">{student.standing}</span>
            </div>
            <div>
              <span className="text-slate-400 block">CGPA</span>
              <span className="font-bold text-indigo-700 tabular-nums">{student.cgpa.toFixed(2)}</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400 block">Credits Earned</span>
              <span className="font-bold text-slate-800 tabular-nums">
                {student.creditsCompleted} / {student.creditsTotal} Cr
              </span>
            </div>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
            Advising Workspace
          </div>
          {navItems.map((item) => {
            const isActive =
              pathname === item.matchPath &&
              (item.matchPath === '/student/schedule' || activeHash === item.matchHash);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setActiveHash(item.matchHash)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-nsu-teal/10 text-nsu-teal font-bold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-nsu-teal' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold tabular-nums ${
                      item.badge === 'Cleared'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.badge.includes('new')
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-indigo-100 text-indigo-800'
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
      <div className="p-4 border-t border-slate-200 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                realtimeOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`}
            ></span>
            RDS Live Sync
          </span>
          <span className="font-bold text-slate-700">
            {realtimeOnline ? 'WS/SSE Active' : 'Local Sync'}
          </span>
        </div>
        <div className="text-[10px] text-slate-400 font-mono truncate">
          Cart Token: {student.cartToken}
        </div>
      </div>
    </aside>
  );
}
