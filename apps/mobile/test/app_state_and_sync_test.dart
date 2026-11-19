import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:smartadvisor_mobile/models/models.dart';
import 'package:smartadvisor_mobile/services/api_client.dart';
import 'package:smartadvisor_mobile/state/app_state.dart';

Map<String, dynamic> _buildSeedBootstrapJson({
  List<String>? stagedIds,
  Map<String, dynamic>? rdsFallbackPrompt,
  List<Map<String, dynamic>>? notifications,
  List<Map<String, dynamic>>? exceptions,
  Map<String, dynamic>? receipt,
  List<Map<String, dynamic>>? clashes,
  List<Map<String, dynamic>>? waitlistEntries,
  List<String>? waitlistSectionIds,
  int p95LatencyMs = 42,
}) {
  final sections = <Map<String, dynamic>>[
    {
      'id': 'CSE327-01',
      'courseCode': 'CSE 327',
      'courseTitle': 'Software Engineering',
      'department': 'ECE / CSE',
      'credits': 3.0,
      'sectionNumber': '01',
      'faculty': 'Dr. Nabeel Mohammed',
      'days': 'ST',
      'timeSlot': '11:20 AM - 12:50 PM',
      'room': 'SAC 502',
      'capacity': 40,
      'enrolled': 28,
      'waitlisted': 0,
      'prerequisites': ['CSE 215'],
    },
    {
      'id': 'CSE327-03',
      'courseCode': 'CSE 327',
      'courseTitle': 'Software Engineering',
      'department': 'ECE / CSE',
      'credits': 3.0,
      'sectionNumber': '03',
      'faculty': 'Prof. Dr. Rajesh Palit',
      'days': 'ST',
      'timeSlot': '01:20 PM - 02:50 PM',
      'room': 'SAC 415',
      'capacity': 40,
      'enrolled': 40,
      'waitlisted': 14,
      'prerequisites': ['CSE 215'],
    },
    {
      'id': 'CSE327-04',
      'courseCode': 'CSE 327',
      'courseTitle': 'Software Engineering',
      'department': 'ECE / CSE',
      'credits': 3.0,
      'sectionNumber': '04',
      'faculty': 'Mr. Tanvir Rahman',
      'days': 'RA',
      'timeSlot': '04:20 PM - 05:50 PM',
      'room': 'LIB 602',
      'capacity': 40,
      'enrolled': 21,
      'waitlisted': 0,
      'prerequisites': ['CSE 215'],
    },
    {
      'id': 'CSE311-03',
      'courseCode': 'CSE 311',
      'courseTitle': 'Database Systems',
      'department': 'ECE / CSE',
      'credits': 3.0,
      'sectionNumber': '03',
      'faculty': 'Dr. Tanjila Farah',
      'days': 'MW',
      'timeSlot': '09:40 AM - 11:10 AM',
      'room': 'NAC 408',
      'capacity': 40,
      'enrolled': 37,
      'waitlisted': 0,
      'prerequisites': ['CSE 215'],
    },
    {
      'id': 'CSE311L-02',
      'courseCode': 'CSE 311L',
      'courseTitle': 'Database Lab',
      'department': 'ECE / CSE',
      'credits': 1.0,
      'sectionNumber': '02',
      'faculty': 'Mr. Safayat Hossain',
      'days': 'Thu',
      'timeSlot': '09:40 AM - 12:40 PM',
      'room': 'LIB 608',
      'capacity': 35,
      'enrolled': 27,
      'waitlisted': 0,
      'prerequisites': ['CSE 215'],
      'isLab': true,
    },
    {
      'id': 'MAT361-04',
      'courseCode': 'MAT 361',
      'courseTitle': 'Probability & Statistics',
      'department': 'Math & Physics',
      'credits': 3.0,
      'sectionNumber': '04',
      'faculty': 'Dr. Hasina Akter',
      'days': 'ST',
      'timeSlot': '01:20 PM - 02:50 PM',
      'room': 'NAC 510',
      'capacity': 40,
      'enrolled': 18,
      'waitlisted': 0,
      'prerequisites': ['MAT 120'],
    },
    {
      'id': 'CSE425-01',
      'courseCode': 'CSE 425',
      'courseTitle': 'Concepts of Programming Languages',
      'department': 'ECE / CSE',
      'credits': 3.0,
      'sectionNumber': '01',
      'faculty': 'Dr. Nova Ahmed',
      'days': 'MW',
      'timeSlot': '02:40 PM - 04:10 PM',
      'room': 'LIB 602',
      'capacity': 40,
      'enrolled': 40,
      'waitlisted': 10,
      'minCreditsRequired': 100,
      'prerequisites': ['CSE 215', 'CSE 311'],
    },
  ];

  final activeStagedIds =
      stagedIds ?? ['CSE327-01', 'CSE311-03', 'CSE311L-02', 'MAT361-04'];

  return {
    'student': {
      'id': '2412159042',
      'name': 'Rahim Ahmed',
      'email': 'rahim.ahmed01@northsouth.edu',
      'program': 'B.Sc in Computer Science and Engineering',
      'standing': 'Senior Standing',
      'creditsCompleted': 96,
      'creditsTotal': 130,
      'cgpa': 3.64,
      'cartToken': '#NSU-241215-9042',
      'clearedCourses': [
        {'code': 'CSE 115', 'grade': 'A'},
        {'code': 'CSE 215', 'grade': 'A'},
        {'code': 'CSE 311', 'grade': 'A-'},
        {'code': 'CSE 231', 'grade': 'B+'},
      ],
      'advisingClearedBy': 'Dr. Nova Ahmed',
      'slotClosesAt':
          DateTime.now().add(const Duration(hours: 3)).toIso8601String(),
      'maxCredits': 15.0,
    },
    'sections': sections,
    'stagedSectionIds': activeStagedIds,
    'clashes': clashes ?? <Map<String, dynamic>>[],
    'exceptions': exceptions ??
        [
          {
            'id': 'CASE #EX-2025-0841',
            'studentId': '2412159042',
            'studentName': 'Rahim Ahmed',
            'program': 'B.Sc CSE',
            'standing': 'Senior Standing',
            'cgpa': 3.64,
            'creditsCompleted': 96,
            'courseCode': 'CSE 425',
            'courseTitle': 'Concepts of Programming Languages',
            'sectionNumber': '01',
            'sectionId': 'CSE425-01',
            'ruleCode': 'RULE-4.2',
            'category': 'Credit Standing',
            'submittedAt': 'Today, 09:14 AM',
            'status': 'pending',
            'statement': 'Need CSE 425 for graduation milestone.',
            'auditChecks': <Map<String, dynamic>>[],
          },
        ],
    'bypassRules': [
      {
        'id': 'rule-4-2',
        'code': 'RULE-4.2',
        'title': 'Senior Standing Credit Floor Exception',
        'description': 'Allows >= 94 Cr advisor consent.',
        'category': 'Standing',
        'enabled': true,
        'lastUpdated': 'Spring 2025',
      },
    ],
    'auditLog': <Map<String, dynamic>>[],
    'metrics': {
      'requestsPerSec': 1842,
      'p95LatencyMs': p95LatencyMs,
      'slaCeilingMs': 200,
      'errorRate': 0.08,
      'poolUsed': 156,
      'poolTotal': 200,
      'apiNodes': 6,
      'surgeSpikeActive': false,
    },
    'escalations': <Map<String, dynamic>>[],
    'receipt': receipt,
    'notifications': notifications ??
        [
          {
            'id': 'notif-1',
            'studentId': '2412159042',
            'sectionId': 'CSE327-02',
            'courseCode': 'CSE 327',
            'channel': 'PUSH',
            'eventType': 'SEAT_OPEN',
            'title': 'Seat Opened',
            'message': 'CSE 327 Sec 02 now has an open seat.',
            'status': 'sent',
            'createdAt': DateTime.now().toIso8601String(),
          },
        ],
    'waitlistSectionIds': waitlistSectionIds ?? ['CSE327-03'],
    'waitlistEntries': waitlistEntries ??
        [
          {
            'id': 'wl-1',
            'studentId': '2412159042',
            'sectionId': 'CSE327-03',
            'courseCode': 'CSE 327',
            'position': 5,
            'createdAt': 'Today 09:00 AM',
            'status': 'waiting',
          },
        ],
    'dagSummary': {
      'eligibleCourses': ['CSE 327', 'CSE 311L', 'MAT 361'],
      'blockedCourses': {
        'CSE 425': ['100+ Credits'],
      },
      'criticalPath': ['CSE 115', 'CSE 215', 'CSE 311', 'CSE 425'],
      'hasCycle': false,
    },
    'rdsFallbackPrompt': rdsFallbackPrompt,
  };
}

void main() {
  group('DayCodeHelper & BackendState contract parity', () {
    test('expands ST, MW, RA (Thu + Sat) and single-day codes accurately', () {
      expect(DayCodeHelper.expandDayCodes('ST'), ['Sun', 'Tue']);
      expect(DayCodeHelper.expandDayCodes('MW'), ['Mon', 'Wed']);
      expect(DayCodeHelper.expandDayCodes('RA'), ['Thu', 'Sat']);
      expect(DayCodeHelper.expandDayCodes('Thu'), ['Thu']);
      expect(DayCodeHelper.expandDayCodes('Sat'), ['Sat']);
    });

    test('detects RA vs Thu timetable clash and clears non-overlapping RA slot',
        () {
      const labThu = CourseSection(
        id: 'CSE311L-02',
        courseCode: 'CSE 311L',
        sectionNumber: '02',
        faculty: 'Mr. Safayat Hossain',
        days: 'Thu',
        timeSlot: '09:40 AM - 12:40 PM',
        room: 'LIB 608',
        capacity: 35,
        enrolled: 27,
      );

      const clashingRa = CourseSection(
        id: 'CSE999-01',
        courseCode: 'CSE 999',
        sectionNumber: '01',
        faculty: 'Test Faculty',
        days: 'RA',
        timeSlot: '09:40 AM - 11:10 AM',
        room: 'SAC 301',
        capacity: 40,
        enrolled: 10,
      );

      const eveningRa = CourseSection(
        id: 'CSE327-04',
        courseCode: 'CSE 327',
        sectionNumber: '04',
        faculty: 'Mr. Tanvir Rahman',
        days: 'RA',
        timeSlot: '04:20 PM - 05:50 PM',
        room: 'LIB 602',
        capacity: 40,
        enrolled: 21,
      );

      final clashes = DayCodeHelper.detectScheduleClashes([labThu, clashingRa]);
      expect(clashes.length, 1);
      expect(clashes.first.day, 'Thu');

      final noClashes =
          DayCodeHelper.detectScheduleClashes([labThu, eveningRa]);
      expect(noClashes, isEmpty);
    });

    test('G9: parseTimeSlot normalizes Unicode dashes and handles TBA/empty',
        () {
      final enDash = DayCodeHelper.parseTimeSlot('11:20 AM \u2013 12:50 PM');
      expect(enDash, isNotNull);
      expect(enDash!.startMin, 11 * 60 + 20);
      expect(enDash.endMin, 12 * 60 + 50);

      final emDash = DayCodeHelper.parseTimeSlot('01:20 PM \u2014 02:50 PM');
      expect(emDash, isNotNull);
      expect(emDash!.startMin, 13 * 60 + 20);

      final figDash = DayCodeHelper.parseTimeSlot('09:40 AM \u2012 11:10 AM');
      expect(figDash, isNotNull);

      final horizBar = DayCodeHelper.parseTimeSlot('02:40 PM \u2015 04:10 PM');
      expect(horizBar, isNotNull);

      expect(DayCodeHelper.parseTimeSlot('TBA'), isNull);
      expect(DayCodeHelper.parseTimeSlot(''), isNull);

      const secA = CourseSection(
        id: 'A-1',
        courseCode: 'CSE 327',
        sectionNumber: '01',
        faculty: 'Faculty A',
        days: 'ST',
        timeSlot: '11:20 AM \u2013 12:50 PM',
        room: 'SAC 502',
        capacity: 40,
        enrolled: 20,
      );
      const secB = CourseSection(
        id: 'B-1',
        courseCode: 'CSE 331',
        sectionNumber: '01',
        faculty: 'Faculty B',
        days: 'ST',
        timeSlot: '12:00 PM \u2014 01:30 PM',
        room: 'SAC 415',
        capacity: 40,
        enrolled: 20,
      );
      expect(DayCodeHelper.detectScheduleClashes([secA, secB]).length, 1);
    });

    test('parses full BackendState bootstrap payload with 10.0 Cr staged', () {
      final state = BackendState.fromJson(_buildSeedBootstrapJson());
      expect(state.student.id, '2412159042');
      expect(state.student.maxCredits, 15.0);
      expect(state.stagedSectionIds.length, 4);
      expect(state.totalCredits, 10.0);
      expect(state.clashes, isEmpty);
      expect(state.dagSummary?.eligibleCourses, contains('CSE 327'));
      expect(state.waitlistEntries.first.position, 5);
      expect(state.notifications.first.eventType,
          NotificationEventType.seatOpen);
    });

    test('normalizes API_URL formats and builds WS / SSE URIs cleanly', () {
      final client = SmartAdvisorApiClient(
        baseUrl: 'https://api.smartadvisor.edu/api/v1/',
      );
      addTearDown(client.dispose);
      client.setAuthToken('jwt-123');

      expect(client.originUrl, 'https://api.smartadvisor.edu');
      expect(
        client.buildApiUri('/student/cart/stage').toString(),
        'https://api.smartadvisor.edu/api/v1/student/cart/stage',
      );
      expect(
        client.buildSseUri().toString(),
        'https://api.smartadvisor.edu/api/v1/events',
      );
      expect(
        client.buildWsUri(studentId: '2412159042').toString(),
        'wss://api.smartadvisor.edu/ws?token=jwt-123&studentId=2412159042',
      );
    });
  });

  group('SmartAdvisorApiClient & AppState live HTTP/WS/SSE integration', () {
    test('login, bootstrap, 422/409 stage handling, solver, fallback & WS sync',
        () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() async => server.close(force: true));

      final connectedSockets = <WebSocket>[];
      final serverSub = server.listen((HttpRequest req) async {
        if (WebSocketTransformer.isUpgradeRequest(req)) {
          final ws = await WebSocketTransformer.upgrade(req);
          connectedSockets.add(ws);
          ws.add(
            jsonEncode({
              'type': 'SYNC_UPDATE',
              'studentId': '2412159042',
              'state': _buildSeedBootstrapJson(p95LatencyMs: 19),
              'timestamp': DateTime.now().millisecondsSinceEpoch,
            }),
          );
          return;
        }

        final bodyStr = await utf8.decoder.bind(req).join();
        final path = req.uri.path;

        if (req.method == 'POST' && path == '/api/v1/auth/login') {
          final payload = jsonDecode(bodyStr) as Map<String, dynamic>;
          if (payload['password'] == 'wrongpass') {
            req.response.statusCode = 401;
            req.response.write(
              jsonEncode({'ok': false, 'message': 'Invalid user ID or password'}),
            );
          } else {
            req.response.statusCode = 200;
            req.response.write(
              jsonEncode({
                'ok': true,
                'token': 'test-jwt-token',
                'user': {
                  'id': '2412159042',
                  'name': 'Rahim Ahmed',
                  'role': 'student',
                  'email': 'rahim.ahmed01@northsouth.edu',
                },
              }),
            );
          }
          await req.response.close();
          return;
        }

        if (req.method == 'GET' && path == '/api/v1/bootstrap') {
          req.response.statusCode = 200;
          req.response.write(jsonEncode(_buildSeedBootstrapJson()));
          await req.response.close();
          return;
        }

        if (req.method == 'POST' && path == '/api/v1/student/cart/stage') {
          final payload = jsonDecode(bodyStr) as Map<String, dynamic>;
          final sectionId = payload['sectionId'];
          if (sectionId == 'CSE425-01') {
            req.response.statusCode = 422;
            req.response.write(
              jsonEncode({
                'ok': false,
                'modal': 'rule_alert',
                'payload': {
                  'ruleCode': 'RULE-4.2',
                  'studentCredits': 96,
                  'requiredCredits': 100,
                  'missingPrerequisites': <String>[],
                },
              }),
            );
          } else if (sectionId == 'CSE327-03') {
            req.response.statusCode = 409;
            req.response.write(
              jsonEncode({
                'ok': false,
                'modal': 'section_full',
                'payload': {
                  'fullSection': {
                    'id': 'CSE327-03',
                    'courseCode': 'CSE 327',
                    'sectionNumber': '03',
                    'faculty': 'Prof. Dr. Rajesh Palit',
                    'days': 'ST',
                    'timeSlot': '01:20 PM - 02:50 PM',
                    'room': 'SAC 415',
                    'capacity': 40,
                    'enrolled': 40,
                  },
                  'alternatives': [
                    {
                      'id': 'CSE327-04',
                      'courseCode': 'CSE 327',
                      'sectionNumber': '04',
                      'faculty': 'Mr. Tanvir Rahman',
                      'days': 'RA',
                      'timeSlot': '04:20 PM - 05:50 PM',
                      'room': 'LIB 602',
                      'capacity': 40,
                      'enrolled': 21,
                    },
                  ],
                },
              }),
            );
          } else {
            req.response.statusCode = 200;
            req.response.write(
              jsonEncode({
                'ok': true,
                'state': _buildSeedBootstrapJson(
                  stagedIds: [
                    'CSE327-04',
                    'CSE311-03',
                    'CSE311L-02',
                    'MAT361-04',
                  ],
                ),
              }),
            );
          }
          await req.response.close();
          return;
        }

        if (req.method == 'POST' && path == '/api/v1/student/schedule/solve') {
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'recommendedSectionIds': ['CSE327-04', 'CSE311L-02'],
              'sections': <Map<String, dynamic>>[],
              'totalCredits': 4.0,
              'clashes': <Map<String, dynamic>>[],
              'strategy': 'MinimizeGaps',
              'idleGapMinutes': 30,
            }),
          );
          await req.response.close();
          return;
        }

        if (req.method == 'POST' && path == '/api/v1/student/petitions') {
          req.response.statusCode = 201;
          req.response.write(
            jsonEncode({
              'ok': true,
              'exceptionCase': {
                'id': 'CASE #EX-2025-0999',
                'studentId': '2412159042',
                'studentName': 'Rahim Ahmed',
                'program': 'B.Sc CSE',
                'standing': 'Senior Standing',
                'cgpa': 3.64,
                'creditsCompleted': 96,
                'courseCode': 'CSE 425',
                'courseTitle': 'Concepts of Programming Languages',
                'sectionNumber': '01',
                'category': 'Credit Standing',
                'submittedAt': 'Just Now',
                'status': 'pending',
                'statement': 'Need CSE 425 for graduation.',
              },
              'state': _buildSeedBootstrapJson(),
            }),
          );
          await req.response.close();
          return;
        }

        if (req.method == 'POST' && path == '/api/v1/student/rds/fallback') {
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'receipt': {
                'transactionId': '#RDS-TXN-AABBCCDD',
                'studentId': '2412159042',
                'cartToken': '#NSU-241215-9042',
                'timestamp': '2025-02-16T10:00:00Z',
                'totalCredits': 10.0,
                'sections': <Map<String, dynamic>>[],
                'digitalSignature':
                    'SHA256:0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
                'status': 'confirmed',
                'source': 'api',
              },
              'state': _buildSeedBootstrapJson(
                stagedIds: ['CSE327-04', 'CSE311-03', 'CSE311L-02', 'MAT361-04'],
                rdsFallbackPrompt: null,
              ),
            }),
          );
          await req.response.close();
          return;
        }

        req.response.statusCode = 404;
        await req.response.close();
      });
      addTearDown(() async {
        await serverSub.cancel();
        for (final ws in connectedSockets) {
          await ws.close();
        }
      });

      final client = SmartAdvisorApiClient(
        baseUrl: 'http://127.0.0.1:${server.port}',
      );
      final appState = AppState(apiClient: client, enableRealtime: true);
      addTearDown(appState.dispose);

      // 1. Invalid password surfaces HTTP 401
      final badLogin = await appState.login('2412159042', 'wrongpass');
      expect(badLogin, isFalse);
      expect(appState.authError, contains('Invalid'));

      // 2. Valid login with password mask succeeds, loads bootstrap & connects WS
      final okLogin = await appState.login('2412159042', '••••••••••••');
      expect(okLogin, isTrue);
      expect(appState.isOfflineMode, isFalse);
      expect(appState.totalCredits, 10.0);

      // Allow initial WS SYNC_UPDATE frame to arrive
      await Future<void>.delayed(const Duration(milliseconds: 120));
      expect(appState.metrics.p95LatencyMs, 19);

      // 3. Stage blocked 400-level course -> Rule 4.2 alert
      final ruleRes = await appState.stageSection('CSE425-01');
      expect(ruleRes.kind, StageResultKind.ruleAlert);
      expect(ruleRes.ruleCode, 'RULE-4.2');

      // 4. Stage full section -> Section Full fallback with RA alternative
      final fullRes = await appState.stageSection('CSE327-03');
      expect(fullRes.kind, StageResultKind.sectionFull);
      expect(fullRes.alternatives.first.id, 'CSE327-04');

      // 5. Solve schedule
      final solved = await appState.solveSchedule(
        strategy: ScheduleStrategy.minimizeGaps,
      );
      expect(solved?.strategy, ScheduleStrategy.minimizeGaps);
      expect(solved?.idleGapMinutes, 30);

      // 6. Submit petition
      final petition = await appState.submitPetition(
        sectionId: 'CSE425-01',
        courseCode: 'CSE 425',
        ruleCode: 'RULE-4.2',
        reason: 'Final semester requirement for graduation.',
      );
      expect(petition?.id, 'CASE #EX-2025-0999');

      // 7. Broadcast RDS_FALLBACK via WS & resolve with 1 click
      connectedSockets.first.add(
        jsonEncode({
          'type': 'RDS_FALLBACK',
          'studentId': '2412159042',
          'payload': {
            'id': 'fb-ws-1',
            'failedSectionId': 'CSE327-01',
            'failedCourseCode': 'CSE 327',
            'reason': 'Section closed during RDS push.',
            'alternatives': [
              {
                'id': 'CSE327-04',
                'courseCode': 'CSE 327',
                'sectionNumber': '04',
                'faculty': 'Mr. Tanvir Rahman',
                'days': 'RA',
                'timeSlot': '04:20 PM - 05:50 PM',
                'room': 'LIB 602',
                'capacity': 40,
                'enrolled': 21,
              },
            ],
            'createdAt': DateTime.now().toIso8601String(),
          },
          'timestamp': DateTime.now().millisecondsSinceEpoch,
        }),
      );
      await Future<void>.delayed(const Duration(milliseconds: 100));
      expect(appState.rdsFallbackPrompt?.failedSectionId, 'CSE327-01');

      final fallbackRes = await appState.resolveRdsFallback(
        failedSectionId: 'CSE327-01',
        fallbackSectionId: 'CSE327-04',
      );
      expect(fallbackRes.ok, isTrue);
      expect(fallbackRes.receipt?.transactionId, '#RDS-TXN-AABBCCDD');
      expect(appState.rdsFallbackPrompt, isNull);
    });

    test('falls back cleanly to SSE when WebSocket upgrade is rejected',
        () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() async => server.close(force: true));

      final serverSub = server.listen((HttpRequest req) async {
        if (req.uri.path == '/ws') {
          req.response.statusCode = 426;
          await req.response.close();
          return;
        }
        if (req.uri.path == '/api/v1/events') {
          req.response.statusCode = 200;
          req.response.headers.set('content-type', 'text/event-stream');
          req.response.write(': connected\n\n');
          req.response.write(
            'data: ${jsonEncode({'type': 'SYNC_UPDATE', 'state': _buildSeedBootstrapJson(p95LatencyMs: 27), 'timestamp': 1})}\n\n',
          );
          await req.response.flush();
          return;
        }
        req.response.statusCode = 404;
        await req.response.close();
      });
      addTearDown(serverSub.cancel);

      final client = SmartAdvisorApiClient(
        baseUrl: 'http://127.0.0.1:${server.port}',
      );
      addTearDown(client.dispose);

      final received = <SyncEvent>[];
      final sub = client.events.listen(received.add);
      addTearDown(sub.cancel);

      await client.connectRealtime(studentId: '2412159042');
      await Future<void>.delayed(const Duration(milliseconds: 120));

      expect(client.isConnected, isTrue);
      expect(client.isSseFallback, isTrue);
      expect(received.length, 1);
      expect(received.first.state?.metrics.p95LatencyMs, 27);
    });

    test('offline fallback works gracefully when API port is unreachable',
        () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final unusedPort = server.port;
      await server.close(force: true);

      final client = SmartAdvisorApiClient(
        baseUrl: 'http://127.0.0.1:$unusedPort',
        requestTimeout: const Duration(milliseconds: 400),
      );
      final appState = AppState(apiClient: client, enableRealtime: false);
      addTearDown(appState.dispose);

      final loggedIn = await appState.login('2412159042', '••••••••••••');
      expect(loggedIn, isTrue);
      expect(appState.isOfflineMode, isTrue);
      expect(appState.totalCredits, 10.0);
    });
  });

  group('Iteration 2 security, resilience & state regressions', () {
    test('rejects wrong password or wrong ID during offline login fallback',
        () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final unusedPort = server.port;
      await server.close(force: true);

      final client = SmartAdvisorApiClient(
        baseUrl: 'http://127.0.0.1:$unusedPort',
        requestTimeout: const Duration(milliseconds: 400),
      );
      final appState = AppState(apiClient: client, enableRealtime: false);
      addTearDown(appState.dispose);

      // Right ID + wrong password must be rejected
      final badPass = await appState.login('2412159042', 'wrongpass123');
      expect(badPass, isFalse);
      expect(appState.isLoggedIn, isFalse);
      expect(appState.isLoading, isFalse);
      expect(appState.authError, isNotNull);

      // Wrong ID + right password must also be rejected
      final badId = await appState.login('9999999999', 'SmartAdvisor2025!');
      expect(badId, isFalse);
      expect(appState.isLoggedIn, isFalse);
      expect(appState.isLoading, isFalse);
      expect(appState.authError, isNotNull);

      // Exact demo credentials succeed offline
      final valid = await appState.login('2412159042', 'SmartAdvisor2025!');
      expect(valid, isTrue);
      expect(appState.isOfflineMode, isTrue);
      expect(appState.isLoading, isFalse);
    });

    test('real server empty HTTP 400 surfaces ApiException without offline bypass',
        () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() async => server.close(force: true));

      final sub = server.listen((HttpRequest req) async {
        req.response.statusCode = 400;
        await req.response.close();
      });
      addTearDown(sub.cancel);

      final client = SmartAdvisorApiClient(
        baseUrl: 'http://127.0.0.1:${server.port}',
      );
      final appState = AppState(apiClient: client, enableRealtime: false);
      addTearDown(appState.dispose);

      await expectLater(
        () => client.login(id: '2412159042', password: 'SmartAdvisor2025!'),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'statusCode', 400)),
      );

      final loggedIn = await appState.login('2412159042', 'SmartAdvisor2025!');
      expect(loggedIn, isFalse);
      expect(appState.isLoggedIn, isFalse);
      expect(appState.isLoading, isFalse);
      expect(appState.authError, isNotNull);
    });

    test('non-JSON 502 HTML response throws ApiException and resets isLoading',
        () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() async => server.close(force: true));

      final sub = server.listen((HttpRequest req) async {
        req.response.statusCode = 502;
        req.response.headers.contentType = ContentType.html;
        req.response.write('<html><body><h1>502 Bad Gateway</h1></body></html>');
        await req.response.close();
      });
      addTearDown(sub.cancel);

      final client = SmartAdvisorApiClient(
        baseUrl: 'http://127.0.0.1:${server.port}',
      );
      final appState = AppState(apiClient: client, enableRealtime: false);
      addTearDown(appState.dispose);

      await expectLater(
        () => client.getBootstrap(),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'statusCode', 502)),
      );

      final loggedIn = await appState.login('2412159042', 'SmartAdvisor2025!');
      expect(loggedIn, isFalse);
      expect(appState.isLoggedIn, isFalse);
      expect(appState.isLoading, isFalse);
      expect(appState.authError, contains('502'));
    });

    test('SSE reconnect triggers refreshBootstrap to resync missed state',
        () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() async => server.close(force: true));

      var bootstrapCalls = 0;
      var sseCalls = 0;

      final sub = server.listen((HttpRequest req) async {
        final path = req.uri.path;
        if (path == '/ws') {
          req.response.statusCode = 426;
          await req.response.close();
          return;
        }
        if (path == '/api/v1/auth/login') {
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'token': 'jwt-sse-resync',
              'user': {
                'id': '2412159042',
                'name': 'Rahim Ahmed',
                'role': 'student',
                'email': 'rahim.ahmed01@northsouth.edu',
              },
            }),
          );
          await req.response.close();
          return;
        }
        if (path == '/api/v1/bootstrap') {
          bootstrapCalls++;
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode(
              _buildSeedBootstrapJson(
                p95LatencyMs: bootstrapCalls == 1 ? 15 : 88,
              ),
            ),
          );
          await req.response.close();
          return;
        }
        if (path == '/api/v1/events') {
          sseCalls++;
          req.response.statusCode = 200;
          req.response.headers.set('content-type', 'text/event-stream');
          req.response.write(': connected\n\n');
          await req.response.flush();
          if (sseCalls == 1) {
            await Future<void>.delayed(const Duration(milliseconds: 50));
            await req.response.close();
          }
          return;
        }
        req.response.statusCode = 404;
        await req.response.close();
      });
      addTearDown(sub.cancel);

      final client = SmartAdvisorApiClient(
        baseUrl: 'http://127.0.0.1:${server.port}',
      );
      final appState = AppState(apiClient: client, enableRealtime: true);
      addTearDown(appState.dispose);

      final ok = await appState.login('2412159042', '••••••••••••');
      expect(ok, isTrue);
      expect(appState.metrics.p95LatencyMs, 15);

      // Wait for SSE drop + 1s reconnect backoff + refreshBootstrap()
      await Future<void>.delayed(const Duration(milliseconds: 1400));

      expect(sseCalls, greaterThanOrEqualTo(2));
      expect(bootstrapCalls, greaterThanOrEqualTo(2));
      expect(appState.metrics.p95LatencyMs, 88);
    });

    test(
        'live alerts return [] when empty/dismissed and petitions isolate student & approved token',
        () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() async => server.close(force: true));

      var emptyMode = false;
      final sub = server.listen((HttpRequest req) async {
        final path = req.uri.path;
        if (path == '/api/v1/auth/login') {
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'token': 'jwt-live-isolation',
              'user': {
                'id': '2412159042',
                'name': 'Rahim Ahmed',
                'role': 'student',
                'email': 'rahim.ahmed01@northsouth.edu',
              },
            }),
          );
          await req.response.close();
          return;
        }
        if (path == '/api/v1/bootstrap') {
          req.response.statusCode = 200;
          final otherOnlyException = <Map<String, dynamic>>[
            {
              'id': 'CASE-OTHER',
              'studentId': '2321450042',
              'studentName': 'Fariha Tasnim',
              'program': 'B.Sc CSE',
              'standing': 'Junior Standing',
              'cgpa': 3.42,
              'creditsCompleted': 68,
              'courseCode': 'CSE 327',
              'sectionNumber': '03',
              'status': 'pending',
              'submittedAt': 'Today',
              'statement': 'Other student case',
            },
          ];
          final otherOnlyWaitlist = <Map<String, dynamic>>[
            {
              'id': 'wl-seed-1',
              'studentId': '2321450042',
              'sectionId': 'CSE327-03',
              'courseCode': 'CSE 327',
              'position': 14,
              'createdAt': 'Today 08:30 AM',
              'status': 'waiting',
            },
          ];
          req.response.write(
            jsonEncode(
              _buildSeedBootstrapJson(
                notifications: emptyMode ? <Map<String, dynamic>>[] : null,
                waitlistSectionIds: emptyMode ? <String>[] : null,
                receipt: {
                  'transactionId': '#RDS-TXN-12345678',
                  'studentId': '2412159042',
                  'cartToken': '#NSU-241215-9042',
                  'timestamp': '2026-11-18T10:00:00Z',
                  'totalCredits': 10.0,
                  'sections': <Map<String, dynamic>>[],
                  'digitalSignature':
                      'SHA256:0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
                  'status': 'confirmed',
                  'source': 'api',
                },
                exceptions: emptyMode
                    ? otherOnlyException
                    : [
                        {
                          'id': 'CASE-PEND',
                          'studentId': '2412159042',
                          'studentName': 'Rahim Ahmed',
                          'program': 'B.Sc CSE',
                          'standing': 'Senior Standing',
                          'cgpa': 3.64,
                          'creditsCompleted': 96,
                          'courseCode': 'CSE 425',
                          'sectionNumber': '01',
                          'status': 'pending',
                          'submittedAt': 'Today',
                          'statement': 'Pending case',
                        },
                        {
                          'id': 'CASE-REJ',
                          'studentId': '2412159042',
                          'studentName': 'Rahim Ahmed',
                          'program': 'B.Sc CSE',
                          'standing': 'Senior Standing',
                          'cgpa': 3.64,
                          'creditsCompleted': 96,
                          'courseCode': 'CSE 331',
                          'sectionNumber': '01',
                          'status': 'rejected',
                          'submittedAt': 'Today',
                          'statement': 'Rejected case',
                        },
                        {
                          'id': 'CASE-APP',
                          'studentId': '2412159042',
                          'studentName': 'Rahim Ahmed',
                          'program': 'B.Sc CSE',
                          'standing': 'Senior Standing',
                          'cgpa': 3.64,
                          'creditsCompleted': 96,
                          'courseCode': 'CSE 327',
                          'sectionNumber': '01',
                          'status': 'approved',
                          'submittedAt': 'Today',
                          'statement': 'Approved case',
                        },
                        ...otherOnlyException,
                      ],
                waitlistEntries: emptyMode
                    ? otherOnlyWaitlist
                    : [
                        ...otherOnlyWaitlist,
                        {
                          'id': 'wl-iso',
                          'studentId': '2412159042',
                          'sectionId': 'CSE327-03',
                          'courseCode': 'CSE 327',
                          'position': 3,
                          'createdAt': DateTime.now().toIso8601String(),
                          'status': 'waiting',
                        },
                      ],
              ),
            ),
          );
          await req.response.close();
          return;
        }
        req.response.statusCode = 404;
        await req.response.close();
      });
      addTearDown(sub.cancel);

      final client = SmartAdvisorApiClient(
        baseUrl: 'http://127.0.0.1:${server.port}',
      );
      final appState = AppState(apiClient: client, enableRealtime: false);
      addTearDown(appState.dispose);

      await appState.login('2412159042', '••••••••••••');

      // Dismissing last live notification returns [] instead of _offlineAlerts
      expect(appState.alerts.length, 1);
      appState.dismissAlert('notif-1');
      expect(appState.alerts, isEmpty);

      // Petitions: no cross-student leak (exceptions or waitlist), token only on approved, ISO waitlist formatted
      final petitions = appState.petitions;
      expect(petitions.any((p) => p.id == 'CASE-OTHER'), isFalse);
      expect(petitions.any((p) => p.id == 'wl-seed-1'), isFalse);
      expect(petitions.where((p) => p.sectionId == 'CSE327-03').length, 1);
      final pend = petitions.firstWhere((p) => p.id == 'CASE-PEND');
      final rej = petitions.firstWhere((p) => p.id == 'CASE-REJ');
      final app = petitions.firstWhere((p) => p.id == 'CASE-APP');
      final wl = petitions.firstWhere((p) => p.id == 'wl-iso');
      expect(pend.rdsToken, isEmpty);
      expect(rej.rdsToken, isEmpty);
      expect(app.rdsToken, '#RDS-TXN-12345678');
      expect(wl.submittedAt, 'Just now');

      // Refresh with empty notifications and 0 own exceptions -> [] (no leak)
      emptyMode = true;
      await appState.refreshBootstrap();
      expect(appState.alerts, isEmpty);
      expect(appState.petitions, isEmpty);
    });

    test(
        'offline resolveRdsFallback clears stale serverClashes and logout resets session state',
        () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() async => server.close(force: true));

      final sub = server.listen((HttpRequest req) async {
        final path = req.uri.path;
        if (path == '/api/v1/auth/login') {
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'token': 'jwt-fallback-clash',
              'user': {
                'id': '2412159042',
                'name': 'Rahim Ahmed',
                'role': 'student',
                'email': 'rahim.ahmed01@northsouth.edu',
              },
            }),
          );
          await req.response.close();
          return;
        }
        if (path == '/api/v1/bootstrap') {
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode(
              _buildSeedBootstrapJson(
                stagedIds: ['CSE327-01', 'CSE311-03', 'CSE311L-02', 'MAT361-04'],
                clashes: [
                  {
                    'sectionA': {
                      'id': 'CSE327-01',
                      'courseCode': 'CSE 327',
                      'courseTitle': 'Software Engineering',
                      'department': 'ECE / CSE',
                      'credits': 3.0,
                      'sectionNumber': '01',
                      'faculty': 'Dr. Nabeel Mohammed',
                      'days': 'ST',
                      'timeSlot': '11:20 AM - 12:50 PM',
                      'room': 'SAC 502',
                      'capacity': 40,
                      'enrolled': 28,
                    },
                    'sectionB': {
                      'id': 'CSE311-01',
                      'courseCode': 'CSE 311',
                      'courseTitle': 'Database Systems',
                      'department': 'ECE / CSE',
                      'credits': 3.0,
                      'sectionNumber': '01',
                      'faculty': 'Dr. Tanjila Farah',
                      'days': 'ST',
                      'timeSlot': '11:20 AM - 12:50 PM',
                      'room': 'NAC 408',
                      'capacity': 40,
                      'enrolled': 30,
                    },
                    'day': 'ST',
                    'time': '11:20 AM - 12:50 PM',
                  },
                ],
                rdsFallbackPrompt: {
                  'id': 'fb-stale-clash',
                  'failedSectionId': 'CSE327-01',
                  'failedCourseCode': 'CSE 327',
                  'reason': 'RDS lock failure on CSE327-01',
                  'alternatives': <Map<String, dynamic>>[],
                  'createdAt': DateTime.now().toIso8601String(),
                },
              ),
            ),
          );
          await req.response.close();
          return;
        }
        req.response.statusCode = 404;
        await req.response.close();
      });
      addTearDown(sub.cancel);

      final client = SmartAdvisorApiClient(
        baseUrl: 'http://127.0.0.1:${server.port}',
        requestTimeout: const Duration(milliseconds: 400),
      );
      final appState = AppState(apiClient: client, enableRealtime: false);
      addTearDown(appState.dispose);

      await appState.login('2412159042', '••••••••••••');
      expect(appState.clashes, isNotEmpty);
      expect(appState.clashes.first.sectionA.courseCode, 'CSE 327');
      expect(appState.clashes.first.sectionB.courseCode, 'CSE 311');
      expect(appState.rdsFallbackPrompt, isNotNull);

      // Shut down server to force offline fallback on resolveRdsFallback
      await sub.cancel();
      await server.close(force: true);

      final res = await appState.resolveRdsFallback(
        failedSectionId: 'CSE327-01',
        fallbackSectionId: 'CSE327-04',
      );
      expect(res.ok, isTrue);
      expect(res.receipt?.transactionId, startsWith('#RDS-TXN-'));
      expect(appState.clashes, isEmpty);
      expect(appState.rdsFallbackPrompt, isNull);
      expect(appState.receipt, isNotNull);

      await appState.logout();
      expect(appState.isLoggedIn, isFalse);
      expect(appState.hasLiveMetrics, isFalse);
      expect(appState.notifications, isEmpty);
      expect(appState.receipt, isNull);
      expect(appState.rdsFallbackPrompt, isNull);
      expect(appState.lastSolveResult, isNull);
      expect(appState.clashes, isEmpty);
      expect(appState.lastError, isNull);
      expect(appState.authError, isNull);
    });

    test(
        'logout clears live notifications and session state before offline re-login',
        () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() async => server.close(force: true));

      final sub = server.listen((HttpRequest req) async {
        final path = req.uri.path;
        if (path == '/api/v1/auth/login') {
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'token': 'jwt-logout-reset',
              'user': {
                'id': '2412159042',
                'name': 'Rahim Ahmed',
                'role': 'student',
                'email': 'rahim.ahmed01@northsouth.edu',
              },
            }),
          );
          await req.response.close();
          return;
        }
        if (path == '/api/v1/auth/logout') {
          req.response.statusCode = 200;
          req.response.write(jsonEncode({'ok': true}));
          await req.response.close();
          return;
        }
        if (path == '/api/v1/bootstrap') {
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode(
              _buildSeedBootstrapJson(
                stagedIds: ['CSE327-01'],
                exceptions: const [],
                notifications: [
                  {
                    'id': 'notif-live-1',
                    'studentId': '2412159042',
                    'sectionId': 'CSE327-02',
                    'courseCode': 'CSE 327',
                    'channel': 'PUSH',
                    'eventType': 'SEAT_OPEN',
                    'title': 'Live Seat Opened',
                    'message': 'Live server notification before logout.',
                    'status': 'sent',
                    'createdAt': DateTime.now().toIso8601String(),
                  },
                ],
              ),
            ),
          );
          await req.response.close();
          return;
        }
        req.response.statusCode = 404;
        await req.response.close();
      });
      addTearDown(sub.cancel);

      final client = SmartAdvisorApiClient(
        baseUrl: 'http://127.0.0.1:${server.port}',
        requestTimeout: const Duration(milliseconds: 400),
      );
      final appState = AppState(apiClient: client, enableRealtime: false);
      addTearDown(appState.dispose);

      final liveOk = await appState.login('2412159042', 'SmartAdvisor2025!');
      expect(liveOk, isTrue);
      expect(appState.hasLiveMetrics, isTrue);
      expect(appState.alerts.length, 1);
      expect(appState.alerts.first.id, 'notif-live-1');
      expect(appState.totalCredits, 3.0);

      await appState.logout();
      expect(appState.isLoggedIn, isFalse);
      expect(appState.hasLiveMetrics, isFalse);
      expect(appState.notifications, isEmpty);
      expect(client.authToken, isNull);

      // Shut down server so subsequent login enters offline fallback mode
      await sub.cancel();
      await server.close(force: true);

      final offlineOk =
          await appState.login('2412159042', 'SmartAdvisor2025!');
      expect(offlineOk, isTrue);
      expect(appState.isOfflineMode, isTrue);
      expect(appState.hasLiveMetrics, isFalse);
      expect(appState.alerts.length, 5);
      expect(appState.alerts.first.id, 'alt-1');
      expect(appState.petitions.length, 4);
      expect(appState.petitions.any((p) => p.id == 'PET-327-01'), isTrue);
      expect(appState.totalCredits, 10.0);
    });

    test(
        'offline _stageLocally rejects 96-credit student with only RULE-2.1 waiver on CSE 425 under RULE-4.2',
        () async {
      const rule21OnlyState = BackendState(
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
          CourseSection(
            id: 'MAT361-04',
            courseCode: 'MAT 361',
            courseTitle: 'Probability & Statistics',
            credits: 3.0,
            sectionNumber: '04',
            faculty: 'Dr. Hasina Akter',
            days: 'ST',
            timeSlot: '01:20 PM - 02:50 PM',
            room: 'NAC 510',
            capacity: 40,
            enrolled: 18,
            prerequisites: ['MAT 120'],
          ),
        ],
        stagedSectionIds: [],
        exceptions: [
          ExceptionCase(
            id: 'CASE-RULE21-ONLY',
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
            ruleCode: 'RULE-2.1',
            category: 'Prereqs',
            submittedAt: 'Today',
            status: PetitionStatus.approved,
            statement: 'Prerequisite co-registration approved only.',
          ),
        ],
        bypassRules: [
          BypassRule(
            id: 'rule-4-2',
            code: 'RULE-4.2',
            title: 'Senior Standing Credit Floor Exception',
            description: 'Allows >= 94 Cr advisor consent.',
            category: 'Standing',
            enabled: true,
            lastUpdated: 'Spring 2025',
          ),
          BypassRule(
            id: 'rule-2-1',
            code: 'RULE-2.1',
            title: 'Prerequisite Co-Registration Exemption',
            description: 'Disabled for strict prereq check.',
            category: 'Prerequisite',
            enabled: false,
            lastUpdated: 'Spring 2025',
          ),
        ],
        auditLog: [],
        metrics: AdminMetrics(p95LatencyMs: 12),
        escalations: [],
      );

      final appState = AppState(
        initialLoggedIn: true,
        initialState: rule21OnlyState,
      );
      addTearDown(appState.dispose);

      // RULE-2.1 waiver on CSE 425 must NOT bypass RULE-4.2 credit floor
      final res = await appState.stageSection('CSE425-01');
      expect(res.isStaged, isFalse);
      expect(res.kind, StageResultKind.ruleAlert);
      expect(res.ruleCode, 'RULE-4.2');
      expect(res.studentCredits, 96);
      expect(res.requiredCredits, 100);
      expect(res.overrideEligible, isTrue);

      // Missing prereq on MAT 361 without RULE-2.1 waiver or enabled rule-2-1 triggers RULE-2.1
      final prereqRes = await appState.stageSection('MAT361-04');
      expect(prereqRes.isStaged, isFalse);
      expect(prereqRes.kind, StageResultKind.ruleAlert);
      expect(prereqRes.ruleCode, 'RULE-2.1');
      expect(prereqRes.missingPrerequisites, contains('MAT 120'));
    });

    test(
        'disconnectRealtime resets isSseFallback and avoids spurious onReconnected on next connectRealtime',
        () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() async => server.close(force: true));

      final sub = server.listen((HttpRequest req) async {
        final path = req.uri.path;
        if (path == '/ws') {
          req.response.statusCode = 426;
          await req.response.close();
          return;
        }
        if (path == '/api/v1/events') {
          req.response.statusCode = 200;
          req.response.headers.set('content-type', 'text/event-stream');
          req.response.write(': connected\n\n');
          await req.response.flush();
          return;
        }
        req.response.statusCode = 404;
        await req.response.close();
      });
      addTearDown(sub.cancel);

      var reconnectCalls = 0;
      final client = SmartAdvisorApiClient(
        baseUrl: 'http://127.0.0.1:${server.port}',
        onReconnected: () => reconnectCalls++,
      );
      addTearDown(client.dispose);

      await client.connectRealtime(studentId: '2412159042');
      expect(client.isConnected, isTrue);
      expect(client.isSseFallback, isTrue);
      expect(reconnectCalls, 0);

      await client.disconnectRealtime();
      expect(client.isConnected, isFalse);
      expect(client.isSseFallback, isFalse);

      await client.connectRealtime(studentId: '2412159042');
      expect(client.isConnected, isTrue);
      expect(client.isSseFallback, isTrue);
      expect(reconnectCalls, 0);
    });

    test(
        'G10: unstageSection, joinWaitlist, confirmEnrollment (200/fallback/409), getDagEligible, getHealth (200/503), getMe, and online solveSchedule(applyToCart: true)',
        () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() async => server.close(force: true));

      final staged = <String>[
        'CSE327-01',
        'CSE311-03',
        'CSE311L-02',
        'MAT361-04',
      ];
      var healthDegraded = false;
      var confirm409Mode = false;
      final recordedRequests = <String>[];
      final authHeaders = <String, String?>{};

      final sub = server.listen((HttpRequest req) async {
        final path = req.uri.path;
        recordedRequests.add('${req.method} $path');
        authHeaders['${req.method} $path'] =
            req.headers.value(HttpHeaders.authorizationHeader);
        final bodyStr = await utf8.decoder.bind(req).join();

        if (req.method == 'GET' && path == '/health') {
          req.response.statusCode = healthDegraded ? 503 : 200;
          req.response.write(
            jsonEncode({
              'status': healthDegraded ? 'degraded' : 'ok',
              'service': 'smartadvisor-api',
              'mode': 'postgres',
              'checks': {
                'api': {'status': 'up', 'latencyMs': 2},
                'postgres': {
                  'status': healthDegraded ? 'down' : 'up',
                  'details': healthDegraded ? 'PG down' : 'Connected',
                },
                'redis': {'status': 'up', 'latencyMs': 1},
              },
            }),
          );
          await req.response.close();
          return;
        }

        if (req.method == 'POST' && path == '/api/v1/auth/login') {
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'token': 'jwt-g10-token',
              'user': {
                'id': '2412159042',
                'name': 'Rahim Ahmed',
                'role': 'student',
                'email': 'rahim.ahmed01@northsouth.edu',
              },
            }),
          );
          await req.response.close();
          return;
        }

        if (req.method == 'GET' && path == '/api/v1/auth/me') {
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'user': {
                'id': '2412159042',
                'name': 'Rahim Ahmed',
                'role': 'student',
                'email': 'rahim.ahmed01@northsouth.edu',
              },
            }),
          );
          await req.response.close();
          return;
        }

        if (req.method == 'GET' && path == '/api/v1/bootstrap') {
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode(_buildSeedBootstrapJson(stagedIds: staged)),
          );
          await req.response.close();
          return;
        }

        if (req.method == 'GET' && path == '/api/v1/student/dag/eligible') {
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'eligibleCourses': ['CSE 327', 'CSE 331'],
              'blockedCourses': {
                'MAT 361': ['MAT 120'],
              },
              'criticalPath': ['CSE 115', 'CSE 215', 'CSE 311', 'CSE 425'],
              'hasCycle': false,
            }),
          );
          await req.response.close();
          return;
        }

        if (req.method == 'DELETE' && path.startsWith('/api/v1/student/cart/')) {
          final id = Uri.decodeComponent(
            path.substring('/api/v1/student/cart/'.length),
          );
          staged.remove(id);
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'state': _buildSeedBootstrapJson(stagedIds: staged),
            }),
          );
          await req.response.close();
          return;
        }

        if (req.method == 'POST' && path == '/api/v1/student/cart/stage') {
          final payload = jsonDecode(bodyStr) as Map<String, dynamic>;
          final id = payload['sectionId'].toString();
          if (!staged.contains(id)) {
            staged.add(id);
          }
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'state': _buildSeedBootstrapJson(stagedIds: staged),
            }),
          );
          await req.response.close();
          return;
        }

        if (req.method == 'POST' && path == '/api/v1/student/waitlist') {
          final payload = jsonDecode(bodyStr) as Map<String, dynamic>;
          final id = payload['sectionId'].toString();
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'position': 15,
              'entry': {
                'id': 'wl-new-15',
                'studentId': '2412159042',
                'sectionId': id,
                'courseCode': 'CSE 327',
                'position': 15,
                'createdAt': DateTime.now().toIso8601String(),
                'status': 'waiting',
              },
              'state': _buildSeedBootstrapJson(
                stagedIds: staged,
                waitlistSectionIds: [id],
              ),
            }),
          );
          await req.response.close();
          return;
        }

        if (req.method == 'POST' && path == '/api/v1/student/schedule/solve') {
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'recommendedSectionIds': ['CSE327-04', 'CSE311L-02'],
              'sections': <Map<String, dynamic>>[],
              'totalCredits': 4.0,
              'clashes': <Map<String, dynamic>>[],
              'strategy': 'MilestoneFirst',
              'idleGapMinutes': 10,
            }),
          );
          await req.response.close();
          return;
        }

        if (req.method == 'POST' && path == '/api/v1/student/enroll/confirm') {
          final payload = jsonDecode(bodyStr) as Map<String, dynamic>;
          if (confirm409Mode) {
            req.response.statusCode = 409;
            req.response.write(
              jsonEncode({
                'ok': false,
                'message': 'Timetable clash prevents enrollment.',
              }),
            );
            await req.response.close();
            return;
          }
          if (payload['simulateRdsFailure'] == true) {
            req.response.statusCode = 200;
            req.response.write(
              jsonEncode({
                'ok': true,
                'fallbackPrompt': {
                  'id': 'fb-confirm-1',
                  'failedSectionId': 'CSE327-01',
                  'failedCourseCode': 'CSE 327',
                  'reason': 'Simulated RDS contention',
                  'alternatives': <Map<String, dynamic>>[],
                  'createdAt': DateTime.now().toIso8601String(),
                },
                'state': _buildSeedBootstrapJson(stagedIds: staged),
              }),
            );
            await req.response.close();
            return;
          }
          req.response.statusCode = 200;
          req.response.write(
            jsonEncode({
              'ok': true,
              'receipt': {
                'transactionId': '#RDS-TXN-11223344',
                'studentId': '2412159042',
                'cartToken': '#NSU-241215-9042',
                'timestamp': '2026-11-19T10:00:00Z',
                'totalCredits': 4.0,
                'sections': <Map<String, dynamic>>[],
                'digitalSignature':
                    'SHA256:0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF',
                'status': 'confirmed',
                'source': 'api',
              },
              'state': _buildSeedBootstrapJson(stagedIds: staged),
            }),
          );
          await req.response.close();
          return;
        }

        req.response.statusCode = 404;
        await req.response.close();
      });
      addTearDown(sub.cancel);

      final client = SmartAdvisorApiClient(
        baseUrl: 'http://127.0.0.1:${server.port}',
      );
      final appState = AppState(apiClient: client, enableRealtime: false);
      addTearDown(appState.dispose);

      expect(await appState.login('2412159042', 'SmartAdvisor2025!'), isTrue);

      // 1. getMe + getHealth (200 & 503) + getDagEligible
      final me = await client.getMe();
      expect(me.id, '2412159042');
      expect(me.role, UserRole.student);
      expect(authHeaders['GET /api/v1/auth/me'], 'Bearer jwt-g10-token');

      final healthOk = await client.getHealth();
      expect(healthOk.status, 'ok');
      expect(healthOk.checks['postgres']?.status, 'up');

      healthDegraded = true;
      final healthDegradedRes = await client.getHealth();
      expect(healthDegradedRes.status, 'degraded');
      expect(healthDegradedRes.checks['postgres']?.status, 'down');

      final dag = await client.getDagEligible();
      expect(dag.eligibleCourses, contains('CSE 331'));
      expect(dag.criticalPath, contains('CSE 425'));
      expect(
        authHeaders['GET /api/v1/student/dag/eligible'],
        'Bearer jwt-g10-token',
      );

      // 2. unstageSection
      await appState.unstageSection('CSE327-01');
      expect(appState.stagedSectionIds, isNot(contains('CSE327-01')));
      expect(
        authHeaders['DELETE /api/v1/student/cart/CSE327-01'],
        'Bearer jwt-g10-token',
      );

      // 3. joinWaitlist
      final wlEntry = await appState.joinWaitlist('CSE327-03');
      expect(wlEntry?.position, 15);
      expect(appState.waitlistSectionIds, contains('CSE327-03'));
      expect(
        authHeaders['POST /api/v1/student/waitlist'],
        'Bearer jwt-g10-token',
      );

      // 4. online solveSchedule(applyToCart: true)
      final solved = await appState.solveSchedule(
        strategy: ScheduleStrategy.milestoneFirst,
        applyToCart: true,
      );
      expect(solved?.recommendedSectionIds, ['CSE327-04', 'CSE311L-02']);
      expect(appState.stagedSectionIds, ['CSE311L-02', 'CSE327-04']);
      expect(
        recordedRequests,
        containsAll([
          'POST /api/v1/student/schedule/solve',
          'DELETE /api/v1/student/cart/CSE311-03',
          'DELETE /api/v1/student/cart/MAT361-04',
          'POST /api/v1/student/cart/stage',
        ]),
      );

      // 5. confirmEnrollment (200 receipt, simulateRdsFailure, 409 error)
      final confirmOk = await appState.confirmEnrollment();
      expect(confirmOk.ok, isTrue);
      expect(confirmOk.receipt?.transactionId, '#RDS-TXN-11223344');
      expect(appState.receipt?.transactionId, '#RDS-TXN-11223344');

      final confirmFallback =
          await appState.confirmEnrollment(simulateRdsFailure: true);
      expect(confirmFallback.ok, isTrue);
      expect(confirmFallback.fallbackPrompt?.id, 'fb-confirm-1');
      expect(appState.rdsFallbackPrompt?.id, 'fb-confirm-1');

      confirm409Mode = true;
      final confirmErr = await appState.confirmEnrollment();
      expect(confirmErr.ok, isFalse);
      expect(appState.lastError, contains('clash'));
    });
  });
}
