'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
  useRef
} from 'react';
import {
  StudentProfile,
  CourseSection,
  ExceptionCase,
  BypassRule,
  AuditLogItem,
  AdminMetrics,
  EscalationItem,
  ScheduleReceipt,
  UserRole,
  AuthUser,
  NotificationItem,
  WaitlistEntry,
  DagSummary,
  RdsFallbackPrompt,
  HealthCheckResult,
  ScheduleClash,
  SolveScheduleRequest,
  SolveScheduleResult,
  BackendState
} from '@/types';
import {
  ROOM_FIRE_CODE_CAPS,
  detectScheduleClashes,
  parseTimeSlot,
  TelemetryPoint
} from './scheduleUtils';

// ================= SEEDED DEFAULTS (ALIGNED 1:1 WITH services/api/src/seedData.ts) =================

export const DEMO_DEFAULT_PASSWORD =
  process.env.NEXT_PUBLIC_DEMO_DEFAULT_PASSWORD || 'SmartAdvisor2025!';

export const SEEDED_DEMO_ACCOUNTS: Record<
  UserRole,
  { id: string; name: string; email: string; department: string }
> = {
  student: {
    id: '2412159042',
    name: 'Rahim Ahmed',
    email: 'rahim.ahmed01@northsouth.edu',
    department: 'ECE / CSE'
  },
  faculty: {
    id: 'nova.ahmed',
    name: 'Dr. Nova Ahmed',
    email: 'nova.ahmed@northsouth.edu',
    department: 'ECE / CSE'
  },
  admin: {
    id: 'admin.itops',
    name: 'IT Operations Admin',
    email: 'itops@northsouth.edu',
    department: 'IT Operations'
  }
};

const OFFLINE_SEED_USERS: Record<string, AuthUser> = {
  '2412159042': {
    id: '2412159042',
    name: 'Rahim Ahmed',
    role: 'student',
    email: 'rahim.ahmed01@northsouth.edu',
    department: 'ECE / CSE'
  },
  '2321450042': {
    id: '2321450042',
    name: 'Fariha Tasnim',
    role: 'student',
    email: 'fariha.tasnim@northsouth.edu',
    department: 'ECE / CSE'
  },
  '2211290042': {
    id: '2211290042',
    name: 'Tanveer Hasan',
    role: 'student',
    email: 'tanveer.hasan@northsouth.edu',
    department: 'ECE / CSE'
  },
  'nova.ahmed': {
    id: 'nova.ahmed',
    name: 'Dr. Nova Ahmed',
    role: 'faculty',
    email: 'nova.ahmed@northsouth.edu',
    department: 'ECE / CSE',
    instructorName: 'Dr. Nova Ahmed'
  },
  'nabeel.mohammed': {
    id: 'nabeel.mohammed',
    name: 'Dr. Nabeel Mohammed',
    role: 'faculty',
    email: 'nabeel.mohammed@northsouth.edu',
    department: 'ECE / CSE',
    instructorName: 'Dr. Nabeel Mohammed'
  },
  'admin.itops': {
    id: 'admin.itops',
    name: 'IT Operations Admin',
    role: 'admin',
    email: 'itops@northsouth.edu',
    department: 'IT Operations'
  }
};

export const INITIAL_STUDENT: StudentProfile = {
  id: '2412159042',
  name: 'Rahim Ahmed',
  email: 'rahim.ahmed01@northsouth.edu',
  program: 'B.Sc in Computer Science and Engineering',
  standing: 'Senior Standing',
  creditsCompleted: 96,
  creditsTotal: 130,
  cgpa: 3.64,
  cartToken: '#NSU-241215-9042',
  clearedCourses: [
    { code: 'CSE 115', grade: 'A' },
    { code: 'CSE 215', grade: 'A' },
    { code: 'CSE 311', grade: 'A-' },
    { code: 'CSE 231', grade: 'B+' }
  ],
  advisingClearedBy: 'Dr. Nova Ahmed',
  slotClosesAt: new Date(Date.now() + 16094000).toISOString(),
  maxCredits: 15.0
};

export const INITIAL_SECTIONS: CourseSection[] = [
  {
    id: 'CSE327-01',
    courseCode: 'CSE 327',
    courseTitle: 'Software Engineering',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '01',
    faculty: 'Dr. Nabeel Mohammed',
    instructorId: 'nabeel.mohammed',
    days: 'ST',
    timeSlot: '11:20 AM - 12:50 PM',
    room: 'SAC 502',
    roomCap: ROOM_FIRE_CODE_CAPS['SAC 502'],
    capacity: 40,
    enrolled: 28,
    waitlisted: 0,
    prerequisites: ['CSE 215'],
    examSlot: '2025-05-10T09:00:00Z'
  },
  {
    id: 'CSE327-02',
    courseCode: 'CSE 327',
    courseTitle: 'Software Engineering',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '02',
    faculty: 'Dr. Silvia Ahmed',
    instructorId: 'silvia.ahmed',
    days: 'MW',
    timeSlot: '09:40 AM - 11:10 AM',
    room: 'NAC 408',
    roomCap: ROOM_FIRE_CODE_CAPS['NAC 408'],
    capacity: 40,
    enrolled: 36,
    waitlisted: 0,
    prerequisites: ['CSE 215'],
    examSlot: '2025-05-10T09:00:00Z'
  },
  {
    id: 'CSE327-03',
    courseCode: 'CSE 327',
    courseTitle: 'Software Engineering',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '03',
    faculty: 'Prof. Dr. Rajesh Palit',
    instructorId: 'rajesh.palit',
    days: 'ST',
    timeSlot: '01:20 PM - 02:50 PM',
    room: 'SAC 415',
    roomCap: ROOM_FIRE_CODE_CAPS['SAC 415'],
    capacity: 40,
    enrolled: 40,
    waitlisted: 14,
    prerequisites: ['CSE 215'],
    examSlot: '2025-05-10T09:00:00Z'
  },
  {
    id: 'CSE327-04',
    courseCode: 'CSE 327',
    courseTitle: 'Software Engineering',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '04',
    faculty: 'Mr. Tanvir Rahman',
    instructorId: 'tanvir.rahman',
    days: 'RA',
    timeSlot: '04:20 PM - 05:50 PM',
    room: 'LIB 602',
    roomCap: ROOM_FIRE_CODE_CAPS['LIB 602'],
    capacity: 40,
    enrolled: 21,
    waitlisted: 0,
    prerequisites: ['CSE 215'],
    examSlot: '2025-05-10T09:00:00Z'
  },
  {
    id: 'CSE311-03',
    courseCode: 'CSE 311',
    courseTitle: 'Database Systems',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '03',
    faculty: 'Dr. Tanjila Farah',
    instructorId: 'tanjila.farah',
    days: 'MW',
    timeSlot: '09:40 AM - 11:10 AM',
    room: 'NAC 408',
    roomCap: ROOM_FIRE_CODE_CAPS['NAC 408'],
    capacity: 40,
    enrolled: 37,
    waitlisted: 0,
    prerequisites: ['CSE 215'],
    examSlot: '2025-05-11T14:00:00Z'
  },
  {
    id: 'CSE311L-02',
    courseCode: 'CSE 311L',
    courseTitle: 'Database Lab',
    department: 'ECE / CSE',
    credits: 1.0,
    sectionNumber: '02',
    faculty: 'Mr. Safayat Hossain',
    instructorId: 'safayat.hossain',
    days: 'Thu',
    timeSlot: '09:40 AM - 12:40 PM',
    room: 'LIB 608',
    roomCap: ROOM_FIRE_CODE_CAPS['LIB 608'],
    capacity: 35,
    enrolled: 27,
    waitlisted: 0,
    prerequisites: ['CSE 215'],
    isLab: true,
    examSlot: '2025-05-13T09:00:00Z'
  },
  {
    id: 'MAT361-04',
    courseCode: 'MAT 361',
    courseTitle: 'Probability & Statistics',
    department: 'Math & Physics',
    credits: 3.0,
    sectionNumber: '04',
    faculty: 'Dr. Hasina Akter',
    instructorId: 'hasina.akter',
    days: 'ST',
    timeSlot: '01:20 PM - 02:50 PM',
    room: 'NAC 510',
    roomCap: ROOM_FIRE_CODE_CAPS['NAC 510'],
    capacity: 40,
    enrolled: 18,
    waitlisted: 0,
    prerequisites: ['MAT 120'],
    examSlot: '2025-05-14T09:00:00Z'
  },
  {
    id: 'CSE331-01',
    courseCode: 'CSE 331',
    courseTitle: 'Microprocessor Systems',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '01',
    faculty: 'Prof. Dr. Rajesh Palit',
    instructorId: 'rajesh.palit',
    days: 'MW',
    timeSlot: '01:20 PM - 02:50 PM',
    room: 'SAC 415',
    roomCap: ROOM_FIRE_CODE_CAPS['SAC 415'],
    capacity: 40,
    enrolled: 35,
    waitlisted: 0,
    prerequisites: ['CSE 231'],
    examSlot: '2025-05-10T14:00:00Z'
  },
  {
    id: 'CSE425-01',
    courseCode: 'CSE 425',
    courseTitle: 'Concepts of Programming Languages',
    department: 'ECE / CSE',
    credits: 3.0,
    sectionNumber: '01',
    faculty: 'Dr. Nova Ahmed',
    instructorId: 'nova.ahmed',
    days: 'MW',
    timeSlot: '02:40 PM - 04:10 PM',
    room: 'LIB 602',
    roomCap: ROOM_FIRE_CODE_CAPS['LIB 602'],
    capacity: 40,
    enrolled: 40,
    waitlisted: 10,
    minCreditsRequired: 100,
    prerequisites: ['CSE 215', 'CSE 311'],
    examSlot: '2025-05-10T19:00:00Z'
  }
];

export const INITIAL_STAGED_IDS: string[] = [
  'CSE327-01',
  'CSE311-03',
  'CSE311L-02',
  'MAT361-04'
];

export const INITIAL_EXCEPTIONS: ExceptionCase[] = [
  {
    id: 'CASE #EX-2025-0841',
    studentId: '2412159042',
    studentName: 'Rahim Ahmed',
    program: 'B.Sc CSE',
    standing: 'Senior Standing',
    cgpa: 3.64,
    creditsCompleted: 96,
    courseCode: 'CSE 425',
    courseTitle: 'Concepts of Programming Languages',
    sectionNumber: '01',
    sectionId: 'CSE425-01',
    ruleCode: 'RULE-4.2',
    category: 'Credit Standing',
    submittedAt: 'Today, 09:14 AM',
    status: 'pending',
    statement:
      'I require CSE 425 this semester to complete my Systems Track capstone prerequisite chain before Fall 2025 graduation. I have completed all core programming courses with A grades.',
    auditChecks: [
      {
        rule: 'Prerequisite Audit: CSE 215',
        description: 'Passed with Grade A (Earned in Spring 2024)',
        passed: true,
        notes: 'Verified via SIS grade record'
      },
      {
        rule: 'Rule 4.2: Credit Standing (100+ Cr Required)',
        description: 'Student has earned 96/130 credits (Delta: -4 Cr)',
        passed: false,
        notes: 'Standing exception required for Senior Track'
      },
      {
        rule: 'CGPA Minimum Threshold (>= 3.00)',
        description: 'Current Cumulative GPA is 3.64',
        passed: true,
        notes: 'Honors list standing qualifies for discretionary waiver'
      },
      {
        rule: 'Seat Capacity Allocation',
        description: 'Section 01 is currently 40/40 (Waitlist Queue Pos #1)',
        passed: true,
        notes: 'Instructor +1 override permitted under Rule 8.4'
      },
      {
        rule: 'Timetable Conflict Audit',
        description: 'MW 02:40 PM - 04:10 PM does not clash with draft plan',
        passed: true,
        notes: '0 timetable conflicts detected'
      },
      {
        rule: 'Senior Priority Allocation',
        description: 'Student is within 34 credits of graduation',
        passed: true,
        notes: 'Degree milestone verified by registrar'
      }
    ]
  },
  {
    id: 'CASE #EX-2025-0839',
    studentId: '2321450042',
    studentName: 'Fariha Tasnim',
    program: 'B.Sc CSE',
    standing: 'Junior Standing',
    cgpa: 3.42,
    creditsCompleted: 68,
    courseCode: 'CSE 327',
    courseTitle: 'Software Engineering',
    sectionNumber: '03',
    sectionId: 'CSE327-03',
    ruleCode: 'RULE-8.4',
    category: 'Capacity',
    submittedAt: 'Today, 08:42 AM',
    status: 'pending',
    statement: 'Section 03 fits my thesis scheduling window with Prof. Rajesh Palit.',
    auditChecks: [
      { rule: 'Prerequisite Audit: CSE 215', description: 'Passed with B+', passed: true, notes: 'SIS OK' },
      { rule: 'Seat Capacity', description: 'Full 40/40', passed: false, notes: 'Waitlist position #3' }
    ]
  },
  {
    id: 'CASE #EX-2025-0835',
    studentId: '2211290042',
    studentName: 'Tanveer Hasan',
    program: 'B.Sc CSE',
    standing: 'Senior Standing',
    cgpa: 3.81,
    creditsCompleted: 112,
    courseCode: 'CSE 331',
    courseTitle: 'Microprocessor Systems',
    sectionNumber: '01',
    sectionId: 'CSE331-01',
    ruleCode: 'RULE-2.1',
    category: 'Prereqs',
    submittedAt: 'Today, 08:15 AM',
    status: 'pending',
    statement: 'Graduating senior needs concurrent registration with CSE 231 lab.',
    auditChecks: [
      { rule: 'Graduation Verification', description: 'Eligible for degree', passed: true, notes: 'Verified' },
      { rule: 'Prerequisite Co-Registration', description: 'Rule 2.1 waiver', passed: true, notes: 'Waiver active' }
    ]
  }
];

export const INITIAL_BYPASS_RULES: BypassRule[] = [
  {
    id: 'rule-4-2',
    code: 'RULE-4.2',
    title: 'Senior Standing Credit Floor Exception',
    description: 'Allows students with >= 94 credits to register for 400-level courses with advisor consent.',
    category: 'Standing',
    enabled: true,
    lastUpdated: 'Spring 2025 Regular Senate'
  },
  {
    id: 'rule-2-1',
    code: 'RULE-2.1',
    title: 'Prerequisite Co-Registration Exemption',
    description: 'Permits concurrent enrollment in theory and pre-requisite lab during terminal semesters.',
    category: 'Prerequisite',
    enabled: true,
    lastUpdated: 'ECE Academic Council 2024'
  },
  {
    id: 'rule-6-3',
    code: 'RULE-6.3',
    title: 'Consecutive Exam Load Rebalancer',
    description: 'Prevents automated placement if student has 3 consecutive final exams in 24 hours.',
    category: 'Exam Load',
    enabled: false,
    lastUpdated: 'Suspended for Phase 2 Add/Drop'
  },
  {
    id: 'rule-8-4',
    code: 'RULE-8.4',
    title: 'Department Head +10 Seat Override',
    description: 'Authorizes departmental expansion up to physical room fire code limits (LIB 602 max 55).',
    category: 'Capacity',
    enabled: true,
    lastUpdated: 'Office of Registrar Directives'
  }
];

export const INITIAL_AUDIT_LOG: AuditLogItem[] = [
  {
    id: 'log-1',
    timestamp: '10:14:02 AM',
    actor: 'Dr. Nova Ahmed',
    action: 'Advising Clearance Granted',
    details: 'Student Rahim Ahmed (2412159042) cleared for Phase 2 registration window.',
    badgeType: 'emerald'
  },
  {
    id: 'log-2',
    timestamp: '09:45:18 AM',
    actor: 'Automated Rule Engine',
    action: 'Standing Rule Verified',
    details: 'CASE #EX-2025-0841 flagged for advisor sign-off under Rule 4.2.',
    badgeType: 'amber'
  },
  {
    id: 'log-3',
    timestamp: '09:22:40 AM',
    actor: 'IT Operations Node 04',
    action: 'PostgreSQL Pool Rebalanced',
    details: 'Auto-scaled active backend connection pool to 200 slots.',
    badgeType: 'teal'
  }
];

export const INITIAL_METRICS: AdminMetrics = {
  requestsPerSec: 1842,
  p95LatencyMs: 218,
  slaCeilingMs: 200,
  errorRate: 0.08,
  poolUsed: 156,
  poolTotal: 200,
  apiNodes: 6,
  surgeSpikeActive: false,
  lastScalingEvent: 'Initial deployment steady-state'
};

export const INITIAL_ESCALATIONS: EscalationItem[] = [
  {
    id: '#ESC-9481',
    courseCode: 'CSE 327',
    courseTitle: 'Software Engineering',
    enrolled: 125,
    totalCapacity: 160,
    waitlisted: 42,
    deficit: 42,
    severity: 'SEV-1',
    status: 'Open',
    demandSurge: [
      { time: '08:00', requests: 420 },
      { time: '08:30', requests: 890 },
      { time: '09:00', requests: 1450 },
      { time: '09:30', requests: 1842 },
      { time: '10:00', requests: 2180 }
    ],
    breakdown: [
      { major: 'B.Sc CSE (Regular)', count: 28, percentage: 66 },
      { major: 'B.Sc CS (Dual Major)', count: 9, percentage: 22 },
      { major: 'B.Sc EEE / ETE', count: 5, percentage: 12 }
    ]
  },
  {
    id: '#ESC-9482',
    courseCode: 'CSE 425',
    courseTitle: 'Concepts of Programming Languages',
    enrolled: 40,
    totalCapacity: 40,
    waitlisted: 38,
    deficit: 38,
    severity: 'SEV-1',
    status: 'Open',
    demandSurge: [
      { time: '08:00', requests: 310 },
      { time: '08:30', requests: 620 },
      { time: '09:00', requests: 940 },
      { time: '09:30', requests: 1220 },
      { time: '10:00', requests: 1540 }
    ],
    breakdown: [
      { major: 'B.Sc CSE (Graduating Senior)', count: 32, percentage: 84 },
      { major: 'B.Sc CSE (Junior)', count: 6, percentage: 16 }
    ]
  }
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-seed-1',
    studentId: '2412159042',
    channel: 'IN_APP',
    eventType: 'ENROLLMENT_CONFIRMED',
    title: 'Phase 2 Advising Clearance Ready',
    message: 'Dr. Nova Ahmed cleared your Phase 2 advising slot (#NSU-241215-9042).',
    status: 'sent',
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    read: false
  }
];

export const INITIAL_WAITLIST: WaitlistEntry[] = [
  {
    id: 'wl-seed-1',
    studentId: '2321450042',
    sectionId: 'CSE327-03',
    courseCode: 'CSE 327',
    position: 14,
    createdAt: new Date(Date.now() - 7200_000).toISOString(),
    status: 'waiting'
  },
  {
    id: 'wl-seed-2',
    studentId: '2211290042',
    sectionId: 'CSE425-01',
    courseCode: 'CSE 425',
    position: 10,
    createdAt: new Date(Date.now() - 5400_000).toISOString(),
    status: 'waiting'
  }
];

export const INITIAL_DAG_SUMMARY: DagSummary = {
  eligibleCourses: ['CSE 311', 'CSE 311L', 'CSE 327', 'CSE 331'],
  blockedCourses: {
    'MAT 361': ['MAT 120'],
    'CSE 425': ['100+ Credits (96/100)']
  },
  criticalPath: ['CSE 115', 'CSE 215', 'CSE 311', 'CSE 425'],
  hasCycle: false,
  topologicalOrder: [
    'CSE 115',
    'MAT 120',
    'CSE 215',
    'CSE 231',
    'CSE 311',
    'CSE 311L',
    'CSE 327',
    'CSE 331',
    'MAT 361',
    'CSE 425'
  ],
  nodes: [
    {
      code: 'CSE 327',
      title: 'Software Engineering',
      credits: 3.0,
      prerequisites: ['CSE 215'],
      eligible: true,
      cleared: false,
      missingPrerequisites: []
    },
    {
      code: 'CSE 311',
      title: 'Database Systems',
      credits: 3.0,
      prerequisites: ['CSE 215'],
      eligible: true,
      cleared: true,
      missingPrerequisites: []
    },
    {
      code: 'CSE 311L',
      title: 'Database Lab',
      credits: 1.0,
      prerequisites: ['CSE 215'],
      eligible: true,
      cleared: false,
      missingPrerequisites: []
    },
    {
      code: 'CSE 331',
      title: 'Microprocessor Systems',
      credits: 3.0,
      prerequisites: ['CSE 231'],
      eligible: true,
      cleared: false,
      missingPrerequisites: []
    },
    {
      code: 'MAT 361',
      title: 'Probability & Statistics',
      credits: 3.0,
      prerequisites: ['MAT 120'],
      eligible: false,
      cleared: false,
      missingPrerequisites: ['MAT 120']
    },
    {
      code: 'CSE 425',
      title: 'Concepts of Programming Languages',
      credits: 3.0,
      prerequisites: ['CSE 215', 'CSE 311'],
      eligible: false,
      cleared: false,
      missingPrerequisites: []
    }
  ]
};

// ================= CONTEXT TYPES =================

export type ActiveModalType =
  | 'rule_alert'
  | 'section_full'
  | 'capacity_expand'
  | 'receipt'
  | 'emergency_section'
  | 'rds_fallback'
  | null;

export interface ActionResult<T = unknown> {
  ok: boolean;
  status: number;
  message?: string;
  modal?: Exclude<ActiveModalType, null>;
  payload?: any;
  data?: T;
}

interface SmartAdvisorContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  authUser: AuthUser | null;
  authToken: string | null;
  authHydrated: boolean;
  isAuthenticated: boolean;
  authLoading: boolean;
  wsConnected: boolean;
  sseConnected: boolean;
  isSyncing: boolean;
  lastError: string | null;
  clearError: () => void;

  student: StudentProfile;
  sections: CourseSection[];
  stagedSectionIds: string[];
  exceptions: ExceptionCase[];
  bypassRules: BypassRule[];
  auditLog: AuditLogItem[];
  metrics: AdminMetrics;
  escalations: EscalationItem[];
  receipt: ScheduleReceipt | null;
  notifications: NotificationItem[];
  waitlistSectionIds: string[];
  waitlistEntries: WaitlistEntry[];
  dagSummary: DagSummary;
  rdsFallbackPrompt: RdsFallbackPrompt | null;
  healthCheck: HealthCheckResult | null;
  telemetryHistory: TelemetryPoint[];

  activeModal: ActiveModalType;
  modalPayload: any;
  openModal: (modal: Exclude<ActiveModalType, null>, payload?: any) => void;
  closeModal: () => void;

  // Auth Actions
  login: (
    id: string,
    password: string,
    targetRole?: UserRole,
    rememberMe?: boolean
  ) => Promise<ActionResult<{ user: AuthUser; token: string }>>;
  logout: () => Promise<void>;
  switchDemoRole: (targetRole: UserRole) => Promise<ActionResult<{ user: AuthUser; token: string }>>;
  refreshBootstrap: () => Promise<void>;

  // Student Actions
  stageSection: (sectionId: string) => Promise<boolean>;
  unstageSection: (sectionId: string) => Promise<void>;
  confirmSchedule: (options?: { simulateRdsFailure?: boolean }) => Promise<ActionResult<{ receipt: ScheduleReceipt | null; fallbackPrompt?: RdsFallbackPrompt }>>;
  submitPetition: (input: {
    sectionId?: string;
    courseCode: string;
    ruleCode: string;
    reason: string;
  }) => Promise<ActionResult<{ exceptionCase: ExceptionCase }>>;
  joinWaitlist: (sectionId: string) => Promise<ActionResult<{ position: number; entry?: WaitlistEntry }>>;
  solveSchedule: (req: SolveScheduleRequest) => Promise<SolveScheduleResult | null>;
  applySolvedSchedule: (req: SolveScheduleRequest) => Promise<SolveScheduleResult | null>;
  fetchDagEligible: () => Promise<DagSummary | null>;
  resolveRdsFallback: (failedSectionId: string, fallbackSectionId: string) => Promise<ActionResult<{ receipt: ScheduleReceipt | null }>>;
  markNotificationRead: (notificationId?: string) => void;

  // Faculty Actions
  approveException: (caseId: string) => Promise<ActionResult>;
  rejectException: (caseId: string) => Promise<ActionResult>;
  flagException: (caseId: string) => Promise<ActionResult>;
  expandCapacity: (sectionId: string, delta: number) => Promise<ActionResult>;
  createBypassRule: (input: {
    code: string;
    title: string;
    description: string;
    category: BypassRule['category'];
    enabled: boolean;
  }) => Promise<ActionResult<{ rule: BypassRule; autoApprovedCount: number }>>;
  toggleBypassRule: (ruleId: string) => Promise<ActionResult<{ autoApprovedCount?: number }>>;

  // Admin Actions
  autoScaleApiNodes: () => Promise<ActionResult>;
  acknowledgeIncident: () => Promise<ActionResult>;
  allocateEmergencySection: (courseCode: string, sectionData: Partial<CourseSection>) => Promise<ActionResult>;
  addSeatsToAllSections: (courseCode: string, count: number) => Promise<ActionResult>;
  syncRds4: () => Promise<ActionResult>;
  fetchHealth: () => Promise<HealthCheckResult | null>;

  // Demo Controls
  simulateSurgeSpike: () => Promise<void>;
  simulateSectionFull: (sectionId: string) => Promise<void>;
  resetDemoState: () => Promise<void>;
  demoResetVersion: number;

  // Helpers
  stagedSections: CourseSection[];
  totalCredits: number;
  clashes: ScheduleClash[];
}

const SmartAdvisorContext = createContext<SmartAdvisorContextType | null>(null);

const STORAGE_KEY = 'smartadvisor_store_v1';
const AUTH_SESSION_KEY = 'smartadvisor_auth_session_v1';
const SYNC_CHANNEL = 'smartadvisor-sync';
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
export const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, '');
const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || `${API_ORIGIN.replace(/^http/i, 'ws')}/ws`;

function formatTimePoint(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function buildInitialTelemetryHistory(metrics: AdminMetrics): TelemetryPoint[] {
  const now = Date.now();
  return [
    { time: formatTimePoint(new Date(now - 240_000)), rps: 1120, latency: 145 },
    { time: formatTimePoint(new Date(now - 180_000)), rps: 1340, latency: 162 },
    { time: formatTimePoint(new Date(now - 120_000)), rps: 1560, latency: 180 },
    { time: formatTimePoint(new Date(now - 60_000)), rps: 1720, latency: 198 },
    { time: formatTimePoint(new Date(now)), rps: metrics.requestsPerSec, latency: metrics.p95LatencyMs }
  ];
}

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function SmartAdvisorProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>('student');
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authHydrated, setAuthHydrated] = useState<boolean>(false);
  const authTokenRef = useRef<string | null>(null);
  const roleRef = useRef<UserRole>('student');
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const [student, setStudent] = useState<StudentProfile>(INITIAL_STUDENT);
  const [sections, setSections] = useState<CourseSection[]>(INITIAL_SECTIONS);
  const [stagedSectionIds, setStagedSectionIds] = useState<string[]>(INITIAL_STAGED_IDS);
  const stagedSectionIdsRef = useRef<string[]>(INITIAL_STAGED_IDS);
  const [exceptions, setExceptions] = useState<ExceptionCase[]>(INITIAL_EXCEPTIONS);
  const [bypassRules, setBypassRules] = useState<BypassRule[]>(INITIAL_BYPASS_RULES);
  const [auditLog, setAuditLog] = useState<AuditLogItem[]>(INITIAL_AUDIT_LOG);
  const [metrics, setMetrics] = useState<AdminMetrics>(INITIAL_METRICS);
  const [escalations, setEscalations] = useState<EscalationItem[]>(INITIAL_ESCALATIONS);
  const [receipt, setReceipt] = useState<ScheduleReceipt | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [waitlistSectionIds, setWaitlistSectionIds] = useState<string[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>(INITIAL_WAITLIST);
  const [dagSummary, setDagSummary] = useState<DagSummary>(INITIAL_DAG_SUMMARY);
  const dagSummaryRef = useRef<DagSummary>(INITIAL_DAG_SUMMARY);
  const [rdsFallbackPrompt, setRdsFallbackPrompt] = useState<RdsFallbackPrompt | null>(null);
  const [healthCheck, setHealthCheck] = useState<HealthCheckResult | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>(() =>
    buildInitialTelemetryHistory(INITIAL_METRICS)
  );

  const [activeModal, setActiveModal] = useState<ActiveModalType>(null);
  const [modalPayload, setModalPayload] = useState<any>(null);
  const [demoResetVersion, setDemoResetVersion] = useState<number>(0);
  const activeModalRef = useRef<ActiveModalType>(null);
  const modalPayloadRef = useRef<any>(null);

  const updateStagedSectionIds = useCallback((nextIds: string[]) => {
    stagedSectionIdsRef.current = nextIds;
    setStagedSectionIds(nextIds);
  }, []);

  const updateRole = useCallback((nextRole: UserRole) => {
    roleRef.current = nextRole;
    setRole(nextRole);
  }, []);

  const clearError = useCallback(() => setLastError(null), []);

  const openModal = useCallback((modal: Exclude<ActiveModalType, null>, payload: any = null) => {
    activeModalRef.current = modal;
    modalPayloadRef.current = payload;
    setActiveModal(modal);
    setModalPayload(payload);
  }, []);

  const closeModal = useCallback(() => {
    activeModalRef.current = null;
    modalPayloadRef.current = null;
    setActiveModal(null);
    setModalPayload(null);
  }, []);

  const persistTabSession = useCallback(
    (token: string | null, user: AuthUser | null, rememberMe?: boolean) => {
      authTokenRef.current = token;
      setAuthToken(token);
      setAuthUser(user);
      if (user) {
        roleRef.current = user.role;
        setRole(user.role);
      }
      if (typeof window !== 'undefined') {
        try {
          if (token && user) {
            const serialized = JSON.stringify({ token, user });
            window.sessionStorage.setItem(AUTH_SESSION_KEY, serialized);
            if (rememberMe === true) {
              window.localStorage.setItem(AUTH_SESSION_KEY, serialized);
            } else if (rememberMe === false) {
              window.localStorage.removeItem(AUTH_SESSION_KEY);
            } else if (window.localStorage.getItem(AUTH_SESSION_KEY)) {
              window.localStorage.setItem(AUTH_SESSION_KEY, serialized);
            }
          } else {
            window.sessionStorage.removeItem(AUTH_SESSION_KEY);
            window.localStorage.removeItem(AUTH_SESSION_KEY);
          }
        } catch {
          // Ignore storage quota / security errors
        }
      }
    },
    []
  );

  const appendTelemetryPoint = useCallback((nextMetrics: AdminMetrics) => {
    setTelemetryHistory((prev) => {
      const last = prev[prev.length - 1];
      const nextPt: TelemetryPoint = {
        time: formatTimePoint(new Date()),
        rps: nextMetrics.requestsPerSec,
        latency: nextMetrics.p95LatencyMs
      };
      if (last && last.rps === nextPt.rps && last.latency === nextPt.latency) {
        return prev;
      }
      return [...prev.slice(-11), nextPt];
    });
  }, []);

  const applyIncomingState = useCallback(
    (s: Partial<BackendState> | null | undefined) => {
      if (!s) return;
      if (s.sections) setSections(s.sections);
      if (s.stagedSectionIds) updateStagedSectionIds(s.stagedSectionIds);
      if (s.exceptions) setExceptions(s.exceptions);
      if (s.bypassRules) setBypassRules(s.bypassRules);
      if (s.auditLog) setAuditLog(s.auditLog);
      if (s.metrics) {
        setMetrics(s.metrics);
        appendTelemetryPoint(s.metrics);
      }
      if (s.escalations) setEscalations(s.escalations);
      if (s.student) setStudent(s.student);
      if (s.receipt !== undefined) setReceipt(s.receipt);
      if (s.notifications) setNotifications(s.notifications);
      if (s.waitlistSectionIds) setWaitlistSectionIds(s.waitlistSectionIds);
      if (s.waitlistEntries) setWaitlistEntries(s.waitlistEntries);
      if (s.dagSummary) {
        dagSummaryRef.current = s.dagSummary;
        setDagSummary(s.dagSummary);
      }
      if (s.rdsFallbackPrompt !== undefined) setRdsFallbackPrompt(s.rdsFallbackPrompt);
    },
    [appendTelemetryPoint, updateStagedSectionIds]
  );

  // Broadcast domain state changes across tabs (never overwrites per-tab JWT/role)
  const broadcastState = useCallback((stateToBroadcast: Partial<BackendState>) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToBroadcast));
        if ('BroadcastChannel' in window) {
          const bc = new BroadcastChannel(SYNC_CHANNEL);
          bc.postMessage({ type: 'SYNC_UPDATE', state: stateToBroadcast, timestamp: Date.now() });
          bc.close();
        }
      }
    } catch {
      // Ignore storage / channel errors
    }
  }, []);

  const buildSnapshotState = useCallback(
    (overrides: Partial<BackendState> = {}): BackendState => ({
      student,
      sections,
      stagedSectionIds: stagedSectionIdsRef.current,
      exceptions,
      bypassRules,
      auditLog,
      metrics,
      escalations,
      receipt,
      notifications,
      waitlistSectionIds,
      waitlistEntries,
      dagSummary: dagSummaryRef.current,
      rdsFallbackPrompt,
      ...overrides
    }),
    [
      student,
      sections,
      exceptions,
      bypassRules,
      auditLog,
      metrics,
      escalations,
      receipt,
      notifications,
      waitlistSectionIds,
      waitlistEntries,
      rdsFallbackPrompt
    ]
  );

  // Awaited API fetch with JWT attachment & structured response/error handling
  const apiFetch = useCallback(
    async <T = any>(
      path: string,
      options: RequestInit & { tokenOverride?: string | null; skipAuthClear?: boolean } = {}
    ): Promise<{
      networkError: boolean;
      ok: boolean;
      status: number;
      data: T | null;
      message?: string;
    }> => {
      if (typeof window === 'undefined') {
        return { networkError: true, ok: false, status: 0, data: null };
      }

      const token =
        options.tokenOverride !== undefined ? options.tokenOverride : authTokenRef.current;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined)
      };
      const usedToken = Boolean(token && token !== 'offline-demo-token');
      if (usedToken) {
        headers.Authorization = `Bearer ${token}`;
      }

      setIsSyncing(true);
      try {
        const res = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers
        });

        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        if (res.status === 401 && !options.skipAuthClear && usedToken) {
          persistTabSession(null, null);
        }

        const message =
          data?.message || (!res.ok ? `Request failed (${res.status})` : undefined);

        if (!res.ok && message && !data?.modal) {
          setLastError(message);
        } else if (res.ok) {
          setLastError(null);
        }

        if (res.ok && data?.state) {
          const mergedState =
            data.receipt && data.state.receipt == null
              ? { ...data.state, receipt: data.receipt }
              : data.state;
          applyIncomingState(mergedState);
          broadcastState(mergedState);
        }

        return {
          networkError: false,
          ok: res.ok,
          status: res.status,
          data,
          message
        };
      } catch {
        return {
          networkError: true,
          ok: false,
          status: 0,
          data: null,
          message: 'API unreachable (offline fallback active)'
        };
      } finally {
        setIsSyncing(false);
      }
    },
    [applyIncomingState, broadcastState, persistTabSession]
  );

  const refreshBootstrap = useCallback(
    async (tokenOverride?: string | null) => {
      const res = await apiFetch<BackendState>('/bootstrap', {
        method: 'GET',
        tokenOverride,
        skipAuthClear: true
      });
      if (!res.networkError && res.ok && res.data) {
        applyIncomingState(res.data);
      }
    },
    [apiFetch, applyIncomingState]
  );

  const fetchHealth = useCallback(async (): Promise<HealthCheckResult | null> => {
    if (typeof window === 'undefined') return null;
    try {
      const res = await fetch(`${API_ORIGIN}/health`, { cache: 'no-store' });
      const data = (await res.json()) as HealthCheckResult;
      if (data && typeof data.status === 'string') {
        setHealthCheck(data);
        return data;
      }
      return null;
    } catch {
      const degraded: HealthCheckResult = {
        status: 'degraded',
        service: 'smartadvisor-api',
        mode: 'memory',
        checks: {
          api: { status: 'down', details: 'API endpoint unreachable' },
          postgres: { status: 'down', details: 'Unreachable' },
          redis: { status: 'down', details: 'Unreachable' }
        },
        timestamp: new Date().toISOString()
      };
      setHealthCheck(degraded);
      return degraded;
    }
  }, []);

  // Synchronously hydrate per-tab auth & cached state before child useEffects run
  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const rawSession =
        window.sessionStorage.getItem(AUTH_SESSION_KEY) ??
        window.localStorage.getItem(AUTH_SESSION_KEY);
      if (rawSession) {
        const parsed = JSON.parse(rawSession) as { token?: string; user?: AuthUser };
        if (parsed?.token && parsed?.user) {
          persistTabSession(parsed.token, parsed.user);
        }
      }
    } catch {
      // Ignore corrupt sessionStorage
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        applyIncomingState(JSON.parse(saved));
      }
    } catch {
      // Ignore corrupt localStorage
    }

    setAuthHydrated(true);
  }, [applyIncomingState, persistTabSession]);

  // Verify stored JWT, bootstrap, SSE, WebSocket, BroadcastChannel & online recovery
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initialToken = authTokenRef.current;

    // Verify stored JWT with /api/v1/auth/me
    if (initialToken && initialToken !== 'offline-demo-token') {
      fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${initialToken}` }
      })
        .then(async (res) => {
          if (res.status === 401) {
            persistTabSession(null, null);
            return;
          }
          if (res.ok) {
            const payload = await res.json();
            if (payload?.user) {
              persistTabSession(initialToken, payload.user);
            }
          }
        })
        .catch(() => null);
    }

    void refreshBootstrap(initialToken);

    let disposed = false;
    let eventSource: EventSource | null = null;
    let ws: WebSocket | null = null;
    let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let sseAttempt = 0;
    let wsAttempt = 0;

    const isBrowserOffline = () =>
      typeof navigator !== 'undefined' && navigator.onLine === false;

    const handleRealtimeEvent = (raw: string) => {
      if (disposed || isBrowserOffline()) return;
      try {
        const data = JSON.parse(raw);
        if (data?.state) {
          applyIncomingState(data.state);
        }
        if (data?.type === 'RDS_FALLBACK') {
          const prompt: RdsFallbackPrompt | undefined =
            data.payload ?? data.state?.rdsFallbackPrompt;
          if (prompt) {
            setRdsFallbackPrompt(prompt);
            if (!prompt.resolved && roleRef.current === 'student') {
              const alreadyOpen =
                activeModalRef.current === 'rds_fallback' &&
                modalPayloadRef.current?.id === prompt.id;
              if (!alreadyOpen) {
                openModal('rds_fallback', prompt);
              }
            }
          }
        }
        if (data?.type === 'NOTIFICATION' && data?.payload) {
          const incoming = data.payload as NotificationItem;
          setNotifications((prev) =>
            prev.some((n) => n.id === incoming.id) ? prev : [incoming, ...prev]
          );
        }
      } catch {
        // Ignore ping/non-JSON frames
      }
    };

    const connectSse = () => {
      if (disposed || isBrowserOffline() || typeof EventSource === 'undefined') return;
      try {
        eventSource = new EventSource(`${API_BASE}/events`);
        eventSource.onopen = () => {
          if (disposed || isBrowserOffline()) {
            eventSource?.close();
            eventSource = null;
            setSseConnected(false);
            return;
          }
          const wasReconnect = sseAttempt > 0;
          sseAttempt = 0;
          setSseConnected(true);
          if (wasReconnect) {
            void refreshBootstrap();
          }
        };
        eventSource.onmessage = (event) => handleRealtimeEvent(event.data);
        eventSource.onerror = () => {
          setSseConnected(false);
          eventSource?.close();
          eventSource = null;
          if (!disposed && !isBrowserOffline()) {
            const delay = Math.min(15000, 1000 * Math.pow(2, sseAttempt));
            sseAttempt += 1;
            sseReconnectTimer = setTimeout(connectSse, delay);
          }
        };
      } catch {
        setSseConnected(false);
      }
    };

    const connectWs = () => {
      if (disposed || isBrowserOffline() || typeof WebSocket === 'undefined') return;
      try {
        ws = new WebSocket(WS_URL);
        ws.onopen = () => {
          if (disposed || isBrowserOffline()) {
            ws?.close();
            ws = null;
            setWsConnected(false);
            return;
          }
          const wasReconnect = wsAttempt > 0;
          wsAttempt = 0;
          setWsConnected(true);
          if (wasReconnect) {
            void refreshBootstrap();
          }
        };
        ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            handleRealtimeEvent(event.data);
          }
        };
        ws.onclose = () => {
          setWsConnected(false);
          ws = null;
          if (!disposed && !isBrowserOffline()) {
            const delay = Math.min(15000, 1000 * Math.pow(2, wsAttempt));
            wsAttempt += 1;
            wsReconnectTimer = setTimeout(connectWs, delay);
          }
        };
        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectSse();
    connectWs();

    let channel: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel(SYNC_CHANNEL);
      channel.onmessage = (event) => {
        if (disposed || isBrowserOffline()) return;
        if (event.data?.type === 'SYNC_UPDATE' && event.data?.state) {
          applyIncomingState(event.data.state);
        }
      };
    }

    const handleStorage = (e: StorageEvent) => {
      if (disposed || isBrowserOffline()) return;
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          applyIncomingState(JSON.parse(e.newValue));
        } catch {
          // ignore
        }
      }
    };

    const handleOffline = () => {
      if (disposed) return;
      if (sseReconnectTimer) {
        clearTimeout(sseReconnectTimer);
        sseReconnectTimer = null;
      }
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
      setSseConnected(false);
      setWsConnected(false);
    };

    const handleOnline = () => {
      if (disposed || isBrowserOffline()) return;
      if (sseReconnectTimer) {
        clearTimeout(sseReconnectTimer);
        sseReconnectTimer = null;
      }
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
      sseAttempt = 0;
      wsAttempt = 0;
      const sseClosedState = typeof EventSource !== 'undefined' && EventSource.CLOSED !== undefined ? EventSource.CLOSED : 2;
      if (!eventSource || eventSource.readyState === sseClosedState) {
        connectSse();
      }
      const wsClosingState = typeof WebSocket !== 'undefined' && WebSocket.CLOSING !== undefined ? WebSocket.CLOSING : 2;
      const wsClosedState = typeof WebSocket !== 'undefined' && WebSocket.CLOSED !== undefined ? WebSocket.CLOSED : 3;
      if (!ws || ws.readyState === wsClosingState || ws.readyState === wsClosedState) {
        connectWs();
      }
      void refreshBootstrap();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      disposed = true;
      if (sseReconnectTimer) clearTimeout(sseReconnectTimer);
      if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
      if (channel) channel.close();
      if (eventSource) eventSource.close();
      if (ws) ws.close();
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [applyIncomingState, openModal, persistTabSession, refreshBootstrap]);

  // Derived: Staged Sections objects
  const stagedSections = useMemo(() => {
    return stagedSectionIds
      .map((id) => sections.find((s) => s.id === id))
      .filter((s): s is CourseSection => Boolean(s));
  }, [stagedSectionIds, sections]);

  // Derived: Total Credits
  const totalCredits = useMemo(() => {
    return stagedSections.reduce((acc, curr) => acc + curr.credits, 0);
  }, [stagedSections]);

  // Derived: Clashes (RA -> Thu/Sat + time interval overlap)
  const clashes = useMemo(() => {
    return detectScheduleClashes(stagedSections);
  }, [stagedSections]);

  // ================= AUTH ACTIONS =================

  const login = useCallback(
    async (
      id: string,
      password: string,
      targetRole?: UserRole,
      rememberMe: boolean = false
    ): Promise<ActionResult<{ user: AuthUser; token: string }>> => {
      setAuthLoading(true);
      setLastError(null);
      try {
        const res = await apiFetch<{ ok: boolean; token: string; user: AuthUser; message?: string }>(
          '/auth/login',
          {
            method: 'POST',
            body: JSON.stringify({ id: id.trim(), password, role: targetRole }),
            tokenOverride: null,
            skipAuthClear: true
          }
        );

        if (!res.networkError) {
          if (res.ok && res.data?.token && res.data?.user) {
            persistTabSession(res.data.token, res.data.user, rememberMe);
            await refreshBootstrap(res.data.token);
            return {
              ok: true,
              status: res.status,
              data: { user: res.data.user, token: res.data.token }
            };
          }
          const msg = res.message || 'Invalid NSU ID or password.';
          setLastError(msg);
          return { ok: false, status: res.status || 401, message: msg };
        }

        // Offline fallback when API is unreachable
        const offlineUser = OFFLINE_SEED_USERS[id.trim()];
        if (
          offlineUser &&
          password === DEMO_DEFAULT_PASSWORD &&
          (!targetRole || offlineUser.role === targetRole)
        ) {
          const fallbackToken = 'offline-demo-token';
          persistTabSession(fallbackToken, offlineUser, rememberMe);
          return {
            ok: true,
            status: 200,
            data: { user: offlineUser, token: fallbackToken }
          };
        }

        const msg = 'Invalid credentials or API server offline.';
        setLastError(msg);
        return { ok: false, status: 401, message: msg };
      } finally {
        setAuthLoading(false);
      }
    },
    [apiFetch, persistTabSession, refreshBootstrap]
  );

  const logout = useCallback(async () => {
    const token = authTokenRef.current;
    if (token && token !== 'offline-demo-token') {
      await apiFetch('/auth/logout', { method: 'POST', tokenOverride: token, skipAuthClear: true });
    }
    persistTabSession(null, null);
    setLastError(null);
  }, [apiFetch, persistTabSession]);

  const switchDemoRole = useCallback(
    async (targetRole: UserRole) => {
      const account = SEEDED_DEMO_ACCOUNTS[targetRole];
      return login(account.id, DEMO_DEFAULT_PASSWORD, targetRole);
    },
    [login]
  );

  // ================= STUDENT ACTIONS =================

  const stageSection = useCallback(
    async (sectionId: string): Promise<boolean> => {
      const res = await apiFetch<{ ok: boolean; state?: BackendState; modal?: any; payload?: any }>(
        '/student/cart/stage',
        {
          method: 'POST',
          body: JSON.stringify({ sectionId })
        }
      );

      if (!res.networkError) {
        if (res.ok) return true;
        if (res.data?.modal) {
          openModal(res.data.modal, res.data.payload);
        }
        return false;
      }

      // Offline guarded fallback
      const currentStaged = stagedSectionIdsRef.current;
      const targetSection = sections.find((s) => s.id === sectionId);
      if (!targetSection) return false;
      if (currentStaged.includes(sectionId)) return true;

      const normalizeCode = (c: string) => c.replace(/\s+/g, '').toUpperCase();
      const targetCourseNorm = normalizeCode(targetSection.courseCode);

      const hasCreditWaiver = exceptions.some(
        (ex) =>
          ex.status === 'approved' &&
          ex.studentId === student.id &&
          normalizeCode(ex.courseCode) === targetCourseNorm &&
          (ex.category === 'Credit Standing' || ex.ruleCode === 'RULE-4.2')
      );
      if (
        targetSection.minCreditsRequired &&
        student.creditsCompleted < targetSection.minCreditsRequired &&
        !hasCreditWaiver
      ) {
        openModal('rule_alert', {
          section: targetSection,
          studentCredits: student.creditsCompleted,
          requiredCredits: targetSection.minCreditsRequired,
          ruleCode: 'RULE-4.2'
        });
        return false;
      }

      // RULE-2.1 prerequisite check
      const isRule21BypassActive = bypassRules.some(
        (r) => (r.id === 'rule-2-1' || r.code === 'RULE-2.1') && r.enabled
      );
      const hasPrereqWaiver = exceptions.some(
        (ex) =>
          ex.status === 'approved' &&
          ex.studentId === student.id &&
          normalizeCode(ex.courseCode) === targetCourseNorm &&
          (ex.category === 'Prereqs' || ex.ruleCode === 'RULE-2.1')
      );
      if (!isRule21BypassActive && !hasPrereqWaiver) {
        const clearedSet = new Set(student.clearedCourses.map((c) => normalizeCode(c.code)));
        const missingMap = new Map<string, string>();
        for (const prereq of targetSection.prerequisites ?? []) {
          const key = normalizeCode(prereq);
          if (!clearedSet.has(key) && !missingMap.has(key)) {
            missingMap.set(key, prereq);
          }
        }
        const dagBlocked = dagSummaryRef.current.blockedCourses[targetSection.courseCode] ?? [];
        for (const prereq of dagBlocked) {
          if (/credits/i.test(prereq)) continue;
          const key = normalizeCode(prereq);
          if (!clearedSet.has(key) && !missingMap.has(key)) {
            missingMap.set(key, prereq);
          }
        }
        const missingPrerequisites = Array.from(missingMap.values());
        if (missingPrerequisites.length > 0) {
          openModal('rule_alert', {
            section: targetSection,
            ruleCode: 'RULE-2.1',
            missingPrerequisites
          });
          return false;
        }
      }

      // RULE-6.3 consecutive exam load check (3+ distinct courses within 24h)
      const isRule63Enforced = bypassRules.some(
        (r) => (r.id === 'rule-6-3' || r.code === 'RULE-6.3') && r.enabled
      );
      if (isRule63Enforced) {
        const proposedSections: CourseSection[] = [
          ...currentStaged
            .map((id) => sections.find((s) => s.id === id))
            .filter((s): s is CourseSection => Boolean(s))
            .filter((s) => normalizeCode(s.courseCode) !== targetCourseNorm),
          targetSection
        ];
        const uniqueByCourse = new Map<string, CourseSection>();
        for (const sec of proposedSections) {
          const key = normalizeCode(sec.courseCode);
          if (!uniqueByCourse.has(key)) {
            uniqueByCourse.set(key, sec);
          }
        }
        const resolveExamMs = (sec: CourseSection): number => {
          if (sec.examSlot) {
            const parsed = Date.parse(sec.examSlot);
            if (!Number.isNaN(parsed)) return parsed;
          }
          const dayOffsets: Record<string, number> = {
            ST: 0,
            Sun: 0,
            Tue: 0,
            MW: 1,
            Mon: 1,
            Wed: 1,
            RA: 2,
            Thu: 2,
            Sat: 2
          };
          const baseMs = Date.UTC(2025, 4, 10 + (dayOffsets[sec.days] ?? 3), 9, 0, 0);
          const range = parseTimeSlot(sec.timeSlot);
          return range ? baseMs + Math.max(0, range.startMin - 9 * 60) * 60_000 : baseMs;
        };
        const exams = Array.from(uniqueByCourse.values())
          .map((sec) => ({ section: sec, startMs: resolveExamMs(sec) }))
          .sort((a, b) => a.startMs - b.startMs);
        const WINDOW_MS = 24 * 60 * 60 * 1000;
        for (let i = 0; i <= exams.length - 3; i++) {
          if (exams[i + 2].startMs - exams[i].startMs <= WINDOW_MS) {
            openModal('rule_alert', {
              section: targetSection,
              ruleCode: 'RULE-6.3',
              conflictingSections: [exams[i].section, exams[i + 1].section, exams[i + 2].section]
            });
            return false;
          }
        }
      }

      if (targetSection.capacity - targetSection.enrolled <= 0) {
        const alternativeSections = sections.filter(
          (s) =>
            s.courseCode === targetSection.courseCode &&
            s.id !== targetSection.id &&
            s.capacity - s.enrolled > 0
        );
        openModal('section_full', {
          fullSection: targetSection,
          alternatives: alternativeSections
        });
        return false;
      }

      const filteredStagedIds = currentStaged.filter((id) => {
        const s = sections.find((sec) => sec.id === id);
        return s?.courseCode !== targetSection.courseCode;
      });

      const nextStagedIds = [...filteredStagedIds, sectionId];
      const logItem: AuditLogItem = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        actor: student.name,
        action: 'Section Staged',
        details: `Staged ${targetSection.courseCode} Sec ${targetSection.sectionNumber} (${targetSection.timeSlot})`,
        badgeType: 'teal'
      };
      const nextLog = [logItem, ...auditLog];
      updateStagedSectionIds(nextStagedIds);
      setAuditLog(nextLog);
      broadcastState(buildSnapshotState({ stagedSectionIds: nextStagedIds, auditLog: nextLog }));
      return true;
    },
    [
      apiFetch,
      auditLog,
      broadcastState,
      buildSnapshotState,
      bypassRules,
      exceptions,
      openModal,
      sections,
      student,
      updateStagedSectionIds
    ]
  );

  const unstageSection = useCallback(
    async (sectionId: string) => {
      const res = await apiFetch<{ ok: boolean; state?: BackendState }>(
        `/student/cart/${encodeURIComponent(sectionId)}`,
        { method: 'DELETE' }
      );
      if (!res.networkError) return;

      const nextStagedIds = stagedSectionIdsRef.current.filter((id) => id !== sectionId);
      const targetSection = sections.find((s) => s.id === sectionId);
      const logItem: AuditLogItem = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        actor: student.name,
        action: 'Section Removed',
        details: `Removed ${targetSection?.courseCode || sectionId} from draft plan.`,
        badgeType: 'amber'
      };
      const nextLog = [logItem, ...auditLog];
      updateStagedSectionIds(nextStagedIds);
      setAuditLog(nextLog);
      broadcastState(buildSnapshotState({ stagedSectionIds: nextStagedIds, auditLog: nextLog }));
    },
    [apiFetch, auditLog, broadcastState, buildSnapshotState, sections, student.name, updateStagedSectionIds]
  );

  const confirmSchedule = useCallback(
    async (
      options: { simulateRdsFailure?: boolean } = {}
    ): Promise<ActionResult<{ receipt: ScheduleReceipt | null; fallbackPrompt?: RdsFallbackPrompt }>> => {
      const res = await apiFetch<{
        ok: boolean;
        receipt?: ScheduleReceipt;
        state?: BackendState;
        fallbackPrompt?: RdsFallbackPrompt;
        message?: string;
      }>('/student/enroll/confirm', {
        method: 'POST',
        body: JSON.stringify({ simulateRdsFailure: Boolean(options.simulateRdsFailure) })
      });

      if (!res.networkError) {
        if (res.ok && res.data) {
          const prompt = res.data.fallbackPrompt ?? res.data.state?.rdsFallbackPrompt ?? null;
          if (prompt && !prompt.resolved) {
            setRdsFallbackPrompt(prompt);
            openModal('rds_fallback', prompt);
            return {
              ok: true,
              status: res.status,
              data: { receipt: res.data.receipt ?? null, fallbackPrompt: prompt }
            };
          }
          if (res.data.receipt) {
            setReceipt(res.data.receipt);
            openModal('receipt', res.data.receipt);
          }
          return {
            ok: true,
            status: res.status,
            data: { receipt: res.data.receipt ?? null }
          };
        }
        return { ok: false, status: res.status, message: res.message };
      }

      // Offline guarded fallback
      if (stagedSections.length === 0) {
        const msg = 'No sections staged for enrollment.';
        setLastError(msg);
        return { ok: false, status: 400, message: msg };
      }
      if (clashes.length > 0) {
        const msg = `Cannot confirm schedule with ${clashes.length} timetable clash(es).`;
        setLastError(msg);
        return { ok: false, status: 409, message: msg };
      }
      if (totalCredits > (student.maxCredits ?? 15)) {
        const msg = `Credit limit exceeded (${totalCredits.toFixed(1)} / ${(student.maxCredits ?? 15).toFixed(1)} Cr).`;
        setLastError(msg);
        return { ok: false, status: 409, message: msg };
      }

      if (options.simulateRdsFailure && stagedSections.length > 0) {
        const failed = stagedSections[0];
        const alternatives = sections.filter(
          (s) =>
            s.courseCode === failed.courseCode &&
            s.id !== failed.id &&
            s.capacity - s.enrolled > 0
        );
        const prompt: RdsFallbackPrompt = {
          id: `fallback-${Date.now()}`,
          failedSectionId: failed.id,
          failedCourseCode: failed.courseCode,
          reason: `RDS Gateway contention on ${failed.id}: seats exhausted during handshake.`,
          alternatives,
          createdAt: new Date().toISOString(),
          resolved: false
        };
        setRdsFallbackPrompt(prompt);
        openModal('rds_fallback', prompt);
        return { ok: true, status: 200, data: { receipt: null, fallbackPrompt: prompt } };
      }

      const fullSec = stagedSections.find((s) => s.enrolled >= s.capacity);
      if (fullSec) {
        const msg = `Section ${fullSec.id} has no remaining open seats.`;
        setLastError(msg);
        return { ok: false, status: 409, message: msg };
      }

      const updatedSections = sections.map((sec) =>
        stagedSectionIds.includes(sec.id) ? { ...sec, enrolled: sec.enrolled + 1 } : sec
      );
      const hex8 = Math.floor(0x10000000 + Math.random() * 0xefffffff)
        .toString(16)
        .toUpperCase();
      const sig64 = Array.from({ length: 64 }, (_, i) =>
        ((hex8.charCodeAt(i % hex8.length) + i * 7) % 16).toString(16)
      ).join('');
      const newReceipt: ScheduleReceipt = {
        transactionId: `#RDS-TXN-${hex8}`,
        studentId: student.id,
        cartToken: student.cartToken,
        timestamp: new Date().toISOString(),
        totalCredits,
        sections: stagedSections,
        digitalSignature: `SHA256:${sig64}`,
        status: 'confirmed',
        source: 'api'
      };
      const logItem: AuditLogItem = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        actor: student.name,
        action: 'RDS Enrollment Locked',
        details: `Schedule locked with ${totalCredits.toFixed(1)} Cr. Generated ${newReceipt.transactionId}`,
        badgeType: 'emerald'
      };
      const nextLog = [logItem, ...auditLog];
      setSections(updatedSections);
      setReceipt(newReceipt);
      setAuditLog(nextLog);
      openModal('receipt', newReceipt);
      broadcastState(
        buildSnapshotState({ sections: updatedSections, receipt: newReceipt, auditLog: nextLog })
      );
      return { ok: true, status: 200, data: { receipt: newReceipt } };
    },
    [
      apiFetch,
      auditLog,
      broadcastState,
      buildSnapshotState,
      clashes.length,
      openModal,
      sections,
      stagedSectionIds,
      stagedSections,
      student,
      totalCredits
    ]
  );

  const submitPetition = useCallback(
    async (input: {
      sectionId?: string;
      courseCode: string;
      ruleCode: string;
      reason: string;
    }): Promise<ActionResult<{ exceptionCase: ExceptionCase }>> => {
      const res = await apiFetch<{ ok: boolean; exceptionCase?: ExceptionCase; state?: BackendState }>(
        '/student/petitions',
        {
          method: 'POST',
          body: JSON.stringify(input)
        }
      );

      if (!res.networkError) {
        if (res.ok && res.data?.exceptionCase) {
          return {
            ok: true,
            status: res.status,
            data: { exceptionCase: res.data.exceptionCase }
          };
        }
        return { ok: false, status: res.status, message: res.message };
      }

      // Offline fallback: create pending petition (never auto-approve!)
      const sec =
        (input.sectionId ? sections.find((s) => s.id === input.sectionId) : undefined) ??
        sections.find((s) => s.courseCode === input.courseCode);
      const caseId = `CASE #EX-2025-${Math.floor(1000 + Math.random() * 9000)}`;
      const newCase: ExceptionCase = {
        id: caseId,
        studentId: student.id,
        studentName: student.name,
        program: 'B.Sc CSE',
        standing: student.standing,
        cgpa: student.cgpa,
        creditsCompleted: student.creditsCompleted,
        courseCode: sec?.courseCode ?? input.courseCode,
        courseTitle: sec?.courseTitle ?? input.courseCode,
        sectionNumber: sec?.sectionNumber ?? '01',
        sectionId: sec?.id ?? input.sectionId,
        ruleCode: input.ruleCode,
        category:
          input.ruleCode === 'RULE-2.1'
            ? 'Prereqs'
            : input.ruleCode === 'RULE-8.4'
              ? 'Capacity'
              : 'Credit Standing',
        submittedAt: `Today, ${new Date().toLocaleTimeString()}`,
        status: 'pending',
        statement: input.reason,
        auditChecks: [
          {
            rule: `${input.ruleCode} Petition`,
            description: `Submitted for ${sec?.courseCode ?? input.courseCode}`,
            passed: true,
            notes: 'Awaiting faculty advisor decision'
          }
        ]
      };
      const nextExceptions = [newCase, ...exceptions];
      setExceptions(nextExceptions);
      broadcastState(buildSnapshotState({ exceptions: nextExceptions }));
      return { ok: true, status: 201, data: { exceptionCase: newCase } };
    },
    [apiFetch, broadcastState, buildSnapshotState, exceptions, sections, student]
  );

  const joinWaitlist = useCallback(
    async (
      sectionId: string
    ): Promise<ActionResult<{ position: number; entry?: WaitlistEntry }>> => {
      const res = await apiFetch<{
        ok: boolean;
        position?: number;
        entry?: WaitlistEntry;
        state?: BackendState;
      }>('/student/waitlist', {
        method: 'POST',
        body: JSON.stringify({ sectionId })
      });

      if (!res.networkError) {
        if (res.ok) {
          return {
            ok: true,
            status: res.status,
            data: { position: res.data?.position ?? 1, entry: res.data?.entry }
          };
        }
        return { ok: false, status: res.status, message: res.message };
      }

      const sec = sections.find((s) => s.id === sectionId);
      if (!sec) return { ok: false, status: 404, message: 'Section not found' };

      const existing = waitlistEntries.find(
        (w) => w.sectionId === sectionId && w.studentId === student.id && w.status === 'waiting'
      );
      if (existing) {
        return { ok: true, status: 200, data: { position: existing.position, entry: existing } };
      }

      const nextPosition = sec.waitlisted + 1;
      const entry: WaitlistEntry = {
        id: `wl-${Date.now()}`,
        studentId: student.id,
        sectionId,
        courseCode: sec.courseCode,
        position: nextPosition,
        createdAt: new Date().toISOString(),
        status: 'waiting'
      };
      const nextSections = sections.map((s) =>
        s.id === sectionId ? { ...s, waitlisted: s.waitlisted + 1 } : s
      );
      const nextEntries = [...waitlistEntries, entry];
      const nextIds = waitlistSectionIds.includes(sectionId)
        ? waitlistSectionIds
        : [...waitlistSectionIds, sectionId];

      setSections(nextSections);
      setWaitlistEntries(nextEntries);
      setWaitlistSectionIds(nextIds);
      broadcastState(
        buildSnapshotState({
          sections: nextSections,
          waitlistEntries: nextEntries,
          waitlistSectionIds: nextIds
        })
      );
      return { ok: true, status: 200, data: { position: nextPosition, entry } };
    },
    [
      apiFetch,
      broadcastState,
      buildSnapshotState,
      sections,
      student.id,
      waitlistEntries,
      waitlistSectionIds
    ]
  );

  const solveScheduleInternal = useCallback(
    async (
      req: SolveScheduleRequest
    ): Promise<{ solved: SolveScheduleResult | null; networkError: boolean }> => {
      const res = await apiFetch<SolveScheduleResult>('/student/schedule/solve', {
        method: 'POST',
        body: JSON.stringify(req)
      });

      if (!res.networkError) {
        return { solved: res.ok && res.data ? res.data : null, networkError: false };
      }

      // Offline heuristic fallback matching MilestoneFirst / MinimizeGaps
      const maxCredits = req.maxCredits ?? student.maxCredits ?? 15;
      const openSections = sections.filter(
        (s) =>
          s.capacity - s.enrolled > 0 &&
          (!s.minCreditsRequired || student.creditsCompleted >= s.minCreditsRequired) &&
          (!req.courseCodes || req.courseCodes.length === 0 || req.courseCodes.includes(s.courseCode))
      );
      const chosen: CourseSection[] = [];
      let credits = 0;
      const seenCourses = new Set<string>();
      for (const sec of openSections) {
        if (seenCourses.has(sec.courseCode)) continue;
        if (credits + sec.credits > maxCredits) continue;
        if (detectScheduleClashes([...chosen, sec]).length > 0) continue;
        chosen.push(sec);
        seenCourses.add(sec.courseCode);
        credits += sec.credits;
      }
      return {
        networkError: true,
        solved: {
          ok: true,
          recommendedSectionIds: chosen.map((c) => c.id),
          sections: chosen,
          totalCredits: credits,
          clashes: [],
          strategy: req.strategy,
          idleGapMinutes: req.strategy === 'MinimizeGaps' ? 20 : 45
        }
      };
    },
    [apiFetch, sections, student.creditsCompleted, student.maxCredits]
  );

  const solveSchedule = useCallback(
    async (req: SolveScheduleRequest): Promise<SolveScheduleResult | null> => {
      const { solved } = await solveScheduleInternal(req);
      return solved;
    },
    [solveScheduleInternal]
  );

  const applySolvedSchedule = useCallback(
    async (req: SolveScheduleRequest): Promise<SolveScheduleResult | null> => {
      const { solved, networkError } = await solveScheduleInternal(req);
      if (!solved || !solved.ok) return null;

      if (networkError) {
        const nextStagedIds = [...solved.recommendedSectionIds];
        updateStagedSectionIds(nextStagedIds);
        const logItem: AuditLogItem = {
          id: `log-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          actor: student.name,
          action: 'Schedule Solver Applied',
          details: `Applied ${solved.strategy} schedule (${nextStagedIds.join(', ') || 'none'}).`,
          badgeType: 'teal'
        };
        const nextLog = [logItem, ...auditLog];
        setAuditLog(nextLog);
        broadcastState(buildSnapshotState({ stagedSectionIds: nextStagedIds, auditLog: nextLog }));
        return solved;
      }

      // Online mode: snapshot prior cart, apply solved sections, and rollback on partial failure
      const previousStaged = [...stagedSectionIdsRef.current];
      for (const currentId of previousStaged) {
        if (!solved.recommendedSectionIds.includes(currentId)) {
          await unstageSection(currentId);
        }
      }
      let applyFailed = false;
      for (const nextId of solved.recommendedSectionIds) {
        if (!stagedSectionIdsRef.current.includes(nextId)) {
          const ok = await stageSection(nextId);
          if (!ok) {
            applyFailed = true;
            break;
          }
        }
      }
      if (applyFailed) {
        for (const id of [...stagedSectionIdsRef.current]) {
          if (!previousStaged.includes(id)) {
            await apiFetch(`/student/cart/${encodeURIComponent(id)}`, { method: 'DELETE' });
          }
        }
        for (const id of previousStaged) {
          if (!stagedSectionIdsRef.current.includes(id)) {
            await apiFetch('/student/cart/stage', {
              method: 'POST',
              body: JSON.stringify({ sectionId: id })
            });
          }
        }
        setLastError('Could not apply solved schedule; restored prior cart.');
        return null;
      }
      return solved;
    },
    [
      apiFetch,
      auditLog,
      broadcastState,
      buildSnapshotState,
      solveScheduleInternal,
      stageSection,
      student.name,
      unstageSection,
      updateStagedSectionIds
    ]
  );

  const fetchDagEligible = useCallback(async (): Promise<DagSummary | null> => {
    const res = await apiFetch<DagSummary & { ok?: boolean }>('/student/dag/eligible', {
      method: 'GET'
    });
    if (!res.networkError && res.ok && res.data) {
      const summary: DagSummary = {
        eligibleCourses: res.data.eligibleCourses ?? [],
        blockedCourses: res.data.blockedCourses ?? {},
        criticalPath: res.data.criticalPath ?? [],
        hasCycle: Boolean(res.data.hasCycle),
        cyclePath: res.data.cyclePath,
        topologicalOrder: res.data.topologicalOrder,
        nodes: res.data.nodes
      };
      dagSummaryRef.current = summary;
      setDagSummary(summary);
      return summary;
    }
    return dagSummaryRef.current;
  }, [apiFetch]);

  const resolveRdsFallback = useCallback(
    async (
      failedSectionId: string,
      fallbackSectionId: string
    ): Promise<ActionResult<{ receipt: ScheduleReceipt | null }>> => {
      const res = await apiFetch<{
        ok: boolean;
        receipt?: ScheduleReceipt;
        state?: BackendState;
        message?: string;
      }>('/student/rds/fallback', {
        method: 'POST',
        body: JSON.stringify({ failedSectionId, fallbackSectionId })
      });

      if (!res.networkError) {
        if (res.ok) {
          setRdsFallbackPrompt(null);
          if (res.data?.receipt) {
            setReceipt(res.data.receipt);
            openModal('receipt', res.data.receipt);
          } else {
            closeModal();
          }
          return { ok: true, status: res.status, data: { receipt: res.data?.receipt ?? null } };
        }
        return { ok: false, status: res.status, message: res.message };
      }

      // Offline fallback swap + confirm
      const nextStagedIds = [
        ...stagedSectionIdsRef.current.filter((id) => id !== failedSectionId),
        fallbackSectionId
      ];
      updateStagedSectionIds(nextStagedIds);
      setRdsFallbackPrompt(null);
      const nextStaged = nextStagedIds
        .map((id) => sections.find((s) => s.id === id))
        .filter((s): s is CourseSection => Boolean(s));
      const nextCredits = nextStaged.reduce((acc, s) => acc + s.credits, 0);
      const hex8 = Math.floor(0x10000000 + Math.random() * 0xefffffff)
        .toString(16)
        .toUpperCase();
      const sig64 = Array.from({ length: 64 }, (_, i) =>
        ((hex8.charCodeAt(i % hex8.length) + i * 11) % 16).toString(16)
      ).join('');
      const newReceipt: ScheduleReceipt = {
        transactionId: `#RDS-TXN-${hex8}`,
        studentId: student.id,
        cartToken: student.cartToken,
        timestamp: new Date().toISOString(),
        totalCredits: nextCredits,
        sections: nextStaged,
        digitalSignature: `SHA256:${sig64}`,
        status: 'confirmed',
        source: 'api'
      };
      setReceipt(newReceipt);
      openModal('receipt', newReceipt);
      return { ok: true, status: 200, data: { receipt: newReceipt } };
    },
    [apiFetch, closeModal, openModal, sections, student.cartToken, student.id, updateStagedSectionIds]
  );

  const markNotificationRead = useCallback((notificationId?: string) => {
    setNotifications((prev) =>
      prev.map((n) => (!notificationId || n.id === notificationId ? { ...n, read: true } : n))
    );
  }, []);

  // ================= FACULTY ACTIONS =================

  const decideException = useCallback(
    async (caseId: string, action: 'approve' | 'reject' | 'flag'): Promise<ActionResult> => {
      const targetCase = exceptions.find((e) => e.id === caseId);
      if (
        targetCase &&
        (targetCase.status === 'approved' || targetCase.status === 'rejected')
      ) {
        const msg = `Exception case ${caseId} has already been finalized (${targetCase.status}).`;
        setLastError(msg);
        return { ok: false, status: 409, message: msg };
      }

      const res = await apiFetch('/faculty/exceptions/decision', {
        method: 'POST',
        body: JSON.stringify({ caseId, action })
      });

      if (!res.networkError) {
        return { ok: res.ok, status: res.status, message: res.message };
      }

      if (!targetCase) return { ok: false, status: 404, message: 'Case not found' };

      const actorName = authUser?.name || 'Dr. Nova Ahmed';
      const nextStatus: ExceptionCase['status'] =
        action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'flagged';

      if (action === 'approve') {
        const targetSec = sections.find(
          (s) =>
            (targetCase.sectionId && s.id === targetCase.sectionId) ||
            (s.courseCode === targetCase.courseCode &&
              s.sectionNumber === targetCase.sectionNumber)
        );
        if (targetSec) {
          const cap = targetSec.roomCap ?? ROOM_FIRE_CODE_CAPS[targetSec.room] ?? 55;
          if (targetSec.capacity + 1 > cap) {
            const msg = `Room ${targetSec.room} fire-code limit (${cap}) reached.`;
            setLastError(msg);
            return { ok: false, status: 422, message: msg };
          }
        }
      }

      const updatedExceptions = exceptions.map((c) =>
        c.id === caseId
          ? {
              ...c,
              status: nextStatus,
              facultyDecisionBy: actorName,
              facultyDecisionAt: new Date().toLocaleTimeString()
            }
          : c
      );
      const updatedSections =
        action === 'approve'
          ? sections.map((sec) =>
              (targetCase.sectionId && sec.id === targetCase.sectionId) ||
              (sec.courseCode === targetCase.courseCode &&
                sec.sectionNumber === targetCase.sectionNumber)
                ? { ...sec, capacity: sec.capacity + 1, enrolled: sec.enrolled + 1 }
                : sec
            )
          : sections;

      setExceptions(updatedExceptions);
      setSections(updatedSections);
      broadcastState(
        buildSnapshotState({ exceptions: updatedExceptions, sections: updatedSections })
      );
      return { ok: true, status: 200 };
    },
    [apiFetch, authUser?.name, broadcastState, buildSnapshotState, exceptions, sections]
  );

  const approveException = useCallback(
    (caseId: string) => decideException(caseId, 'approve'),
    [decideException]
  );

  const rejectException = useCallback(
    (caseId: string) => decideException(caseId, 'reject'),
    [decideException]
  );

  const flagException = useCallback(
    (caseId: string) => decideException(caseId, 'flag'),
    [decideException]
  );

  const expandCapacity = useCallback(
    async (sectionId: string, delta: number): Promise<ActionResult> => {
      const res = await apiFetch('/faculty/sections/expand-capacity', {
        method: 'POST',
        body: JSON.stringify({ sectionId, delta })
      });

      if (!res.networkError) {
        if (res.ok) {
          closeModal();
          return { ok: true, status: res.status };
        }
        return { ok: false, status: res.status, message: res.message };
      }

      // Offline guarded fallback
      const target = sections.find((s) => s.id === sectionId);
      if (!target) return { ok: false, status: 404, message: 'Section not found' };
      const roomCap = target.roomCap ?? ROOM_FIRE_CODE_CAPS[target.room] ?? 55;
      if (target.capacity + delta > roomCap) {
        const msg = `Requested capacity (${target.capacity + delta}) exceeds ${target.room} fire-code limit (${roomCap}).`;
        setLastError(msg);
        return { ok: false, status: 422, message: msg };
      }

      const updatedSections = sections.map((sec) =>
        sec.id === sectionId ? { ...sec, capacity: sec.capacity + delta } : sec
      );
      setSections(updatedSections);
      closeModal();
      broadcastState(buildSnapshotState({ sections: updatedSections }));
      return { ok: true, status: 200 };
    },
    [apiFetch, broadcastState, buildSnapshotState, closeModal, sections]
  );

  const createBypassRule = useCallback(
    async (input: {
      code: string;
      title: string;
      description: string;
      category: BypassRule['category'];
      enabled: boolean;
    }): Promise<ActionResult<{ rule: BypassRule; autoApprovedCount: number }>> => {
      const res = await apiFetch<{
        ok: boolean;
        rule?: BypassRule;
        autoApprovedCount?: number;
        state?: BackendState;
        message?: string;
      }>('/faculty/rules', {
        method: 'POST',
        body: JSON.stringify(input)
      });

      if (!res.networkError) {
        if (res.ok && res.data?.rule) {
          return {
            ok: true,
            status: res.status,
            data: {
              rule: res.data.rule,
              autoApprovedCount: res.data.autoApprovedCount ?? 0
            }
          };
        }
        return { ok: false, status: res.status, message: res.message };
      }

      const newRule: BypassRule = {
        id: input.code.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        code: input.code,
        title: input.title,
        description: input.description,
        category: input.category,
        enabled: input.enabled,
        lastUpdated: `${authUser?.name || 'Dr. Nova Ahmed'} • ${new Date().toLocaleTimeString()}`
      };
      const nextRules = [...bypassRules, newRule];
      setBypassRules(nextRules);
      broadcastState(buildSnapshotState({ bypassRules: nextRules }));
      return { ok: true, status: 201, data: { rule: newRule, autoApprovedCount: 0 } };
    },
    [apiFetch, authUser?.name, broadcastState, buildSnapshotState, bypassRules]
  );

  const toggleBypassRule = useCallback(
    async (ruleId: string): Promise<ActionResult<{ autoApprovedCount?: number }>> => {
      const res = await apiFetch<{ ok: boolean; autoApprovedCount?: number; state?: BackendState }>(
        '/faculty/rules/toggle',
        {
          method: 'POST',
          body: JSON.stringify({ ruleId })
        }
      );

      if (!res.networkError) {
        return {
          ok: res.ok,
          status: res.status,
          message: res.message,
          data: { autoApprovedCount: res.data?.autoApprovedCount ?? 0 }
        };
      }

      const nextRules = bypassRules.map((r) =>
        r.id === ruleId ? { ...r, enabled: !r.enabled } : r
      );
      setBypassRules(nextRules);
      broadcastState(buildSnapshotState({ bypassRules: nextRules }));
      return { ok: true, status: 200, data: { autoApprovedCount: 0 } };
    },
    [apiFetch, broadcastState, buildSnapshotState, bypassRules]
  );

  // ================= ADMIN ACTIONS =================

  const autoScaleApiNodes = useCallback(async (): Promise<ActionResult> => {
    const res = await apiFetch('/admin/scale', { method: 'POST' });
    if (!res.networkError) return { ok: res.ok, status: res.status, message: res.message };

    const nextNodes = metrics.apiNodes + 2;
    const updatedMetrics: AdminMetrics = {
      ...metrics,
      apiNodes: nextNodes,
      p95LatencyMs: 138,
      requestsPerSec: Math.max(1842, metrics.requestsPerSec),
      lastScalingEvent: `Scaled +2 nodes (${nextNodes} active). p95 Latency stabilized to 138 ms.`
    };
    setMetrics(updatedMetrics);
    appendTelemetryPoint(updatedMetrics);
    broadcastState(buildSnapshotState({ metrics: updatedMetrics }));
    return { ok: true, status: 200 };
  }, [apiFetch, appendTelemetryPoint, broadcastState, buildSnapshotState, metrics]);

  const acknowledgeIncident = useCallback(async (): Promise<ActionResult> => {
    const res = await apiFetch('/admin/acknowledge', { method: 'POST' });
    if (!res.networkError) return { ok: res.ok, status: res.status, message: res.message };

    const updatedMetrics: AdminMetrics = {
      ...metrics,
      surgeSpikeActive: false,
      lastScalingEvent: 'SEV-1 incident acknowledged by on-call engineer.'
    };
    setMetrics(updatedMetrics);
    broadcastState(buildSnapshotState({ metrics: updatedMetrics }));
    return { ok: true, status: 200 };
  }, [apiFetch, broadcastState, buildSnapshotState, metrics]);

  const allocateEmergencySection = useCallback(
    async (courseCode: string, sectionData: Partial<CourseSection>): Promise<ActionResult> => {
      const res = await apiFetch('/admin/sections/emergency', {
        method: 'POST',
        body: JSON.stringify({ courseCode, sectionData })
      });
      if (!res.networkError) {
        if (res.ok) closeModal();
        return { ok: res.ok, status: res.status, message: res.message };
      }

      const existingCount = sections.filter((s) => s.courseCode === courseCode).length;
      const nextNum = String(existingCount + 1).padStart(2, '0');
      const newSection: CourseSection = {
        id: `${courseCode.replace(/\s+/g, '')}-${nextNum}`,
        courseCode,
        courseTitle:
          sections.find((s) => s.courseCode === courseCode)?.courseTitle || 'Emergency Section',
        department: 'ECE / CSE',
        credits: 3.0,
        sectionNumber: nextNum,
        faculty: sectionData.faculty || 'Mr. Tanvir Rahman',
        days: sectionData.days || 'MW',
        timeSlot: sectionData.timeSlot || '04:20 PM - 05:50 PM',
        room: sectionData.room || 'LIB 608',
        roomCap: ROOM_FIRE_CODE_CAPS[sectionData.room || 'LIB 608'] ?? 45,
        capacity: sectionData.capacity || 40,
        enrolled: 0,
        waitlisted: 0,
        prerequisites: ['CSE 215']
      };
      const updatedSections = [...sections, newSection];
      const updatedEscalations = escalations.map((esc) =>
        esc.courseCode === courseCode
          ? {
              ...esc,
              status: 'Mitigated' as const,
              totalCapacity: esc.totalCapacity + newSection.capacity,
              deficit: Math.max(0, esc.deficit - newSection.capacity)
            }
          : esc
      );
      setSections(updatedSections);
      setEscalations(updatedEscalations);
      closeModal();
      broadcastState(
        buildSnapshotState({ sections: updatedSections, escalations: updatedEscalations })
      );
      return { ok: true, status: 200 };
    },
    [apiFetch, broadcastState, buildSnapshotState, closeModal, escalations, sections]
  );

  const addSeatsToAllSections = useCallback(
    async (courseCode: string, count: number): Promise<ActionResult> => {
      const res = await apiFetch('/admin/courses/add-seats', {
        method: 'POST',
        body: JSON.stringify({ courseCode, count })
      });
      if (!res.networkError) return { ok: res.ok, status: res.status, message: res.message };

      const matchingCount = sections.filter((s) => s.courseCode === courseCode).length;
      const updatedSections = sections.map((sec) =>
        sec.courseCode === courseCode ? { ...sec, capacity: sec.capacity + count } : sec
      );
      const addedTotal = count * matchingCount;
      const updatedEscalations = escalations.map((esc) =>
        esc.courseCode === courseCode
          ? {
              ...esc,
              totalCapacity: esc.totalCapacity + addedTotal,
              deficit: Math.max(0, esc.deficit - addedTotal),
              status: 'Resolved' as const
            }
          : esc
      );
      setSections(updatedSections);
      setEscalations(updatedEscalations);
      broadcastState(
        buildSnapshotState({ sections: updatedSections, escalations: updatedEscalations })
      );
      return { ok: true, status: 200 };
    },
    [apiFetch, broadcastState, buildSnapshotState, escalations, sections]
  );

  const syncRds4 = useCallback(async (): Promise<ActionResult> => {
    const res = await apiFetch<{
      ok?: boolean;
      syncResult?: { totalProcessed?: number; driftCount?: number };
      state?: BackendState;
    }>('/admin/rds4/sync', {
      method: 'POST',
      body: JSON.stringify({})
    });
    if (!res.networkError) {
      if (res.ok && !res.data?.state) {
        await refreshBootstrap();
      }
      return { ok: res.ok, status: res.status, data: res.data, message: res.message };
    }
    return { ok: true, status: 200, data: { totalProcessed: sections.length, driftCount: 0 } };
  }, [apiFetch, refreshBootstrap, sections.length]);

  // ================= DEMO CONTROLS =================

  const simulateSurgeSpike = useCallback(async () => {
    const res = await apiFetch('/demo/surge', { method: 'POST' });
    if (!res.networkError) return;

    const updatedMetrics: AdminMetrics = {
      ...metrics,
      requestsPerSec: 3450,
      p95LatencyMs: 275,
      poolUsed: 194,
      surgeSpikeActive: true,
      lastScalingEvent: 'Simulated high-concurrency surge spike triggered.'
    };
    setMetrics(updatedMetrics);
    appendTelemetryPoint(updatedMetrics);
    broadcastState(buildSnapshotState({ metrics: updatedMetrics }));
  }, [apiFetch, appendTelemetryPoint, broadcastState, buildSnapshotState, metrics]);

  const simulateSectionFull = useCallback(
    async (sectionId: string) => {
      const res = await apiFetch('/demo/section-full', {
        method: 'POST',
        body: JSON.stringify({ sectionId })
      });
      if (!res.networkError) return;

      const updatedSections = sections.map((sec) =>
        sec.id === sectionId ? { ...sec, enrolled: sec.capacity } : sec
      );
      setSections(updatedSections);
      broadcastState(buildSnapshotState({ sections: updatedSections }));
    },
    [apiFetch, broadcastState, buildSnapshotState, sections]
  );

  const resetDemoState = useCallback(async () => {
    const res = await apiFetch<{ ok?: boolean; state?: BackendState }>('/demo/reset', {
      method: 'POST'
    });
    closeModal();
    setLastError(null);
    setDemoResetVersion((v) => v + 1);
    if (!res.networkError && res.ok) {
      setTelemetryHistory(buildInitialTelemetryHistory(res.data?.state?.metrics ?? INITIAL_METRICS));
      return;
    }

    setStudent(INITIAL_STUDENT);
    setSections(INITIAL_SECTIONS);
    updateStagedSectionIds(INITIAL_STAGED_IDS);
    setExceptions(INITIAL_EXCEPTIONS);
    setBypassRules(INITIAL_BYPASS_RULES);
    setAuditLog(INITIAL_AUDIT_LOG);
    setMetrics(INITIAL_METRICS);
    setEscalations(INITIAL_ESCALATIONS);
    setReceipt(null);
    setNotifications(INITIAL_NOTIFICATIONS);
    setWaitlistSectionIds([]);
    setWaitlistEntries(INITIAL_WAITLIST);
    dagSummaryRef.current = INITIAL_DAG_SUMMARY;
    setDagSummary(INITIAL_DAG_SUMMARY);
    setRdsFallbackPrompt(null);
    setTelemetryHistory(buildInitialTelemetryHistory(INITIAL_METRICS));

    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
      broadcastState({
        student: INITIAL_STUDENT,
        sections: INITIAL_SECTIONS,
        stagedSectionIds: INITIAL_STAGED_IDS,
        exceptions: INITIAL_EXCEPTIONS,
        bypassRules: INITIAL_BYPASS_RULES,
        auditLog: INITIAL_AUDIT_LOG,
        metrics: INITIAL_METRICS,
        escalations: INITIAL_ESCALATIONS,
        receipt: null,
        notifications: INITIAL_NOTIFICATIONS,
        waitlistSectionIds: [],
        waitlistEntries: INITIAL_WAITLIST,
        dagSummary: INITIAL_DAG_SUMMARY,
        rdsFallbackPrompt: null
      });
    }
  }, [apiFetch, broadcastState, closeModal, updateStagedSectionIds]);

  const value: SmartAdvisorContextType = {
    role,
    setRole: updateRole,
    authUser,
    authToken,
    authHydrated,
    isAuthenticated: Boolean(authToken && authUser),
    authLoading,
    wsConnected,
    sseConnected,
    isSyncing,
    lastError,
    clearError,
    student,
    sections,
    stagedSectionIds,
    exceptions,
    bypassRules,
    auditLog,
    metrics,
    escalations,
    receipt,
    notifications,
    waitlistSectionIds,
    waitlistEntries,
    dagSummary,
    rdsFallbackPrompt,
    healthCheck,
    telemetryHistory,
    activeModal,
    modalPayload,
    openModal,
    closeModal,
    login,
    logout,
    switchDemoRole,
    refreshBootstrap,
    stageSection,
    unstageSection,
    confirmSchedule,
    submitPetition,
    joinWaitlist,
    solveSchedule,
    applySolvedSchedule,
    fetchDagEligible,
    resolveRdsFallback,
    markNotificationRead,
    approveException,
    rejectException,
    flagException,
    expandCapacity,
    createBypassRule,
    toggleBypassRule,
    autoScaleApiNodes,
    acknowledgeIncident,
    allocateEmergencySection,
    addSeatsToAllSections,
    syncRds4,
    fetchHealth,
    simulateSurgeSpike,
    simulateSectionFull,
    resetDemoState,
    demoResetVersion,
    stagedSections,
    totalCredits,
    clashes
  };

  return <SmartAdvisorContext.Provider value={value}>{children}</SmartAdvisorContext.Provider>;
}

export function useSmartAdvisor() {
  const context = useContext(SmartAdvisorContext);
  if (!context) {
    throw new Error('useSmartAdvisor must be used within a SmartAdvisorProvider');
  }
  return context;
}
