'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSmartAdvisor } from '@/store/smartAdvisorStore';
import { getInitials } from '@/store/scheduleUtils';
import {
  Users,
  FileCheck2,
  BookOpen,
  Sliders
} from 'lucide-react';

export function FacultyHeader() {
  const pathname = usePathname();
  const { exceptions, authUser, wsConnected, sseConnected } = useSmartAdvisor();

  const pendingCount = exceptions.filter((e) => e.status === 'pending').length;
  const displayName =
    authUser?.role === 'faculty' && authUser.name ? authUser.name : 'Dr. Nova Ahmed';
  const displaySubtitle =
    authUser?.role === 'faculty' && authUser.department
      ? `${authUser.department} • Advising Comm.`
      : 'Chair • ECE Advising Comm.';
  const initials = getInitials(displayName);
  const realtimeOnline = wsConnected || sseConnected;

  const tabs = [
    { label: 'Exceptions Queue', href: '/faculty/exceptions', icon: FileCheck2, badge: `${pendingCount}` },
    { label: 'My Courses & Capacity', href: '/faculty/courses', icon: BookOpen },
    { label: 'Standing Bypass Rules', href: '/faculty/rules', icon: Sliders }
  ];

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between">
          {/* Left Title & Status */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-nsu-teal text-white rounded-xl shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-base tracking-tight text-slate-900">
                  NSU FACULTY PORTAL
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      realtimeOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
                    }`}
                  ></span>
                  {realtimeOnline ? 'RDS Faculty Live Sync' : 'RDS Faculty Node Ready'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Department of Electrical &amp; Computer Engineering
              </p>
            </div>
          </div>

          {/* Right Faculty Profile */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="font-bold text-xs text-slate-900">{displayName}</div>
              <div className="text-[10px] text-slate-500 font-mono">{displaySubtitle}</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center shadow-sm">
              {initials}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 border-t border-slate-100 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.label}
                href={tab.href}
                className={`py-3 px-3.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-nsu-teal text-nsu-teal font-bold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-amber-100 text-amber-800">
                    {tab.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
