import crypto from 'crypto';
import {
  StudentProfile,
  CourseSection,
  ExceptionCase,
  BypassRule,
  AuditLogItem,
  AdminMetrics,
  EscalationItem,
  UserRole,
  NotificationItem,
  WaitlistEntry
} from './types';

// ================= PASSWORD HASHING (SCRYPT) =================

export const DEMO_DEFAULT_PASSWORD = process.env.DEMO_DEFAULT_PASSWORD || 'SmartAdvisor2025!';

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) {
    return false;
  }
  try {
    const derived = crypto.scryptSync(plain, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ================= ROOM FIRE-CODE CAPS & DAG CATALOG =================

export const ROOM_FIRE_CODE_CAPS: Record<string, number> = {
  'LIB 602': 55,
  'SAC 502': 55,
  'SAC 415': 55,
  'NAC 408': 50,
  'NAC 510': 50,
  'LIB 608': 45
};

export interface CatalogCourseNode {
  code: string;
  title: string;
  credits: number;
  department: CourseSection['department'];
  prerequisites: string[];
  minCreditsRequired?: number;
}

export const COURSE_CATALOG_DAG: CatalogCourseNode[] = [
  {
    code: 'CSE 115',
    title: 'Programming Language I',
    credits: 3.0,
    department: 'ECE / CSE',
    prerequisites: []
  },
  {
    code: 'MAT 120',
    title: 'Calculus and Analytic Geometry I',
    credits: 3.0,
    department: 'Math & Physics',
    prerequisites: []
  },
  {
    code: 'CSE 215',
    title: 'Programming Language II',
    credits: 3.0,
    department: 'ECE / CSE',
    prerequisites: ['CSE 115']
  },
  {
    code: 'CSE 231',
    title: 'Digital Logic Design',
    credits: 3.0,
    department: 'ECE / CSE',
    prerequisites: ['CSE 115']
  },
  {
    code: 'CSE 311',
    title: 'Database Systems',
    credits: 3.0,
    department: 'ECE / CSE',
    prerequisites: ['CSE 215']
  },
  {
    code: 'CSE 311L',
    title: 'Database Lab',
    credits: 1.0,
    department: 'ECE / CSE',
    prerequisites: ['CSE 215']
  },
  {
    code: 'CSE 327',
    title: 'Software Engineering',
    credits: 3.0,
    department: 'ECE / CSE',
    prerequisites: ['CSE 215']
  },
  {
    code: 'CSE 331',
    title: 'Microprocessor Systems',
    credits: 3.0,
    department: 'ECE / CSE',
    prerequisites: ['CSE 231']
  },
  {
    code: 'MAT 361',
    title: 'Probability & Statistics',
    credits: 3.0,
    department: 'Math & Physics',
    prerequisites: ['MAT 120']
  },
  {
    code: 'CSE 425',
    title: 'Concepts of Programming Languages',
    credits: 3.0,
    department: 'ECE / CSE',
    prerequisites: ['CSE 215', 'CSE 311'],
    minCreditsRequired: 100
  }
];

// ================= AUTH & RBAC SEED ACCOUNTS =================

export interface SeedUserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  instructorName: string | null;
  department: string;
}

const DEFAULT_HASH = hashPassword(DEMO_DEFAULT_PASSWORD);

export const INITIAL_USERS: SeedUserAccount[] = [
  {
    id: '2412159042',
    name: 'Rahim Ahmed',
    email: 'rahim.ahmed01@northsouth.edu',
    role: 'student',
    passwordHash: DEFAULT_HASH,
    instructorName: null,
    department: 'ECE / CSE'
  },
  {
    id: '2321450042',
    name: 'Fariha Tasnim',
    email: 'fariha.tasnim@northsouth.edu',
    role: 'student',
    passwordHash: DEFAULT_HASH,
    instructorName: null,
    department: 'ECE / CSE'
  },
  {
    id: '2211290042',
    name: 'Tanveer Hasan',
    email: 'tanveer.hasan@northsouth.edu',
    role: 'student',
    passwordHash: DEFAULT_HASH,
    instructorName: null,
    department: 'ECE / CSE'
  },
  {
    id: 'nova.ahmed',
    name: 'Dr. Nova Ahmed',
    email: 'nova.ahmed@northsouth.edu',
    role: 'faculty',
    passwordHash: DEFAULT_HASH,
    instructorName: 'Dr. Nova Ahmed',
    department: 'ECE / CSE'
  },
  {
    id: 'nabeel.mohammed',
    name: 'Dr. Nabeel Mohammed',
    email: 'nabeel.mohammed@northsouth.edu',
    role: 'faculty',
    passwordHash: DEFAULT_HASH,
    instructorName: 'Dr. Nabeel Mohammed',
    department: 'ECE / CSE'
  },
  {
    id: 'silvia.ahmed',
    name: 'Dr. Silvia Ahmed',
    email: 'silvia.ahmed@northsouth.edu',
    role: 'faculty',
    passwordHash: DEFAULT_HASH,
    instructorName: 'Dr. Silvia Ahmed',
    department: 'ECE / CSE'
  },
  {
    id: 'rajesh.palit',
    name: 'Prof. Dr. Rajesh Palit',
    email: 'rajesh.palit@northsouth.edu',
    role: 'faculty',
    passwordHash: DEFAULT_HASH,
    instructorName: 'Prof. Dr. Rajesh Palit',
    department: 'ECE / CSE'
  },
  {
    id: 'tanvir.rahman',
    name: 'Mr. Tanvir Rahman',
    email: 'tanvir.rahman@northsouth.edu',
    role: 'faculty',
    passwordHash: DEFAULT_HASH,
    instructorName: 'Mr. Tanvir Rahman',
    department: 'ECE / CSE'
  },
  {
    id: 'tanjila.farah',
    name: 'Dr. Tanjila Farah',
    email: 'tanjila.farah@northsouth.edu',
    role: 'faculty',
    passwordHash: DEFAULT_HASH,
    instructorName: 'Dr. Tanjila Farah',
    department: 'ECE / CSE'
  },
  {
    id: 'safayat.hossain',
    name: 'Mr. Safayat Hossain',
    email: 'safayat.hossain@northsouth.edu',
    role: 'faculty',
    passwordHash: DEFAULT_HASH,
    instructorName: 'Mr. Safayat Hossain',
    department: 'ECE / CSE'
  },
  {
    id: 'hasina.akter',
    name: 'Dr. Hasina Akter',
    email: 'hasina.akter@northsouth.edu',
    role: 'faculty',
    passwordHash: DEFAULT_HASH,
    instructorName: 'Dr. Hasina Akter',
    department: 'Math & Physics'
  },
  {
    id: 'admin.itops',
    name: 'IT Operations Admin',
    email: 'itops@northsouth.edu',
    role: 'admin',
    passwordHash: DEFAULT_HASH,
    instructorName: null,
    department: 'IT Operations'
  }
];

// ================= INITIAL PRE-SEEDED DATA =================

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
  slotClosesAt: new Date(Date.now() + 16094000).toISOString(), // ~4h 28m
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
    enrolled: 28, // 12 available
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
    enrolled: 36, // 04 available (Few Seats)
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
    enrolled: 40, // 00 available (Full)
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
    enrolled: 21, // 19 available
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
    enrolled: 37, // 03 available (Few Seats Left)
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
    enrolled: 27, // 08 available
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
    enrolled: 18, // 22 available
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
    enrolled: 35, // 05 available
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
    enrolled: 40, // 00 available (Full)
    waitlisted: 10,
    minCreditsRequired: 100,
    prerequisites: ['CSE 215', 'CSE 311'],
    examSlot: '2025-05-10T19:00:00Z'
  }
];

export const INITIAL_STAGED_IDS: string[] = [
  'CSE327-01', // 3.0 Cr ST 11:20 AM
  'CSE311-03', // 3.0 Cr MW 09:40 AM
  'CSE311L-02', // 1.0 Cr Thu 09:40 AM
  'MAT361-04' // 3.0 Cr ST 01:20 PM
  // Total: 10.0 Cr initial draft
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
