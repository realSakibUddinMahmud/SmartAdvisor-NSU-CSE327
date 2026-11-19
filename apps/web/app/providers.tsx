'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SmartAdvisorProvider, useSmartAdvisor } from '@/store/smartAdvisorStore';
import { DemoHeader } from '@/components/DemoHeader';
import { GlobalModals } from '@/components/GlobalModals';
import { UserRole } from '@/types';

function getRoleHomePath(role: UserRole): string {
  if (role === 'faculty') return '/faculty/exceptions';
  if (role === 'admin') return '/admin/health';
  return '/student/dashboard';
}

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { authUser, authHydrated } = useSmartAdvisor();

  const isStudentRoute = pathname.startsWith('/student');
  const isFacultyRoute = pathname.startsWith('/faculty');
  const isAdminRoute = pathname.startsWith('/admin');
  const isProtectedRoute = isStudentRoute || isFacultyRoute || isAdminRoute;

  const needsLogin = isProtectedRoute && authHydrated && !authUser;
  const studentDenied =
    isStudentRoute && authHydrated && Boolean(authUser) && authUser!.role !== 'student';
  const facultyDenied =
    isFacultyRoute &&
    authHydrated &&
    Boolean(authUser) &&
    authUser!.role !== 'faculty' &&
    authUser!.role !== 'admin';
  const adminDenied =
    isAdminRoute && authHydrated && Boolean(authUser) && authUser!.role !== 'admin';

  useEffect(() => {
    if (needsLogin) {
      router.replace('/login');
    }
  }, [needsLogin, router]);

  if (isProtectedRoute && !authHydrated) {
    return (
      <div className="min-h-[calc(100vh-2.75rem)] flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 text-xs font-medium text-slate-600 shadow-sm">
          Verifying portal session...
        </div>
      </div>
    );
  }

  if (needsLogin) {
    return (
      <div className="min-h-[calc(100vh-2.75rem)] flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 text-center space-y-2 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Redirecting to Portal Gateway...</p>
          <p className="text-xs text-slate-500">
            Authentication is required to access this portal.
          </p>
        </div>
      </div>
    );
  }

  if (studentDenied || facultyDenied || adminDenied) {
    const portalLabel = adminDenied
      ? 'IT Admin Hub'
      : facultyDenied
        ? 'Faculty Portal'
        : 'Student Portal';
    const homeHref = authUser ? getRoleHomePath(authUser.role) : '/login';
    return (
      <div className="min-h-[calc(100vh-2.75rem)] flex items-center justify-center bg-slate-50 px-4">
        <div
          role="alert"
          className="max-w-md w-full bg-white border border-rose-200 rounded-2xl p-6 shadow-sm space-y-4 text-center"
        >
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-rose-700">Access Denied</h2>
            <p className="text-xs text-slate-600">
              Unauthorized: Your role does not have permission to access the {portalLabel}.
            </p>
          </div>
          <Link
            href={homeHref}
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-nsu-navy hover:bg-nsu-teal text-white text-xs font-semibold transition-colors"
          >
            Return to My Portal
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SmartAdvisorProvider>
      <DemoHeader />
      <GlobalModals />
      <RouteGuard>{children}</RouteGuard>
    </SmartAdvisorProvider>
  );
}
