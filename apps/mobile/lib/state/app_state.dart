import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_client.dart';

class AppState extends ChangeNotifier {
  final SmartAdvisorApiClient _apiClient;
  final bool _useNetwork;
  final bool _enableRealtime;

  StreamSubscription<SyncEvent>? _syncSub;
  StreamSubscription<bool>? _connSub;

  bool _disposed = false;
  bool _isLoggedIn;
  int _currentTab;
  bool _isMilestoneFirst;
  bool _isOfflineMode = true;
  bool _isLiveConnected = false;
  bool _isSseFallback = false;
  bool _hasLiveMetrics = false;
  bool _isLoading = false;
  String? _authError;
  String? _lastError;
  AuthUser? _currentUser;

  StudentProfile _student = _createSeedStudent();
  List<CourseSection> _sections = List<CourseSection>.from(_seedSections);
  List<String> _stagedSectionIds = List<String>.from(_seedStagedIds);
  List<ExceptionCase> _exceptions = List<ExceptionCase>.from(_seedExceptions);
  List<BypassRule> _bypassRules = List<BypassRule>.from(_seedBypassRules);
  List<AuditLogItem> _auditLog = const [];
  AdminMetrics _metrics = const AdminMetrics(p95LatencyMs: 12);
  List<EscalationItem> _escalations = const [];
  ScheduleReceipt? _receipt;
  List<NotificationItem> _notifications = const [];
  List<String> _waitlistSectionIds = const ['CSE327-03', 'CSE425-01'];
  List<WaitlistEntry> _waitlistEntries = List<WaitlistEntry>.from(_seedWaitlist);
  DagSummary? _dagSummary;
  RdsFallbackPrompt? _rdsFallbackPrompt;
  List<ScheduleClash> _serverClashes = const [];
  SolveScheduleResult? _lastSolveResult;

  // Offline/seed fallbacks preserving initial UX & smoke test expectations
  final List<PetitionItem> _offlinePetitions =
      List<PetitionItem>.from(_seedOfflinePetitions);
  final List<AlertItem> _offlineAlerts =
      List<AlertItem>.from(_seedOfflineAlerts);

  AppState({
    SmartAdvisorApiClient? apiClient,
    bool? enableRealtime,
    bool initialLoggedIn = false,
    int initialTab = 0,
    bool isMilestoneFirst = true,
    BackendState? initialState,
  })  : _isLoggedIn = initialLoggedIn,
        _currentTab = initialTab,
        _isMilestoneFirst = isMilestoneFirst,
        _useNetwork =
            apiClient != null || Platform.environment['FLUTTER_TEST'] != 'true',
        _enableRealtime = enableRealtime ??
            (Platform.environment['FLUTTER_TEST'] != 'true'),
        _apiClient = apiClient ?? SmartAdvisorApiClient() {
    if (initialState != null) {
      _applyBackendState(initialState);
    } else {
      _dagSummary = _computeLocalDagSummary();
    }
    final prevOnReconnected = _apiClient.onReconnected;
    _apiClient.onReconnected = () {
      prevOnReconnected?.call();
      if (!_disposed && _isLoggedIn) {
        unawaited(refreshBootstrap());
      }
    };
    _syncSub = _apiClient.events.listen(_handleSyncEvent);
    _connSub = _apiClient.connectionStatus.listen((connected) {
      if (_disposed) return;
      _isLiveConnected = connected;
      _isSseFallback = _apiClient.isSseFallback;
      if (connected) {
        _isOfflineMode = false;
      }
      _safeNotify();
    });
  }

  static StudentProfile _createSeedStudent() {
    return StudentProfile(
      id: '2412159042',
      name: 'Rahim Ahmed',
      email: 'rahim.ahmed01@northsouth.edu',
      program: 'B.Sc in Computer Science and Engineering',
      standing: 'Senior Standing',
      creditsCompleted: 96,
      creditsTotal: 130,
      cgpa: 3.64,
      cartToken: '#NSU-241215-9042',
      clearedCourses: const [
        ClearedCourse(code: 'CSE 115', grade: 'A'),
        ClearedCourse(code: 'CSE 215', grade: 'A'),
        ClearedCourse(code: 'CSE 311', grade: 'A-'),
        ClearedCourse(code: 'CSE 231', grade: 'B+'),
      ],
      advisingClearedBy: 'Dr. Nova Ahmed',
      slotClosesAt:
          DateTime.now().add(const Duration(seconds: 8074)).toIso8601String(),
      maxCredits: 15.0,
    );
  }

  // Canonical Seed Alignment with services/api/src/seedData.ts
  static const List<CourseSection> _seedSections = [
    CourseSection(
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
      roomCap: 55,
      capacity: 40,
      enrolled: 28,
      prerequisites: ['CSE 215'],
      examSlot: '2025-05-10T09:00:00Z',
      badge: 'Recommended',
    ),
    CourseSection(
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
      roomCap: 50,
      capacity: 40,
      enrolled: 36,
      prerequisites: ['CSE 215'],
      examSlot: '2025-05-10T09:00:00Z',
      badge: '4 Seats Left',
    ),
    CourseSection(
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
      roomCap: 55,
      capacity: 40,
      enrolled: 40,
      waitlisted: 14,
      prerequisites: ['CSE 215'],
      examSlot: '2025-05-10T09:00:00Z',
      badge: 'Full (40/40)',
    ),
    CourseSection(
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
      roomCap: 55,
      capacity: 40,
      enrolled: 21,
      prerequisites: ['CSE 215'],
      examSlot: '2025-05-10T09:00:00Z',
      badge: 'Evening Slot',
    ),
    CourseSection(
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
      roomCap: 50,
      capacity: 40,
      enrolled: 37,
      prerequisites: ['CSE 215'],
      examSlot: '2025-05-11T14:00:00Z',
      badge: '3 Seats Left',
    ),
    CourseSection(
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
      roomCap: 45,
      capacity: 35,
      enrolled: 27,
      prerequisites: ['CSE 215'],
      isLab: true,
      examSlot: '2025-05-13T09:00:00Z',
      badge: '8 Open',
    ),
    CourseSection(
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
      roomCap: 50,
      capacity: 40,
      enrolled: 18,
      prerequisites: ['MAT 120'],
      examSlot: '2025-05-14T09:00:00Z',
      badge: '22 Open',
    ),
    CourseSection(
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
      roomCap: 55,
      capacity: 40,
      enrolled: 35,
      prerequisites: ['CSE 231'],
      examSlot: '2025-05-10T14:00:00Z',
      badge: '5 Seats Left',
    ),
    CourseSection(
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
      roomCap: 55,
      capacity: 40,
      enrolled: 40,
      waitlisted: 10,
      minCreditsRequired: 100,
      prerequisites: ['CSE 215', 'CSE 311'],
      examSlot: '2025-05-10T19:00:00Z',
      badge: 'Full (40/40)',
    ),
  ];

  // Canonical 4 staged sections = 10.0 Cr
  static const List<String> _seedStagedIds = [
    'CSE327-01',
    'CSE311-03',
    'CSE311L-02',
    'MAT361-04',
  ];

  static const List<ExceptionCase> _seedExceptions = [
    ExceptionCase(
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
      status: PetitionStatus.pending,
      statement:
          'I require CSE 425 this semester to complete my Systems Track capstone prerequisite chain before Fall 2025 graduation.',
    ),
    ExceptionCase(
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
      status: PetitionStatus.pending,
      statement:
          'Section 03 fits my thesis scheduling window with Prof. Rajesh Palit.',
    ),
    ExceptionCase(
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
      status: PetitionStatus.pending,
      statement:
          'Graduating senior needs concurrent registration with CSE 231 lab.',
    ),
  ];

  static const List<BypassRule> _seedBypassRules = [
    BypassRule(
      id: 'rule-4-2',
      code: 'RULE-4.2',
      title: 'Senior Standing Credit Floor Exception',
      description:
          'Allows students with >= 94 credits to register for 400-level courses with advisor consent.',
      category: 'Standing',
      enabled: true,
      lastUpdated: 'Spring 2025 Regular Senate',
    ),
    BypassRule(
      id: 'rule-2-1',
      code: 'RULE-2.1',
      title: 'Prerequisite Co-Registration Exemption',
      description:
          'Permits concurrent enrollment in theory and pre-requisite lab during terminal semesters.',
      category: 'Prerequisite',
      enabled: true,
      lastUpdated: 'ECE Academic Council 2024',
    ),
    BypassRule(
      id: 'rule-6-3',
      code: 'RULE-6.3',
      title: 'Consecutive Exam Load Rebalancer',
      description:
          'Prevents automated placement if student has 3 consecutive final exams in 24 hours.',
      category: 'Exam Load',
      enabled: false,
      lastUpdated: 'Suspended for Phase 2 Add/Drop',
    ),
    BypassRule(
      id: 'rule-8-4',
      code: 'RULE-8.4',
      title: 'Department Head +10 Seat Override',
      description:
          'Authorizes departmental expansion up to physical room fire code limits.',
      category: 'Capacity',
      enabled: true,
      lastUpdated: 'Office of Registrar Directives',
    ),
  ];

  static const List<WaitlistEntry> _seedWaitlist = [
    WaitlistEntry(
      id: 'wl-seed-1',
      studentId: '2321450042',
      sectionId: 'CSE327-03',
      courseCode: 'CSE 327',
      position: 14,
      createdAt: 'Today 08:15 AM',
      status: 'waiting',
    ),
    WaitlistEntry(
      id: 'wl-seed-2',
      studentId: '2211290042',
      sectionId: 'CSE425-01',
      courseCode: 'CSE 425',
      position: 10,
      createdAt: 'Today 08:45 AM',
      status: 'waiting',
    ),
  ];

  static const List<PetitionItem> _seedOfflinePetitions = [
    PetitionItem(
      id: 'PET-327-01',
      courseCode: 'CSE 327',
      sectionNumber: '01',
      sectionId: 'CSE327-01',
      status: PetitionStatus.approved,
      submittedAt: 'Today 09:14 AM',
      rdsToken: '#NSU-241215-327A',
      note: 'Auto-Approved by DAG Engine (Prerequisite Cleared)',
    ),
    PetitionItem(
      id: 'CASE #EX-2025-0841',
      courseCode: 'CSE 425',
      sectionNumber: '01',
      sectionId: 'CSE425-01',
      ruleCode: 'RULE-4.2',
      category: 'Credit Standing',
      status: PetitionStatus.pending,
      submittedAt: 'Today 09:30 AM',
      note: 'Rule 4.2 Senior Standing Review by Dr. Nova Ahmed',
    ),
    PetitionItem(
      id: 'PET-361-02',
      courseCode: 'MAT 361',
      sectionNumber: '02',
      sectionId: 'MAT361-04',
      status: PetitionStatus.waitlisted,
      submittedAt: 'Yesterday 04:12 PM',
      waitlistPosition: 3,
      note: 'Waitlist Position #3 • Auto-Promotion Armed',
    ),
    PetitionItem(
      id: 'PET-331-01',
      courseCode: 'CSE 331',
      sectionNumber: '01',
      sectionId: 'CSE331-01',
      status: PetitionStatus.rejected,
      submittedAt: 'Yesterday 02:40 PM',
      note: 'Section Capacity Floor Exceeded. View 2 Alternative Open Sections.',
    ),
  ];

  static const List<AlertItem> _seedOfflineAlerts = [
    AlertItem(
      id: 'alt-1',
      title: 'SEAT DROP DETECTED',
      description: 'CSE 327 Sec 02 (Dr. Silvia Ahmed) has 1 open seat.',
      timeAgo: '2m ago',
      type: 'seat_drop',
      actionLabel: 'Claim Seat →',
      sectionId: 'CSE327-02',
      courseCode: 'CSE 327',
    ),
    AlertItem(
      id: 'alt-2',
      title: 'LAB TIME SLOT CONFIRMED',
      description: 'CSE 311L Sec 02 reserved in atomic lock buffer.',
      timeAgo: '8m ago',
      type: 'fast_enroll',
      actionLabel: 'Add to Cart',
      sectionId: 'CSE311L-02',
      courseCode: 'CSE 311L',
    ),
    AlertItem(
      id: 'alt-3',
      title: 'RULE 4.2 OVERRIDE LOGGED',
      description:
          'CSE 425 credit standing exception queued for chair sign-off.',
      timeAgo: '14m ago',
      type: 'rule_alert',
      actionLabel: 'Waitlist Hub',
      sectionId: 'CSE425-01',
      courseCode: 'CSE 425',
    ),
    AlertItem(
      id: 'alt-4',
      title: 'ADVISING CLEARANCE ACTIVE',
      description: 'Dr. Nova Ahmed approved your pre-advising track.',
      timeAgo: '28m ago',
      type: 'clearance',
      actionLabel: 'View Audit',
    ),
    AlertItem(
      id: 'alt-5',
      title: 'TELEMETRY PULSE: EDGE STABLE',
      description:
          'PostgreSQL RDS primary sync latency ≤12ms across NSU subnet.',
      timeAgo: '35m ago',
      type: 'clearance',
      actionLabel: 'System Status',
    ),
  ];

  // ================= GETTERS =================

  bool get isLoggedIn => _isLoggedIn;
  int get currentTab => _currentTab;
  bool get isMilestoneFirst => _isMilestoneFirst;
  ScheduleStrategy get strategy => _isMilestoneFirst
      ? ScheduleStrategy.milestoneFirst
      : ScheduleStrategy.minimizeGaps;
  bool get isOfflineMode => _isOfflineMode;
  bool get isLiveConnected => _isLiveConnected;
  bool get isSseFallback => _isSseFallback;
  bool get hasLiveMetrics => _hasLiveMetrics;
  bool get isLoading => _isLoading;
  String? get authError => _authError;
  String? get lastError => _lastError;
  AuthUser? get currentUser => _currentUser;

  StudentProfile get student => _student;
  String get studentName => _student.name;
  String get studentId => _student.id;
  String get standing => _student.standing;
  int get completedCredits => _student.creditsCompleted;
  int get totalDegreeCredits => _student.creditsTotal;
  double get cgpa => _student.cgpa;
  String get cartToken => _student.cartToken;
  double get maxCredits => _student.maxCredits;
  DateTime? get slotClosesAt => DateTime.tryParse(_student.slotClosesAt);

  List<CourseSection> get sections => List.unmodifiable(_sections);
  List<String> get stagedSectionIds => List.unmodifiable(_stagedSectionIds);
  List<ExceptionCase> get exceptions => List.unmodifiable(_exceptions);
  List<BypassRule> get bypassRules => List.unmodifiable(_bypassRules);
  List<AuditLogItem> get auditLog => List.unmodifiable(_auditLog);
  AdminMetrics get metrics => _metrics;
  List<EscalationItem> get escalations => List.unmodifiable(_escalations);
  ScheduleReceipt? get receipt => _receipt;
  List<NotificationItem> get notifications => List.unmodifiable(_notifications);
  List<String> get waitlistSectionIds => List.unmodifiable(_waitlistSectionIds);
  List<WaitlistEntry> get waitlistEntries => List.unmodifiable(_waitlistEntries);
  DagSummary? get dagSummary => _dagSummary;
  RdsFallbackPrompt? get rdsFallbackPrompt => _rdsFallbackPrompt;
  SolveScheduleResult? get lastSolveResult => _lastSolveResult;

  List<CourseSection> get stagedSections {
    final result = <CourseSection>[];
    for (final id in _stagedSectionIds) {
      final sec = findSectionById(id);
      if (sec != null) result.add(sec);
    }
    return List.unmodifiable(result);
  }

  List<StagedCourse> get stagedCourses {
    return stagedSections.map(StagedCourse.fromCourseSection).toList();
  }

  double get totalCredits =>
      stagedSections.fold(0.0, (sum, item) => sum + item.credits);

  List<ScheduleClash> get clashes {
    if (_serverClashes.isNotEmpty) return List.unmodifiable(_serverClashes);
    return DayCodeHelper.detectScheduleClashes(stagedSections);
  }

  List<PetitionItem> get petitions {
    if (!_hasLiveMetrics && _offlinePetitions.isNotEmpty) {
      return List.unmodifiable(_offlinePetitions);
    }
    final items = <PetitionItem>[];
    final sourceExceptions =
        _exceptions.where((e) => e.studentId == _student.id).toList();

    for (final ex in sourceExceptions) {
      items.add(
        ex.toPetitionItem(
          rdsToken: ex.status == PetitionStatus.approved
              ? (_receipt?.transactionId ?? '')
              : '',
        ),
      );
    }

    for (final wl in _waitlistEntries) {
      if (wl.studentId.isEmpty
          ? _waitlistSectionIds.contains(wl.sectionId)
          : wl.studentId == _student.id) {
        final sec = findSectionById(wl.sectionId);
        items.add(
          PetitionItem.fromWaitlistEntry(
            wl,
            sectionNumber: sec?.sectionNumber ?? '01',
          ),
        );
      }
    }
    return List.unmodifiable(items);
  }

  List<AlertItem> get alerts {
    if (!_hasLiveMetrics && _notifications.isEmpty) {
      return List.unmodifiable(_offlineAlerts);
    }
    return List.unmodifiable(
      _notifications.map((n) => n.toAlertItem()).toList(),
    );
  }

  CourseSection? findSectionById(String sectionId) {
    for (final sec in _sections) {
      if (sec.id == sectionId) return sec;
    }
    return null;
  }

  List<CourseSection> sectionsForCourse(String courseCode) {
    final normalized = DayCodeHelper.normalizeCourseCode(courseCode);
    return _sections
        .where((s) => DayCodeHelper.normalizeCourseCode(s.courseCode) == normalized)
        .toList();
  }

  List<CourseSection> alternativeSectionsFor(
    String courseCode, {
    String? excludeSectionId,
  }) {
    final normalized = DayCodeHelper.normalizeCourseCode(courseCode);
    return _sections
        .where(
          (s) =>
              DayCodeHelper.normalizeCourseCode(s.courseCode) == normalized &&
              s.id != excludeSectionId &&
              !s.isFull,
        )
        .toList();
  }

  DagNodeSummary? dagNodeFor(String courseCode) {
    final normalized = DayCodeHelper.normalizeCourseCode(courseCode);
    final nodes = _dagSummary?.nodes ?? const [];
    for (final node in nodes) {
      if (DayCodeHelper.normalizeCourseCode(node.code) == normalized) {
        return node;
      }
    }
    return null;
  }

  List<CourseItem> get catalogCourses {
    final grouped = <String, List<CourseSection>>{};
    for (final sec in _sections) {
      grouped.putIfAbsent(sec.courseCode, () => []).add(sec);
    }

    final dag = _dagSummary ?? _computeLocalDagSummary();
    final blockedMap = dag.blockedCourses;
    final items = <CourseItem>[];

    for (final entry in grouped.entries) {
      final code = entry.key;
      final secs = entry.value;
      final first = secs.first;
      final missingPrereqs = blockedMap[code] ?? const <String>[];
      final minCreds = first.minCreditsRequired;
      final belowCreditFloor =
          minCreds != null && _student.creditsCompleted < minCreds;
      final hasApprovedCreditWaiver = _exceptions.any(
        (ex) =>
            ex.status == PetitionStatus.approved &&
            ex.studentId == _student.id &&
            DayCodeHelper.normalizeCourseCode(ex.courseCode) ==
                DayCodeHelper.normalizeCourseCode(code) &&
            (ex.category == 'Credit Standing' || ex.ruleCode == 'RULE-4.2'),
      );
      final hasApprovedPrereqWaiver = _exceptions.any(
        (ex) =>
            ex.status == PetitionStatus.approved &&
            ex.studentId == _student.id &&
            DayCodeHelper.normalizeCourseCode(ex.courseCode) ==
                DayCodeHelper.normalizeCourseCode(code) &&
            (ex.category == 'Prereqs' || ex.ruleCode == 'RULE-2.1'),
      );
      final effectiveMissingPrereqs =
          hasApprovedPrereqWaiver ? const <String>[] : missingPrereqs;

      final isRuleBlocked = effectiveMissingPrereqs.isNotEmpty ||
          (belowCreditFloor && !hasApprovedCreditWaiver);
      final availCount = secs.where((s) => !s.isFull).length;

      String prereqNote = '';
      if (belowCreditFloor && !hasApprovedCreditWaiver) {
        prereqNote =
            '$minCreds+ Credits Required (You have ${_student.creditsCompleted} Cr)';
      } else if (effectiveMissingPrereqs.isNotEmpty) {
        prereqNote =
            'Missing Prerequisites: ${effectiveMissingPrereqs.join(', ')}';
      }

      String statusAction;
      if (isRuleBlocked) {
        statusAction = 'Prerequisites Not Met';
      } else if (secs.length > 1) {
        statusAction = 'Choose Section ($availCount Avail)';
      } else if (availCount == 0) {
        statusAction = 'Join Waitlist & Auto-Alert';
      } else {
        statusAction = 'Fast-Track Add Section';
      }

      items.add(
        CourseItem(
          code: code,
          title: first.courseTitle.isNotEmpty ? first.courseTitle : code,
          credits: first.credits,
          department: first.department,
          sections: secs,
          isEligible: !isRuleBlocked,
          isPrereqBlocked: isRuleBlocked,
          prereqNote: prereqNote,
          missingPrerequisites: effectiveMissingPrereqs,
          statusAction: statusAction,
        ),
      );
    }
    return items;
  }

  // ================= ACTIONS =================

  Future<bool> login(String id, String pass) async {
    final trimmedId = id.trim().isEmpty ? _student.id : id.trim();
    final effectivePass =
        pass == '••••••••••••' ? 'SmartAdvisor2025!' : pass;

    _authError = null;
    _lastError = null;

    if (!_useNetwork) {
      _isLoggedIn = true;
      _isOfflineMode = true;
      _safeNotify();
      return true;
    }

    _isLoading = true;
    _safeNotify();

    try {
      final res = await _apiClient.login(
        id: trimmedId,
        password: effectivePass,
        role: UserRole.student,
      );
      if (_disposed) return false;

      _currentUser = res.user;
      _isLoggedIn = true;
      _isOfflineMode = false;
      _safeNotify();

      await refreshBootstrap();
      if (_disposed) return false;

      if (_enableRealtime) {
        unawaited(_apiClient.connectRealtime(studentId: res.user.id));
      }
      return true;
    } on ApiException catch (e) {
      if (_disposed) return false;
      _isLoggedIn = false;
      _authError = e.message;
      return false;
    } on NetworkUnavailableException {
      if (_disposed) return false;
      if (trimmedId == '2412159042' && effectivePass == 'SmartAdvisor2025!') {
        _isLoggedIn = true;
        _isOfflineMode = true;
        _authError = null;
        return true;
      }
      _isLoggedIn = false;
      _authError = 'Unable to reach SmartAdvisor server. Check connection.';
      return false;
    } on FormatException catch (e) {
      if (_disposed) return false;
      _isLoggedIn = false;
      _authError = 'Unexpected server response: ${e.message}';
      return false;
    } catch (e) {
      if (_disposed) return false;
      _isLoggedIn = false;
      _authError = 'Authentication failed: $e';
      return false;
    } finally {
      if (!_disposed) {
        _isLoading = false;
        _safeNotify();
      }
    }
  }

  Future<void> logout() async {
    if (_useNetwork) {
      try {
        await _apiClient.logout();
      } catch (_) {}
    }
    if (_disposed) return;
    _isLoggedIn = false;
    _currentTab = 0;
    _isLoading = false;
    _currentUser = null;
    _isLiveConnected = false;
    _isSseFallback = false;
    _hasLiveMetrics = false;
    _isOfflineMode = !_useNetwork;
    _student = _createSeedStudent();
    _sections = List<CourseSection>.from(_seedSections);
    _stagedSectionIds = List<String>.from(_seedStagedIds);
    _exceptions = List<ExceptionCase>.from(_seedExceptions);
    _bypassRules = List<BypassRule>.from(_seedBypassRules);
    _auditLog = const [];
    _metrics = const AdminMetrics(p95LatencyMs: 12);
    _escalations = const [];
    _receipt = null;
    _notifications = const [];
    _waitlistSectionIds = const ['CSE327-03', 'CSE425-01'];
    _waitlistEntries = List<WaitlistEntry>.from(_seedWaitlist);
    _rdsFallbackPrompt = null;
    _lastSolveResult = null;
    _serverClashes = const [];
    _offlinePetitions
      ..clear()
      ..addAll(_seedOfflinePetitions);
    _offlineAlerts
      ..clear()
      ..addAll(_seedOfflineAlerts);
    _dagSummary = _computeLocalDagSummary();
    _lastError = null;
    _authError = null;
    _safeNotify();
  }

  void setTab(int index) {
    _currentTab = index;
    _safeNotify();
  }

  Future<void> refreshBootstrap() async {
    if (!_useNetwork || _disposed) return;
    try {
      final state = await _apiClient.getBootstrap();
      if (_disposed) return;
      _applyBackendState(state);
      _isOfflineMode = false;
      _lastError = null;
      _safeNotify();
    } on NetworkUnavailableException catch (e) {
      if (_disposed) return;
      _isOfflineMode = true;
      _lastError = e.message;
      _safeNotify();
    } on ApiException catch (e) {
      if (_disposed) return;
      _lastError = e.message;
      _safeNotify();
    }
  }

  Future<void> reconnectRealtimeAndSync() async {
    if (!_useNetwork || _disposed) return;
    await refreshBootstrap();
    if (_disposed) return;
    if (_enableRealtime) {
      await _apiClient.connectRealtime(studentId: _student.id);
    }
  }

  Future<void> toggleStrategy(
    bool milestone, {
    bool applyToCart = false,
  }) async {
    _isMilestoneFirst = milestone;
    _safeNotify();
    await solveSchedule(strategy: strategy, applyToCart: applyToCart);
  }

  Future<SolveScheduleResult?> solveSchedule({
    ScheduleStrategy? strategy,
    List<String>? courseCodes,
    double? maxCredits,
    bool applyToCart = false,
  }) async {
    final targetStrategy = strategy ?? this.strategy;
    _isMilestoneFirst = targetStrategy == ScheduleStrategy.milestoneFirst;

    SolveScheduleResult? result;

    if (_useNetwork && !_isOfflineMode) {
      try {
        result = await _apiClient.solveSchedule(
          courseCodes: courseCodes,
          strategy: targetStrategy,
          maxCredits: maxCredits ?? _student.maxCredits,
        );
        if (_disposed) return null;
      } on NetworkUnavailableException {
        if (_disposed) return null;
        _isOfflineMode = true;
      } on ApiException catch (e) {
        if (_disposed) return null;
        _lastError = e.message;
        _safeNotify();
        return null;
      }
    }

    result ??= _solveLocally(
      strategy: targetStrategy,
      courseCodes: courseCodes,
      maxCredits: maxCredits ?? _student.maxCredits,
    );

    _lastSolveResult = result;
    if (applyToCart && result.recommendedSectionIds.isNotEmpty) {
      if (_useNetwork && !_isOfflineMode) {
        for (final existingId in List<String>.from(_stagedSectionIds)) {
          if (!result.recommendedSectionIds.contains(existingId)) {
            await unstageSection(existingId);
          }
        }
        for (final recId in result.recommendedSectionIds) {
          if (!_stagedSectionIds.contains(recId)) {
            await stageSection(recId);
          }
        }
      } else {
        _stagedSectionIds = List<String>.from(result.recommendedSectionIds);
        _serverClashes = const [];
      }
    }
    _safeNotify();
    return result;
  }

  Future<StageResult> stageSection(String sectionId) async {
    _lastError = null;
    if (_useNetwork && !_isOfflineMode) {
      try {
        final result = await _apiClient.stageSection(sectionId);
        if (_disposed) return result;
        if (result.isStaged && result.state != null) {
          _applyBackendState(result.state!);
          _safeNotify();
        }
        return result;
      } on NetworkUnavailableException {
        if (_disposed) return StageResult.error('Disposed');
        _isOfflineMode = true;
      } on ApiException catch (e) {
        if (_disposed) return StageResult.error(e.message);
        _lastError = e.message;
        _safeNotify();
        return StageResult.error(e.message);
      }
    }

    return _stageLocally(sectionId);
  }

  /// Compatibility wrapper for existing callers.
  bool addStagedCourse(StagedCourse course) {
    final targetId = course.resolvedSectionId;
    if (_useNetwork && !_isOfflineMode) {
      unawaited(stageSection(targetId));
      return true;
    }
    final res = _stageLocally(targetId, fallbackCourse: course);
    return res.isStaged;
  }

  Future<void> unstageSection(String sectionId) async {
    if (_useNetwork && !_isOfflineMode) {
      try {
        final state = await _apiClient.unstageSection(sectionId);
        if (_disposed) return;
        _applyBackendState(state);
        _safeNotify();
        return;
      } on NetworkUnavailableException {
        if (_disposed) return;
        _isOfflineMode = true;
      } on ApiException catch (e) {
        if (_disposed) return;
        _lastError = e.message;
        _safeNotify();
        return;
      }
    }

    _stagedSectionIds.remove(sectionId);
    _serverClashes = const [];
    _safeNotify();
  }

  void removeStagedCourse(String courseCode) {
    final normalized = DayCodeHelper.normalizeCourseCode(courseCode);
    final matching = _stagedSectionIds.where((id) {
      final sec = findSectionById(id);
      return sec != null &&
          DayCodeHelper.normalizeCourseCode(sec.courseCode) == normalized;
    }).toList();

    for (final id in matching) {
      unawaited(unstageSection(id));
    }
  }

  Future<ExceptionCase?> submitPetition({
    String? sectionId,
    required String courseCode,
    required String ruleCode,
    required String reason,
  }) async {
    final trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      _lastError = 'Petition reason must be at least 5 characters.';
      _safeNotify();
      return null;
    }

    if (_useNetwork && !_isOfflineMode) {
      try {
        final res = await _apiClient.submitPetition(
          sectionId: sectionId,
          courseCode: courseCode,
          ruleCode: ruleCode,
          reason: trimmedReason,
        );
        if (_disposed) return null;
        _applyBackendState(res.state);
        _safeNotify();
        return res.exceptionCase;
      } on NetworkUnavailableException {
        if (_disposed) return null;
        _isOfflineMode = true;
      } on ApiException catch (e) {
        if (_disposed) return null;
        _lastError = e.message;
        _safeNotify();
        return null;
      }
    }

    final sec = sectionId != null ? findSectionById(sectionId) : null;
    final newCase = ExceptionCase(
      id: 'CASE #EX-${DateTime.now().millisecondsSinceEpoch % 10000}',
      studentId: _student.id,
      studentName: _student.name,
      program: _student.program,
      standing: _student.standing,
      cgpa: _student.cgpa,
      creditsCompleted: _student.creditsCompleted,
      courseCode: courseCode,
      courseTitle: sec?.courseTitle ?? courseCode,
      sectionNumber: sec?.sectionNumber ?? '01',
      category: ruleCode == 'RULE-4.2'
          ? 'Credit Standing'
          : ruleCode == 'RULE-8.4'
              ? 'Capacity'
              : 'Prereqs',
      submittedAt: 'Just Now',
      status: PetitionStatus.pending,
      statement: trimmedReason,
      sectionId: sectionId,
      ruleCode: ruleCode,
    );
    _exceptions = [newCase, ..._exceptions];
    _offlinePetitions.insert(0, newCase.toPetitionItem());
    _safeNotify();
    return newCase;
  }

  /// Compatibility wrapper.
  void addPetition(PetitionItem petition) {
    _offlinePetitions.insert(0, petition);
    _safeNotify();
  }

  Future<WaitlistEntry?> joinWaitlist(String sectionId) async {
    if (_useNetwork && !_isOfflineMode) {
      try {
        final res = await _apiClient.joinWaitlist(sectionId);
        if (_disposed) return null;
        _applyBackendState(res.state);
        _safeNotify();
        return res.entry;
      } on NetworkUnavailableException {
        if (_disposed) return null;
        _isOfflineMode = true;
      } on ApiException catch (e) {
        if (_disposed) return null;
        _lastError = e.message;
        _safeNotify();
        return null;
      }
    }

    final sec = findSectionById(sectionId);
    final pos = (sec?.waitlisted ?? 0) + 1;
    final entry = WaitlistEntry(
      id: 'wl-${DateTime.now().millisecondsSinceEpoch}',
      studentId: _student.id,
      sectionId: sectionId,
      courseCode: sec?.courseCode ?? sectionId,
      position: pos,
      createdAt: 'Just Now',
      status: 'waiting',
    );

    if (!_waitlistSectionIds.contains(sectionId)) {
      _waitlistSectionIds = [..._waitlistSectionIds, sectionId];
    }
    _waitlistEntries = [entry, ..._waitlistEntries];
    _offlinePetitions.insert(
      0,
      PetitionItem.fromWaitlistEntry(
        entry,
        sectionNumber: sec?.sectionNumber ?? '01',
      ),
    );
    _safeNotify();
    return entry;
  }

  Future<EnrollConfirmResult> confirmEnrollment({
    bool simulateRdsFailure = false,
  }) async {
    _lastError = null;
    if (_useNetwork && !_isOfflineMode) {
      try {
        final res = await _apiClient.confirmEnrollment(
          simulateRdsFailure: simulateRdsFailure,
        );
        if (_disposed) return res;
        if (res.state != null) {
          _applyBackendState(res.state!);
        }
        if (res.receipt != null) {
          _receipt = res.receipt;
        }
        if (res.fallbackPrompt != null) {
          _rdsFallbackPrompt = res.fallbackPrompt;
        }
        _safeNotify();
        return res;
      } on NetworkUnavailableException {
        if (_disposed) {
          return const EnrollConfirmResult(ok: false, message: 'Disposed');
        }
        _isOfflineMode = true;
      } on ApiException catch (e) {
        if (_disposed) {
          return EnrollConfirmResult(ok: false, message: e.message);
        }
        _lastError = e.message;
        _safeNotify();
        return EnrollConfirmResult(ok: false, message: e.message);
      }
    }

    if (clashes.isNotEmpty) {
      final msg =
          'Cannot confirm enrollment: ${clashes.length} timetable clash(es) detected.';
      _lastError = msg;
      _safeNotify();
      return EnrollConfirmResult(ok: false, message: msg);
    }

    if (stagedSections.isEmpty) {
      const msg = 'No courses staged in advising cart.';
      _lastError = msg;
      _safeNotify();
      return const EnrollConfirmResult(ok: false, message: msg);
    }

    if (simulateRdsFailure) {
      final failed = stagedSections.first;
      final alts = alternativeSectionsFor(
        failed.courseCode,
        excludeSectionId: failed.id,
      );
      final prompt = RdsFallbackPrompt(
        id: 'fb-${DateTime.now().millisecondsSinceEpoch}',
        failedSectionId: failed.id,
        failedCourseCode: failed.courseCode,
        reason: 'RDS live seat lock rejected ${failed.id} during push.',
        alternatives: alts,
        createdAt: DateTime.now().toIso8601String(),
      );
      _rdsFallbackPrompt = prompt;
      _safeNotify();
      return EnrollConfirmResult(
        ok: true,
        fallbackPrompt: prompt,
      );
    }

    final txnHex = (DateTime.now().millisecondsSinceEpoch & 0xFFFFFFFF)
        .toRadixString(16)
        .toUpperCase()
        .padLeft(8, '0');
    final receipt = ScheduleReceipt(
      transactionId: '#RDS-TXN-$txnHex',
      studentId: _student.id,
      cartToken: _student.cartToken,
      timestamp: DateTime.now().toIso8601String(),
      totalCredits: totalCredits,
      sections: stagedSections,
      digitalSignature: 'SHA256:${txnHex * 8}',
      status: 'confirmed',
      source: 'api',
    );
    _receipt = receipt;
    _safeNotify();
    return EnrollConfirmResult(ok: true, receipt: receipt);
  }

  Future<EnrollConfirmResult> resolveRdsFallback({
    required String failedSectionId,
    required String fallbackSectionId,
  }) async {
    _lastError = null;
    if (_useNetwork && !_isOfflineMode) {
      try {
        final res = await _apiClient.resolveRdsFallback(
          failedSectionId: failedSectionId,
          fallbackSectionId: fallbackSectionId,
        );
        if (_disposed) return res;
        if (res.state != null) {
          _applyBackendState(res.state!);
        }
        if (res.receipt != null) {
          _receipt = res.receipt;
        }
        _rdsFallbackPrompt = null;
        _safeNotify();
        return res;
      } on NetworkUnavailableException {
        if (_disposed) {
          return const EnrollConfirmResult(ok: false, message: 'Disposed');
        }
        _isOfflineMode = true;
      } on ApiException catch (e) {
        if (_disposed) {
          return EnrollConfirmResult(ok: false, message: e.message);
        }
        _lastError = e.message;
        _safeNotify();
        return EnrollConfirmResult(ok: false, message: e.message);
      }
    }

    final updated = List<String>.from(_stagedSectionIds);
    final idx = updated.indexOf(failedSectionId);
    if (idx >= 0) {
      updated[idx] = fallbackSectionId;
    } else if (!updated.contains(fallbackSectionId)) {
      updated.add(fallbackSectionId);
    }
    _stagedSectionIds = updated;
    _serverClashes = const [];
    _rdsFallbackPrompt = null;
    return confirmEnrollment();
  }

  void dismissAlert(String id) {
    _offlineAlerts.removeWhere((a) => a.id == id);
    _notifications = _notifications.where((n) => n.id != id).toList();
    _safeNotify();
  }

  // ================= INTERNAL SYNC & LOCAL FALLBACKS =================

  void _handleSyncEvent(SyncEvent event) {
    if (_disposed) return;
    if (event.state != null) {
      _applyBackendState(event.state!);
    }
    if (event.type == 'RDS_FALLBACK' && event.payload != null) {
      _rdsFallbackPrompt = RdsFallbackPrompt.fromJson(event.payload!);
    } else if (event.type == 'NOTIFICATION' && event.payload != null) {
      final notif = NotificationItem.fromJson(event.payload!);
      final existing = _notifications.any((n) => n.id == notif.id);
      if (!existing) {
        _notifications = [notif, ..._notifications];
      }
    }
    _isOfflineMode = false;
    _safeNotify();
  }

  void _applyBackendState(BackendState state) {
    _student = state.student;
    if (state.sections.isNotEmpty) {
      _sections = state.sections;
    }
    _stagedSectionIds = List<String>.from(state.stagedSectionIds);
    _serverClashes = state.clashes;
    _exceptions = state.exceptions;
    _bypassRules = state.bypassRules;
    _auditLog = state.auditLog;
    _metrics = state.metrics;
    _hasLiveMetrics = true;
    _escalations = state.escalations;
    _receipt = state.receipt;
    _notifications = state.notifications;
    _waitlistSectionIds = state.waitlistSectionIds;
    _waitlistEntries = state.waitlistEntries;
    _dagSummary = state.dagSummary ?? _computeLocalDagSummary();
    _rdsFallbackPrompt = state.rdsFallbackPrompt;
  }

  StageResult _stageLocally(String sectionId, {StagedCourse? fallbackCourse}) {
    var sec = findSectionById(sectionId);
    if (sec == null && fallbackCourse != null) {
      sec = CourseSection(
        id: sectionId,
        courseCode: fallbackCourse.courseCode,
        courseTitle: fallbackCourse.courseCode,
        credits: fallbackCourse.credits,
        sectionNumber: fallbackCourse.sectionNumber,
        faculty: fallbackCourse.faculty,
        days: fallbackCourse.days,
        timeSlot: fallbackCourse.timeSlot,
        room: fallbackCourse.room,
        capacity: 40,
        enrolled: 20,
      );
      _sections = [..._sections, sec];
    }

    if (sec == null) {
      return StageResult.error('Section $sectionId not found');
    }

    if (_stagedSectionIds.contains(sec.id)) {
      return StageResult.staged(section: sec);
    }

    final minCreds = sec.minCreditsRequired;
    final normalizedCourse = DayCodeHelper.normalizeCourseCode(sec.courseCode);
    final hasCreditWaiver = _exceptions.any(
      (ex) =>
          ex.status == PetitionStatus.approved &&
          ex.studentId == _student.id &&
          DayCodeHelper.normalizeCourseCode(ex.courseCode) ==
              normalizedCourse &&
          (ex.category == 'Credit Standing' || ex.ruleCode == 'RULE-4.2'),
    );
    final isRule42Enabled = _bypassRules.any(
      (rule) =>
          (rule.id == 'rule-4-2' || rule.code == 'RULE-4.2') && rule.enabled,
    );
    if (minCreds != null &&
        _student.creditsCompleted < minCreds &&
        !hasCreditWaiver) {
      return StageResult.ruleAlert(
        section: sec,
        ruleCode: 'RULE-4.2',
        studentCredits: _student.creditsCompleted,
        requiredCredits: minCreds,
        overrideEligible: isRule42Enabled && _student.creditsCompleted >= 94,
      );
    }

    final hasPrereqWaiver = _exceptions.any(
      (ex) =>
          ex.status == PetitionStatus.approved &&
          ex.studentId == _student.id &&
          DayCodeHelper.normalizeCourseCode(ex.courseCode) ==
              normalizedCourse &&
          (ex.category == 'Prereqs' || ex.ruleCode == 'RULE-2.1'),
    );
    final isRule21Active = _bypassRules.any(
      (rule) =>
          (rule.id == 'rule-2-1' || rule.code == 'RULE-2.1') && rule.enabled,
    );
    if (!isRule21Active && !hasPrereqWaiver) {
      final clearedSet = _student.clearedCourses
          .map((c) => DayCodeHelper.normalizeCourseCode(c.code))
          .toSet();
      final missingPrereqs = sec.prerequisites
          .where(
            (p) => !clearedSet.contains(DayCodeHelper.normalizeCourseCode(p)),
          )
          .toList();
      if (missingPrereqs.isNotEmpty) {
        return StageResult.ruleAlert(
          section: sec,
          ruleCode: 'RULE-2.1',
          missingPrerequisites: missingPrereqs,
        );
      }
    }

    if (sec.isFull) {
      return StageResult.sectionFull(
        fullSection: sec,
        alternatives: alternativeSectionsFor(
          sec.courseCode,
          excludeSectionId: sec.id,
        ),
        message: 'Section ${sec.id} is full.',
      );
    }

    // Replace existing section of same course if already staged
    _stagedSectionIds.removeWhere((id) {
      final existing = findSectionById(id);
      return existing != null &&
          DayCodeHelper.normalizeCourseCode(existing.courseCode) ==
              normalizedCourse;
    });

    if (!_stagedSectionIds.contains(sec.id)) {
      _stagedSectionIds.add(sec.id);
    }
    _serverClashes = const [];
    _safeNotify();
    return StageResult.staged(section: sec);
  }

  DagSummary _computeLocalDagSummary() {
    final clearedSet = _student.clearedCourses
        .map((c) => DayCodeHelper.normalizeCourseCode(c.code))
        .toSet();
    final seenCodes = <String>{};
    final eligible = <String>[];
    final blocked = <String, List<String>>{};
    final nodes = <DagNodeSummary>[];

    for (final sec in _sections) {
      final norm = DayCodeHelper.normalizeCourseCode(sec.courseCode);
      if (!seenCodes.add(norm)) continue;
      final missing = sec.prerequisites
          .where((p) => !clearedSet.contains(DayCodeHelper.normalizeCourseCode(p)))
          .toList();
      final isCleared = clearedSet.contains(norm);
      final isEligible = missing.isEmpty &&
          (sec.minCreditsRequired == null ||
              _student.creditsCompleted >= sec.minCreditsRequired!);

      if (isEligible && !isCleared) {
        eligible.add(sec.courseCode);
      } else if (missing.isNotEmpty) {
        blocked[sec.courseCode] = missing;
      }

      nodes.add(
        DagNodeSummary(
          code: sec.courseCode,
          title: sec.courseTitle,
          credits: sec.credits,
          prerequisites: sec.prerequisites,
          eligible: isEligible,
          cleared: isCleared,
          missingPrerequisites: missing,
        ),
      );
    }

    return DagSummary(
      eligibleCourses: eligible,
      blockedCourses: blocked,
      criticalPath: const ['CSE 115', 'CSE 215', 'CSE 311', 'CSE 425'],
      hasCycle: false,
      nodes: nodes,
    );
  }

  SolveScheduleResult _solveLocally({
    required ScheduleStrategy strategy,
    List<String>? courseCodes,
    double maxCredits = 15.0,
  }) {
    final clearedSet = _student.clearedCourses
        .map((c) => DayCodeHelper.normalizeCourseCode(c.code))
        .toSet();

    final selected = <CourseSection>[];
    var credits = 0.0;
    final byCourse = <String, List<CourseSection>>{};

    for (final sec in _sections) {
      if (sec.isFull) continue;
      if (sec.minCreditsRequired != null &&
          _student.creditsCompleted < sec.minCreditsRequired!) {
        continue;
      }
      final missing = sec.prerequisites.any(
        (p) => !clearedSet.contains(DayCodeHelper.normalizeCourseCode(p)),
      );
      if (missing) continue;
      final norm = DayCodeHelper.normalizeCourseCode(sec.courseCode);
      if (courseCodes != null &&
          courseCodes.isNotEmpty &&
          !courseCodes.any(
            (c) => DayCodeHelper.normalizeCourseCode(c) == norm,
          )) {
        continue;
      }
      if (courseCodes == null && clearedSet.contains(norm)) continue;
      byCourse.putIfAbsent(norm, () => []).add(sec);
    }

    for (final entry in byCourse.entries) {
      final options = List<CourseSection>.from(entry.value);
      if (strategy == ScheduleStrategy.minimizeGaps) {
        options.sort((a, b) {
          final daysA = DayCodeHelper.expandDayCodes(a.days);
          final daysB = DayCodeHelper.expandDayCodes(b.days);
          final existingDays = selected
              .expand((s) => DayCodeHelper.expandDayCodes(s.days))
              .toSet();
          final overlapA = daysA.where(existingDays.contains).length;
          final overlapB = daysB.where(existingDays.contains).length;
          return overlapB.compareTo(overlapA);
        });
      } else {
        options.sort((a, b) => b.availableSeats.compareTo(a.availableSeats));
      }

      for (final candidate in options) {
        if (credits + candidate.credits > maxCredits + 1e-6) continue;
        final clashesWithSelected = selected.any(
          (s) => DayCodeHelper.sectionsClash(s, candidate),
        );
        if (!clashesWithSelected) {
          selected.add(candidate);
          credits += candidate.credits;
          break;
        }
      }
    }

    return SolveScheduleResult(
      ok: true,
      recommendedSectionIds: selected.map((s) => s.id).toList(),
      sections: selected,
      totalCredits: credits,
      clashes: DayCodeHelper.detectScheduleClashes(selected),
      strategy: strategy,
    );
  }

  void _safeNotify() {
    if (!_disposed) {
      notifyListeners();
    }
  }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    unawaited(_syncSub?.cancel());
    _syncSub = null;
    unawaited(_connSub?.cancel());
    _connSub = null;
    _apiClient.dispose();
    super.dispose();
  }
}
