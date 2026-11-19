import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smartadvisor_mobile/main.dart';
import 'package:smartadvisor_mobile/models/models.dart';
import 'package:smartadvisor_mobile/screens/alerts_screen.dart';
import 'package:smartadvisor_mobile/screens/course_catalog_screen.dart';
import 'package:smartadvisor_mobile/screens/course_detail_screen.dart';
import 'package:smartadvisor_mobile/screens/home_dashboard_screen.dart';
import 'package:smartadvisor_mobile/screens/login_screen.dart';
import 'package:smartadvisor_mobile/services/api_client.dart';
import 'package:smartadvisor_mobile/state/app_state.dart';
import 'package:smartadvisor_mobile/widgets/bottom_sheets.dart';

void main() {
  testWidgets(
      'Dynamic 6-day schedule renders RA Thu/Sat slots & live clash count',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final appState = AppState(initialLoggedIn: true, initialTab: 1);
    addTearDown(appState.dispose);

    await tester.pumpWidget(SmartAdvisorApp(appState: appState));
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('5-DAY TIMETABLE PREVIEW'), findsOneWidget);
    expect(find.text('Sat'), findsOneWidget);
    expect(find.text('0 Clash'), findsOneWidget);

    // Stage CSE 327 Sec 04 (RA 04:20 PM - 05:50 PM) -> switches to 6-DAY preview
    await appState.stageSection('CSE327-04');
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('6-DAY TIMETABLE PREVIEW'), findsOneWidget);
    expect(find.text('0 Clash'), findsOneWidget);

    // Stage a clashing RA morning section against CSE 311L (Thu 09:40 AM)
    appState.addStagedCourse(
      const StagedCourse(
        sectionId: 'CSE999-01',
        courseCode: 'CSE 999',
        sectionNumber: '01',
        faculty: 'Test Faculty',
        days: 'RA',
        timeSlot: '09:40 AM - 11:10 AM',
        room: 'SAC 301',
        credits: 3.0,
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('1 Clash'), findsOneWidget);
    expect(find.text('TIMETABLE CLASH DETECTED'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Catalog, Petitions, and Alerts filter chips filter accurately',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final appState = AppState(initialLoggedIn: true, initialTab: 2);
    addTearDown(appState.dispose);

    await tester.pumpWidget(SmartAdvisorApp(appState: appState));
    await tester.pump(const Duration(milliseconds: 200));

    // Petitions Screen filter pills
    expect(find.text('CSE 327 Sec 01'), findsOneWidget);
    expect(find.text('CSE 425 Sec 01'), findsOneWidget);

    await tester.tap(find.text('Approved 1'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('CSE 327 Sec 01'), findsOneWidget);
    expect(find.text('CSE 425 Sec 01'), findsNothing);

    await tester.ensureVisible(find.text('Pending 1'));
    await tester.pump();
    await tester.tap(find.text('Pending 1'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('CSE 425 Sec 01'), findsOneWidget);
    expect(find.text('CSE 327 Sec 01'), findsNothing);

    // Switch to Alerts tab and verify Seats vs Decisions filter chips
    appState.setTab(3);
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('SEAT DROP DETECTED'), findsOneWidget);
    expect(find.text('RULE 4.2 OVERRIDE LOGGED'), findsOneWidget);

    await tester.tap(find.text('Seats 2'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('SEAT DROP DETECTED'), findsOneWidget);
    expect(find.text('RULE 4.2 OVERRIDE LOGGED'), findsNothing);

    await tester.ensureVisible(find.text('Decisions 3'));
    await tester.pump();
    await tester.tap(find.text('Decisions 3'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('RULE 4.2 OVERRIDE LOGGED'), findsOneWidget);
    expect(find.text('SEAT DROP DETECTED'), findsNothing);

    // Course Catalog filters ('Eligible for me' & 'Available Seats')
    await tester.pumpWidget(
      MaterialApp(home: CourseCatalogScreen(appState: appState)),
    );
    await tester.pump(const Duration(milliseconds: 200));
    await tester.scrollUntilVisible(
      find.text('CSE 425'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('CSE 425'), findsOneWidget);

    await tester.tap(find.text('Eligible for me'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('CSE 425'), findsNothing);

    await tester.ensureVisible(find.text('Available Seats'));
    await tester.pump();
    await tester.tap(find.text('Available Seats'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('CSE 425'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('CSE 327'),
      -200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('CSE 327'), findsOneWidget);

    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'Rule 4.2 petition, Section Full waitlist & 1-Click RDS Fallback on 360dp',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final appState = AppState(initialLoggedIn: true, initialTab: 0);
    addTearDown(appState.dispose);

    // 1. Course Detail Screen for CSE 327 (360dp overflow check + full sec fallback)
    await tester.pumpWidget(
      MaterialApp(
        home: CourseDetailScreen(appState: appState, courseCode: 'CSE 327'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('CSE 327 • Section Picker'), findsOneWidget);
    expect(find.text('CSE 215'), findsOneWidget);
    expect(tester.takeException(), isNull);

    // 2. Open 1-Click RDS Fallback sheet and resolve via alternative
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () {
                  MobileBottomSheets.showRdsFallbackSheet(
                    context,
                    prompt: RdsFallbackPrompt(
                      id: 'fb-ui-1',
                      failedSectionId: 'CSE327-01',
                      failedCourseCode: 'CSE 327',
                      reason: 'Section closed during RDS push.',
                      alternatives: appState.alternativeSectionsFor(
                        'CSE 327',
                        excludeSectionId: 'CSE327-01',
                      ),
                      createdAt: 'Now',
                    ),
                    appState: appState,
                  );
                },
                child: const Text('Open RDS Fallback'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.tap(find.text('Open RDS Fallback'));
    await tester.pumpAndSettle();

    expect(find.text('1-Click RDS Fallback Recovery'), findsOneWidget);
    final sec04Finder = find.textContaining('Sec 04').first;
    await tester.ensureVisible(sec04Finder);
    await tester.pumpAndSettle();
    await tester.tap(sec04Finder);
    await tester.pumpAndSettle();

    expect(find.text('Seat Reservation Confirmed'), findsOneWidget);
    expect(find.textContaining('#RDS-TXN-'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'Strategy Solver toggle, AI Optimize & Petition submission on 360dp',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final appState = AppState(initialLoggedIn: true, initialTab: 1);
    addTearDown(appState.dispose);

    await tester.pumpWidget(SmartAdvisorApp(appState: appState));
    await tester.pump(const Duration(milliseconds: 200));

    // Toggle MinimizeGaps strategy
    await tester.tap(find.text('Min Gaps'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(appState.strategy, ScheduleStrategy.minimizeGaps);

    // Apply AI Optimize Cart
    await tester.tap(find.text('AI Optimize Cart →'));
    await tester.pump(const Duration(milliseconds: 200));
    expect(appState.clashes, isEmpty);

    // Navigate to Prereqs tab and submit a new petition
    appState.setTab(2);
    await tester.pumpAndSettle();
    await tester.tap(find.text('New'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byType(TextField),
      'Need CSE 425 for Fall graduation track.',
    );
    await tester.ensureVisible(find.text('Submit Petition →'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit Petition →'));
    await tester.pumpAndSettle();

    expect(find.text('Pending 2'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'CourseCatalogScreen shows Rule 2.1 and opens RULE-2.1 sheet when credit-floor shortfall has approved RULE-4.2 waiver and missing prereq',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    const catalogState = BackendState(
      student: StudentProfile(
        id: '2412159042',
        name: 'Rahim Ahmed',
        standing: 'Senior Standing',
        creditsCompleted: 96,
        creditsTotal: 130,
        cgpa: 3.64,
        cartToken: '#NSU-241215-9042',
        clearedCourses: [
          ClearedCourse(code: 'CSE 115', grade: 'A'),
          ClearedCourse(code: 'CSE 215', grade: 'A'),
        ],
      ),
      sections: [
        CourseSection(
          id: 'CSE425-01',
          courseCode: 'CSE 425',
          courseTitle: 'Concepts of Programming Languages',
          credits: 3.0,
          sectionNumber: '01',
          faculty: 'Dr. Nova Ahmed',
          days: 'MW',
          timeSlot: '02:40 PM - 04:10 PM',
          room: 'LIB 602',
          capacity: 40,
          enrolled: 25,
          minCreditsRequired: 100,
          prerequisites: ['CSE 215', 'CSE 311'],
        ),
      ],
      stagedSectionIds: [],
      exceptions: [
        ExceptionCase(
          id: 'CASE-RULE42-APP',
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
          submittedAt: 'Today',
          status: PetitionStatus.approved,
          statement: 'Approved Rule 4.2 credit standing waiver.',
        ),
      ],
      bypassRules: [],
      auditLog: [],
      metrics: AdminMetrics(p95LatencyMs: 12),
      escalations: [],
      dagSummary: DagSummary(
        eligibleCourses: [],
        blockedCourses: {
          'CSE 425': ['CSE 311'],
        },
        criticalPath: ['CSE 115', 'CSE 215', 'CSE 311', 'CSE 425'],
      ),
    );

    final appState = AppState(
      initialLoggedIn: true,
      initialState: catalogState,
    );
    addTearDown(appState.dispose);

    await tester.pumpWidget(
      MaterialApp(home: CourseCatalogScreen(appState: appState)),
    );
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('CSE 425'), findsOneWidget);
    expect(find.text('Missing Prerequisites: CSE 311'), findsOneWidget);
    expect(find.text('Prerequisites Not Met (Rule 2.1)'), findsOneWidget);
    expect(find.text('Prerequisites Not Met (Rule 4.2)'), findsNothing);

    await tester.tap(find.text('Prerequisites Not Met (Rule 2.1)'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Academic RULE-2.1 Prerequisite Check'), findsOneWidget);
    expect(
      find.textContaining('Missing prerequisite(s): CSE 311'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'CourseDetailScreen opens Academic Rule 4.2 Floor Check before Capacity Reached on CSE 425 for 96-credit student',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final appState = AppState(initialLoggedIn: true, initialTab: 0);
    addTearDown(appState.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: CourseDetailScreen(appState: appState, courseCode: 'CSE 425'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('CSE 425 • Section Picker'), findsOneWidget);

    await tester.tap(find.text('Confirm & Add to Advising Cart →'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Academic Rule 4.2 Floor Check'), findsOneWidget);
    expect(find.text('CAPACITY REACHED (40/40)'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'CourseDetailScreen full-section Sec 01 tap enforces RULE-4.2 on CSE 425 for 96-credit student',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final appState = AppState(initialLoggedIn: true, initialTab: 0);
    addTearDown(appState.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: CourseDetailScreen(appState: appState, courseCode: 'CSE 425'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('CSE 425 • Section Picker'), findsOneWidget);

    await tester.tap(find.text('Sec 01'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Academic Rule 4.2 Floor Check'), findsOneWidget);
    expect(find.text('CAPACITY REACHED (40/40)'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'CourseDetailScreen full-section Sec 03 tap opens CAPACITY REACHED waitlist fallback on eligible CSE 327',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final appState = AppState(initialLoggedIn: true, initialTab: 0);
    addTearDown(appState.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: CourseDetailScreen(appState: appState, courseCode: 'CSE 327'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('CSE 327 • Section Picker'), findsOneWidget);

    await tester.ensureVisible(find.text('Sec 03'));
    await tester.pump();
    await tester.tap(find.text('Sec 03'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('CAPACITY REACHED (40/40)'), findsOneWidget);
    expect(
      find.text('CSE 327 Sec 03 • Prof. Dr. Rajesh Palit'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'CourseCatalogScreen shows Academic Rule 4.2 Floor Check wording even when course also has missing prerequisites',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    const dualBlockedState = BackendState(
      student: StudentProfile(
        id: '2412159042',
        name: 'Rahim Ahmed',
        standing: 'Senior Standing',
        creditsCompleted: 96,
        creditsTotal: 130,
        cgpa: 3.64,
        cartToken: '#NSU-241215-9042',
        clearedCourses: [
          ClearedCourse(code: 'CSE 115', grade: 'A'),
          ClearedCourse(code: 'CSE 215', grade: 'A'),
        ],
      ),
      sections: [
        CourseSection(
          id: 'CSE425-01',
          courseCode: 'CSE 425',
          courseTitle: 'Concepts of Programming Languages',
          credits: 3.0,
          sectionNumber: '01',
          faculty: 'Dr. Nova Ahmed',
          days: 'MW',
          timeSlot: '02:40 PM - 04:10 PM',
          room: 'LIB 602',
          capacity: 40,
          enrolled: 40,
          minCreditsRequired: 100,
          prerequisites: ['CSE 215', 'CSE 311'],
        ),
      ],
      stagedSectionIds: [],
      exceptions: [],
      bypassRules: [],
      auditLog: [],
      metrics: AdminMetrics(p95LatencyMs: 12),
      escalations: [],
      dagSummary: DagSummary(
        eligibleCourses: [],
        blockedCourses: {
          'CSE 425': ['CSE 311'],
        },
        criticalPath: ['CSE 115', 'CSE 215', 'CSE 311', 'CSE 425'],
      ),
    );

    final appState = AppState(
      initialLoggedIn: true,
      initialState: dualBlockedState,
    );
    addTearDown(appState.dispose);

    await tester.pumpWidget(
      MaterialApp(home: CourseCatalogScreen(appState: appState)),
    );
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.text('Prerequisites Not Met (Rule 4.2)'), findsOneWidget);
    await tester.tap(find.text('Prerequisites Not Met (Rule 4.2)'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Academic Rule 4.2 Floor Check'), findsOneWidget);
    expect(find.text('Academic RULE-4.2 Prerequisite Check'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'G2 & G9: RULE-6.3 exam load sheet renders conflictingSections and HomeDashboardScreen clearance pill reflects advisingClearedBy',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final appState = AppState(initialLoggedIn: true, initialTab: 0);
    addTearDown(appState.dispose);

    // 1. RULE-6.3 sheet renders conflictingSections instead of Rule 4.2 credit floor
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () {
                  MobileBottomSheets.showMissingPrereqRule42(
                    context,
                    targetCourse: 'CSE 425',
                    sectionId: 'CSE425-01',
                    ruleCode: 'RULE-6.3',
                    conflictingSections: [
                      appState.sections.first,
                      appState.sections.last,
                    ],
                    appState: appState,
                  );
                },
                child: const Text('Open Rule 6.3'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open Rule 6.3'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Academic RULE-6.3 Exam Load Check'), findsOneWidget);
    expect(
      find.text('CONSECUTIVE EXAM LOAD CONFLICT (24H WINDOW)'),
      findsOneWidget,
    );
    expect(find.textContaining('CSE 327 Sec 01'), findsOneWidget);
    expect(find.textContaining('CSE 425 Sec 01'), findsOneWidget);
    expect(find.text('Academic Rule 4.2 Floor Check'), findsNothing);
    expect(find.textContaining('Deficit:'), findsNothing);

    // 2. HomeDashboardScreen shows 'Cleared' when advisingClearedBy is non-empty
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: HomeDashboardScreen(appState: appState)),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Cleared'), findsOneWidget);
    expect(find.text('Pending'), findsNothing);

    // 3. HomeDashboardScreen shows 'Pending' when advisingClearedBy is empty
    const pendingState = BackendState(
      student: StudentProfile(
        id: '2412159042',
        name: 'Rahim Ahmed',
        standing: 'Senior Standing',
        creditsCompleted: 96,
        creditsTotal: 130,
        cgpa: 3.64,
        cartToken: '#NSU-241215-9042',
        advisingClearedBy: '',
      ),
      sections: [],
      stagedSectionIds: [],
      exceptions: [],
      bypassRules: [],
      auditLog: [],
      metrics: AdminMetrics(),
      escalations: [],
    );
    final pendingAppState = AppState(
      initialLoggedIn: true,
      initialState: pendingState,
    );
    addTearDown(pendingAppState.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: HomeDashboardScreen(appState: pendingAppState)),
      ),
    );
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Pending'), findsOneWidget);
    expect(find.text('Cleared'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'G11: ScheduleBuilder confirm, Swap Sec, unstage, RDS fallback banner & HomeDashboard Quick Add',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final appState = AppState(initialLoggedIn: true, initialTab: 0);
    addTearDown(appState.dispose);

    // 1. HomeDashboardScreen Quick Add stages an open section
    await tester.pumpWidget(SmartAdvisorApp(appState: appState));
    await tester.pump(const Duration(milliseconds: 200));

    await tester.ensureVisible(find.text('Quick Add').first);
    await tester.pump();
    await tester.tap(find.text('Quick Add').first);
    await tester.pump(const Duration(milliseconds: 300));
    expect(appState.stagedSectionIds, contains('CSE327-02'));
    ScaffoldMessenger.of(tester.element(find.byType(Scaffold).first))
        .clearSnackBars();
    await tester.pumpAndSettle();

    // 2. ScheduleBuilderScreen: unstage 'x' on last card (CSE327-02) restoring 0 clashes
    appState.setTab(1);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Swap Sec').first);
    await tester.pump();
    final countBefore = appState.stagedSectionIds.length;
    await tester.ensureVisible(find.byIcon(Icons.close).last);
    await tester.pump();
    await tester.tap(find.byIcon(Icons.close).last);
    await tester.pumpAndSettle();
    expect(appState.stagedSectionIds.length, countBefore - 1);
    expect(appState.clashes, isEmpty);

    // 3. Tap 'Swap Sec' to open section fallback alternatives sheet
    await tester.ensureVisible(find.text('Swap Sec').first);
    await tester.pump();
    await tester.tap(find.text('Swap Sec').first);
    await tester.pumpAndSettle();
    expect(
      find.text('RECOMMENDED ALTERNATIVES (INSTANT 1-TAP SWAP)'),
      findsOneWidget,
    );
    Navigator.of(tester.element(find.text('RECOMMENDED ALTERNATIVES (INSTANT 1-TAP SWAP)')))
        .pop();
    await tester.pumpAndSettle();

    // 4. Tap Confirm (...) Finalize -> opens receipt sheet
    await tester.ensureVisible(find.textContaining('Finalize →'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Finalize →'));
    await tester.pumpAndSettle();
    expect(find.text('Seat Reservation Confirmed'), findsOneWidget);
    expect(find.textContaining('#RDS-TXN-'), findsOneWidget);
    Navigator.of(tester.element(find.text('Seat Reservation Confirmed'))).pop();
    await tester.pumpAndSettle();

    // 5. Inline RDS Fallback banner in ScheduleBuilderScreen opens RDS fallback sheet
    final fallbackAppState = AppState(
      initialLoggedIn: true,
      initialTab: 1,
      initialState: BackendState(
        student: appState.student,
        sections: appState.sections,
        stagedSectionIds: const ['CSE327-01'],
        exceptions: const [],
        bypassRules: const [],
        auditLog: const [],
        metrics: const AdminMetrics(),
        escalations: const [],
        rdsFallbackPrompt: RdsFallbackPrompt(
          id: 'fb-inline-1',
          failedSectionId: 'CSE327-01',
          failedCourseCode: 'CSE 327',
          reason: 'RDS contention on Sec 01',
          alternatives: appState.alternativeSectionsFor(
            'CSE 327',
            excludeSectionId: 'CSE327-01',
          ),
          createdAt: 'Now',
        ),
      ),
    );
    addTearDown(fallbackAppState.dispose);

    await tester.pumpWidget(SmartAdvisorApp(appState: fallbackAppState));
    await tester.pumpAndSettle();
    expect(
      find.text('RDS Fallback ready for CSE 327. Tap to switch.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Resolve →'));
    await tester.pumpAndSettle();
    expect(find.text('1-Click RDS Fallback Recovery'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'G11: LoginScreen 401 authError banner, waitlist Switch, petition <5 char validation, and AlertsScreen Retry/action',
      (WidgetTester tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    // 1. LoginScreen displays authError banner on 401
    final previousHttpOverrides = HttpOverrides.current;
    HttpOverrides.global = null;
    HttpServer? server;
    SmartAdvisorApiClient? client;
    late final AppState loginState;
    try {
      await tester.runAsync(() async {
        server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
        server!.listen((HttpRequest req) async {
          req.response.statusCode = 401;
          req.response.write(
            jsonEncode({'ok': false, 'message': 'Invalid NSU ID or password'}),
          );
          await req.response.close();
        });
      });

      client = SmartAdvisorApiClient(
        baseUrl: 'http://127.0.0.1:${server!.port}',
      );
      loginState = AppState(apiClient: client, enableRealtime: false);
      addTearDown(loginState.dispose);

      await tester.pumpWidget(
        MaterialApp(home: LoginScreen(appState: loginState)),
      );
      await tester.pump(const Duration(milliseconds: 100));

      await tester.ensureVisible(find.text('Sign in →'));
      await tester.pump();
      await tester.tap(find.text('Sign in →'));
      for (var i = 0;
          i < 50 && (loginState.authError == null || loginState.isLoading);
          i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await tester.pump();
      }
      await tester.pumpAndSettle();
      expect(find.text('Invalid NSU ID or password'), findsOneWidget);
    } finally {
      HttpOverrides.global = previousHttpOverrides;
      client?.dispose();
      await tester.runAsync(() async {
        await server?.close(force: true);
      });
    }

    // 2. showSectionFullFallback waitlist Switch toggles waitlist
    final offlineState = AppState(
      initialLoggedIn: true,
      initialTab: 3,
      initialState: BackendState(
        student: loginState.student,
        sections: loginState.sections,
        stagedSectionIds: const ['CSE327-01'],
        exceptions: const [],
        bypassRules: const [],
        auditLog: const [],
        metrics: const AdminMetrics(),
        escalations: const [],
        waitlistSectionIds: const [],
      ),
    );
    addTearDown(offlineState.dispose);

    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () {
                  MobileBottomSheets.showSectionFullFallback(
                    context,
                    courseCode: 'CSE 327',
                    fullSection: '03',
                    fullSectionObj: offlineState.findSectionById('CSE327-03'),
                    appState: offlineState,
                  );
                },
                child: const Text('Open Full Sheet'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open Full Sheet'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byType(Switch));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(offlineState.waitlistSectionIds, contains('CSE327-03'));
    Navigator.of(tester.element(find.text('CAPACITY REACHED (40/40)'))).pop();
    await tester.pumpAndSettle();

    // 3. showSubmitPetitionSheet <5 char validation error
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: ElevatedButton(
                onPressed: () {
                  MobileBottomSheets.showSubmitPetitionSheet(
                    context,
                    appState: offlineState,
                  );
                },
                child: const Text('Open Petition Sheet'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open Petition Sheet'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'abc');
    await tester.ensureVisible(find.text('Submit Petition →'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Submit Petition →'));
    await tester.pumpAndSettle();
    expect(find.text('Please enter at least 5 characters.'), findsOneWidget);
    Navigator.of(tester.element(find.text('Submit Petition →'))).pop();
    await tester.pumpAndSettle();

    // 4. AlertsScreen Retry & action tap (use seed alerts)
    final seedAlertsState = AppState(initialLoggedIn: true, initialTab: 3);
    addTearDown(seedAlertsState.dispose);

    await tester.pumpWidget(
      MaterialApp(
        key: const ValueKey('alerts-step'),
        home: Scaffold(body: AlertsScreen(appState: seedAlertsState)),
      ),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Retry'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(
      find.text('Gateway refreshed (local cache synced).'),
      findsOneWidget,
    );
    ScaffoldMessenger.of(tester.element(find.byType(Scaffold).first))
        .clearSnackBars();
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Waitlist Hub'));
    await tester.pump();
    await tester.tap(find.text('Waitlist Hub'));
    await tester.pumpAndSettle();
    expect(seedAlertsState.currentTab, 2);
    expect(tester.takeException(), isNull);
  });
}
