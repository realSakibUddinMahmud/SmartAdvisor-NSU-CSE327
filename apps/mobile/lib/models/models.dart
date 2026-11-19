enum UserRole {
  student('student'),
  faculty('faculty'),
  admin('admin');

  final String wireValue;
  const UserRole(this.wireValue);

  static UserRole fromString(String? value) {
    switch (value) {
      case 'faculty':
        return UserRole.faculty;
      case 'admin':
        return UserRole.admin;
      default:
        return UserRole.student;
    }
  }
}

class ClearedCourse {
  final String code;
  final String grade;

  const ClearedCourse({
    required this.code,
    required this.grade,
  });

  factory ClearedCourse.fromJson(Map<String, dynamic> json) {
    return ClearedCourse(
      code: (json['code'] ?? '').toString(),
      grade: (json['grade'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'code': code,
        'grade': grade,
      };
}

class StudentProfile {
  final String id;
  final String name;
  final String email;
  final String program;
  final String standing;
  final int creditsCompleted;
  final int creditsTotal;
  final double cgpa;
  final String cartToken;
  final List<ClearedCourse> clearedCourses;
  final String advisingClearedBy;
  final String slotClosesAt;
  final double maxCredits;

  const StudentProfile({
    required this.id,
    required this.name,
    this.email = '',
    this.program = 'B.Sc in Computer Science and Engineering',
    required this.standing,
    required this.creditsCompleted,
    required this.creditsTotal,
    required this.cgpa,
    required this.cartToken,
    this.clearedCourses = const [],
    this.advisingClearedBy = 'Dr. Nova Ahmed',
    this.slotClosesAt = '',
    this.maxCredits = 15.0,
  });

  factory StudentProfile.fromJson(Map<String, dynamic> json) {
    final clearedRaw = json['clearedCourses'] as List<dynamic>? ?? const [];
    return StudentProfile(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      email: (json['email'] ?? '').toString(),
      program: (json['program'] ?? '').toString(),
      standing: (json['standing'] ?? '').toString(),
      creditsCompleted: (json['creditsCompleted'] as num?)?.toInt() ?? 0,
      creditsTotal: (json['creditsTotal'] as num?)?.toInt() ?? 130,
      cgpa: (json['cgpa'] as num?)?.toDouble() ?? 0.0,
      cartToken: (json['cartToken'] ?? '').toString(),
      clearedCourses: clearedRaw
          .whereType<Map<String, dynamic>>()
          .map(ClearedCourse.fromJson)
          .toList(),
      advisingClearedBy: (json['advisingClearedBy'] ?? '').toString(),
      slotClosesAt: (json['slotClosesAt'] ?? '').toString(),
      maxCredits: (json['maxCredits'] as num?)?.toDouble() ?? 15.0,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'program': program,
        'standing': standing,
        'creditsCompleted': creditsCompleted,
        'creditsTotal': creditsTotal,
        'cgpa': cgpa,
        'cartToken': cartToken,
        'clearedCourses': clearedCourses.map((c) => c.toJson()).toList(),
        'advisingClearedBy': advisingClearedBy,
        'slotClosesAt': slotClosesAt,
        'maxCredits': maxCredits,
      };
}

class TimeSlotRange {
  final int startMin;
  final int endMin;

  const TimeSlotRange({
    required this.startMin,
    required this.endMin,
  });
}

class DayCodeHelper {
  static const List<String> allWeekDays = [
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Sat',
  ];

  static const Map<String, List<String>> _dayExpansionMap = {
    'ST': ['Sun', 'Tue'],
    'MW': ['Mon', 'Wed'],
    'RA': ['Thu', 'Sat'],
    'Sun': ['Sun'],
    'Mon': ['Mon'],
    'Tue': ['Tue'],
    'Wed': ['Wed'],
    'Thu': ['Thu'],
    'Sat': ['Sat'],
  };

  static String normalizeCourseCode(String code) {
    return code.trim().toUpperCase().replaceAll(RegExp(r'\s+'), ' ');
  }

  static List<String> expandDayCodes(String dayCode) {
    final trimmed = dayCode.trim();
    final mapped = _dayExpansionMap[trimmed];
    if (mapped != null) return mapped;
    final upper = trimmed.toUpperCase();
    if (_dayExpansionMap.containsKey(upper)) {
      return _dayExpansionMap[upper]!;
    }
    return trimmed.isEmpty ? const [] : [trimmed];
  }

  static int? _parseTimeTokenToMinutes(String token) {
    final match = RegExp(
      r'^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$',
      caseSensitive: false,
    ).firstMatch(token.trim());
    if (match == null) return null;

    var hours = int.tryParse(match.group(1) ?? '');
    final minutes = int.tryParse(match.group(2) ?? '');
    final meridiem = match.group(3)?.toUpperCase();
    if (hours == null || minutes == null || minutes < 0 || minutes > 59) {
      return null;
    }

    if (meridiem == 'AM') {
      if (hours == 12) hours = 0;
    } else if (meridiem == 'PM') {
      if (hours != 12) hours += 12;
    }

    if (hours < 0 || hours > 23) return null;
    return hours * 60 + minutes;
  }

  static TimeSlotRange? parseTimeSlot(String timeSlot) {
    final normalized = timeSlot.replaceAll(RegExp('[\u2012-\u2015]'), '-');
    final parts = normalized.split('-');
    if (parts.length != 2) return null;
    final startMin = _parseTimeTokenToMinutes(parts[0]);
    final endMin = _parseTimeTokenToMinutes(parts[1]);
    if (startMin == null || endMin == null || endMin <= startMin) {
      return null;
    }
    return TimeSlotRange(startMin: startMin, endMin: endMin);
  }

  static bool sectionsClash(CourseSection a, CourseSection b) {
    final daysA = expandDayCodes(a.days);
    final daysB = expandDayCodes(b.days).toSet();
    final overlappingDays = daysA.where(daysB.contains).toList();
    if (overlappingDays.isEmpty) return false;

    final rangeA = parseTimeSlot(a.timeSlot);
    final rangeB = parseTimeSlot(b.timeSlot);
    if (rangeA != null && rangeB != null) {
      return rangeA.startMin < rangeB.endMin && rangeB.startMin < rangeA.endMin;
    }
    return a.timeSlot.trim() == b.timeSlot.trim();
  }

  static List<ScheduleClash> detectScheduleClashes(
    List<CourseSection> stagedSections,
  ) {
    final clashes = <ScheduleClash>[];
    for (var i = 0; i < stagedSections.length; i++) {
      for (var j = i + 1; j < stagedSections.length; j++) {
        final a = stagedSections[i];
        final b = stagedSections[j];
        final daysA = expandDayCodes(a.days);
        final daysB = expandDayCodes(b.days).toSet();
        final overlapDays = daysA.where(daysB.contains).toList();
        if (overlapDays.isEmpty) continue;

        final rangeA = parseTimeSlot(a.timeSlot);
        final rangeB = parseTimeSlot(b.timeSlot);
        final timesOverlap = rangeA != null && rangeB != null
            ? rangeA.startMin < rangeB.endMin && rangeB.startMin < rangeA.endMin
            : a.timeSlot.trim() == b.timeSlot.trim();

        if (timesOverlap) {
          clashes.add(
            ScheduleClash(
              sectionA: a,
              sectionB: b,
              day: overlapDays.join('/'),
              time: a.timeSlot,
            ),
          );
        }
      }
    }
    return clashes;
  }
}

class CourseSection {
  final String id;
  final String courseCode;
  final String courseTitle;
  final String department;
  final double credits;
  final String sectionNumber;
  final String faculty;
  final String days;
  final String timeSlot;
  final String room;
  final int capacity;
  final int enrolled;
  final int waitlisted;
  final int? minCreditsRequired;
  final List<String> prerequisites;
  final bool isLab;
  final String? instructorId;
  final int? roomCap;
  final String? examSlot;
  final String badge;

  const CourseSection({
    required this.id,
    required this.courseCode,
    this.courseTitle = '',
    this.department = 'ECE / CSE',
    this.credits = 3.0,
    required this.sectionNumber,
    required this.faculty,
    required this.days,
    required this.timeSlot,
    required this.room,
    required this.capacity,
    required this.enrolled,
    this.waitlisted = 0,
    this.minCreditsRequired,
    this.prerequisites = const [],
    this.isLab = false,
    this.instructorId,
    this.roomCap,
    this.examSlot,
    this.badge = '',
  });

  int get availableSeats => capacity - enrolled;
  bool get isFull => availableSeats <= 0;
  bool get isFewSeats => availableSeats > 0 && availableSeats <= 5;

  String get displayBadge {
    if (badge.isNotEmpty) return badge;
    if (isFull) return 'Full ($capacity/$capacity)';
    if (isFewSeats) return '$availableSeats Seats Left';
    return '$availableSeats Open';
  }

  factory CourseSection.fromJson(Map<String, dynamic> json) {
    final prereqsRaw = json['prerequisites'] as List<dynamic>? ?? const [];
    final capacity = (json['capacity'] as num?)?.toInt() ?? 40;
    final enrolled = (json['enrolled'] as num?)?.toInt() ?? 0;
    final avail = capacity - enrolled;
    final computedBadge = avail <= 0
        ? 'Full ($capacity/$capacity)'
        : avail <= 5
            ? '$avail Seats Left'
            : '$avail Open';

    return CourseSection(
      id: (json['id'] ?? '').toString(),
      courseCode: (json['courseCode'] ?? '').toString(),
      courseTitle: (json['courseTitle'] ?? '').toString(),
      department: (json['department'] ?? 'ECE / CSE').toString(),
      credits: (json['credits'] as num?)?.toDouble() ?? 3.0,
      sectionNumber: (json['sectionNumber'] ?? '01').toString(),
      faculty: (json['faculty'] ?? '').toString(),
      days: (json['days'] ?? 'ST').toString(),
      timeSlot: (json['timeSlot'] ?? '').toString(),
      room: (json['room'] ?? '').toString(),
      capacity: capacity,
      enrolled: enrolled,
      waitlisted: (json['waitlisted'] as num?)?.toInt() ?? 0,
      minCreditsRequired: (json['minCreditsRequired'] as num?)?.toInt(),
      prerequisites: prereqsRaw.map((e) => e.toString()).toList(),
      isLab: json['isLab'] == true,
      instructorId: json['instructorId']?.toString(),
      roomCap: (json['roomCap'] as num?)?.toInt(),
      examSlot: json['examSlot']?.toString(),
      badge: (json['badge'] ?? computedBadge).toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'courseCode': courseCode,
        'courseTitle': courseTitle,
        'department': department,
        'credits': credits,
        'sectionNumber': sectionNumber,
        'faculty': faculty,
        'days': days,
        'timeSlot': timeSlot,
        'room': room,
        'capacity': capacity,
        'enrolled': enrolled,
        'waitlisted': waitlisted,
        if (minCreditsRequired != null)
          'minCreditsRequired': minCreditsRequired,
        'prerequisites': prerequisites,
        'isLab': isLab,
        if (instructorId != null) 'instructorId': instructorId,
        if (roomCap != null) 'roomCap': roomCap,
        if (examSlot != null) 'examSlot': examSlot,
      };
}

class StagedSection {
  final String sectionId;
  final String courseCode;
  final int addedAt;

  const StagedSection({
    required this.sectionId,
    required this.courseCode,
    required this.addedAt,
  });

  factory StagedSection.fromJson(Map<String, dynamic> json) {
    return StagedSection(
      sectionId: (json['sectionId'] ?? json['id'] ?? '').toString(),
      courseCode: (json['courseCode'] ?? '').toString(),
      addedAt: (json['addedAt'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
        'sectionId': sectionId,
        'courseCode': courseCode,
        'addedAt': addedAt,
      };
}

class CourseItem {
  final String code;
  final String title;
  final double credits;
  final String department;
  final List<CourseSection> sections;
  final bool isEligible;
  final String statusAction;
  final bool isPrereqBlocked;
  final String prereqNote;
  final List<String> missingPrerequisites;

  const CourseItem({
    required this.code,
    required this.title,
    required this.credits,
    required this.department,
    required this.sections,
    this.isEligible = true,
    required this.statusAction,
    this.isPrereqBlocked = false,
    this.prereqNote = '',
    this.missingPrerequisites = const [],
  });

  bool get hasAvailableSeats => sections.any((s) => !s.isFull);
}

class StagedCourse {
  final String sectionId;
  final String courseCode;
  final String sectionNumber;
  final String faculty;
  final String timeSlot;
  final String days;
  final String room;
  final double credits;

  const StagedCourse({
    this.sectionId = '',
    required this.courseCode,
    required this.sectionNumber,
    required this.faculty,
    required this.timeSlot,
    required this.days,
    required this.room,
    required this.credits,
  });

  String get resolvedSectionId => sectionId.isNotEmpty
      ? sectionId
      : '${courseCode.replaceAll(' ', '')}-$sectionNumber';

  factory StagedCourse.fromCourseSection(CourseSection sec) {
    return StagedCourse(
      sectionId: sec.id,
      courseCode: sec.courseCode,
      sectionNumber: sec.sectionNumber,
      faculty: sec.faculty,
      timeSlot: sec.timeSlot,
      days: sec.days,
      room: sec.room,
      credits: sec.credits,
    );
  }
}

class RuleAuditCheck {
  final String rule;
  final String description;
  final bool passed;
  final String notes;

  const RuleAuditCheck({
    required this.rule,
    required this.description,
    required this.passed,
    required this.notes,
  });

  factory RuleAuditCheck.fromJson(Map<String, dynamic> json) {
    return RuleAuditCheck(
      rule: (json['rule'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      passed: json['passed'] == true,
      notes: (json['notes'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'rule': rule,
        'description': description,
        'passed': passed,
        'notes': notes,
      };
}

enum PetitionStatus { approved, pending, waitlisted, rejected, flagged }

class ExceptionCase {
  final String id;
  final String studentId;
  final String studentName;
  final String program;
  final String standing;
  final double cgpa;
  final int creditsCompleted;
  final String courseCode;
  final String courseTitle;
  final String sectionNumber;
  final String category;
  final String submittedAt;
  final PetitionStatus status;
  final String statement;
  final List<RuleAuditCheck> auditChecks;
  final String? facultyDecisionBy;
  final String? facultyDecisionAt;
  final String? sectionId;
  final String? ruleCode;

  const ExceptionCase({
    required this.id,
    required this.studentId,
    required this.studentName,
    required this.program,
    required this.standing,
    required this.cgpa,
    required this.creditsCompleted,
    required this.courseCode,
    required this.courseTitle,
    required this.sectionNumber,
    required this.category,
    required this.submittedAt,
    required this.status,
    required this.statement,
    this.auditChecks = const [],
    this.facultyDecisionBy,
    this.facultyDecisionAt,
    this.sectionId,
    this.ruleCode,
  });

  static PetitionStatus parseStatus(String? status) {
    switch (status) {
      case 'approved':
        return PetitionStatus.approved;
      case 'waitlisted':
        return PetitionStatus.waitlisted;
      case 'rejected':
        return PetitionStatus.rejected;
      case 'flagged':
        return PetitionStatus.flagged;
      default:
        return PetitionStatus.pending;
    }
  }

  factory ExceptionCase.fromJson(Map<String, dynamic> json) {
    final checksRaw = json['auditChecks'] as List<dynamic>? ?? const [];
    return ExceptionCase(
      id: (json['id'] ?? '').toString(),
      studentId: (json['studentId'] ?? '').toString(),
      studentName: (json['studentName'] ?? '').toString(),
      program: (json['program'] ?? '').toString(),
      standing: (json['standing'] ?? '').toString(),
      cgpa: (json['cgpa'] as num?)?.toDouble() ?? 0.0,
      creditsCompleted: (json['creditsCompleted'] as num?)?.toInt() ?? 0,
      courseCode: (json['courseCode'] ?? '').toString(),
      courseTitle: (json['courseTitle'] ?? '').toString(),
      sectionNumber: (json['sectionNumber'] ?? '01').toString(),
      category: (json['category'] ?? 'Prereqs').toString(),
      submittedAt: (json['submittedAt'] ?? '').toString(),
      status: parseStatus(json['status']?.toString()),
      statement: (json['statement'] ?? '').toString(),
      auditChecks: checksRaw
          .whereType<Map<String, dynamic>>()
          .map(RuleAuditCheck.fromJson)
          .toList(),
      facultyDecisionBy: json['facultyDecisionBy']?.toString(),
      facultyDecisionAt: json['facultyDecisionAt']?.toString(),
      sectionId: json['sectionId']?.toString(),
      ruleCode: json['ruleCode']?.toString(),
    );
  }

  PetitionItem toPetitionItem({String rdsToken = ''}) {
    return PetitionItem(
      id: id,
      courseCode: courseCode,
      sectionNumber: sectionNumber,
      sectionId: sectionId,
      ruleCode: ruleCode,
      category: category,
      status: status,
      submittedAt: submittedAt,
      rdsToken: rdsToken,
      note: statement,
      auditChecks: auditChecks,
    );
  }
}

class PetitionItem {
  final String id;
  final String courseCode;
  final String sectionNumber;
  final String? sectionId;
  final String? ruleCode;
  final String? category;
  final PetitionStatus status;
  final String submittedAt;
  final String rdsToken;
  final String note;
  final int? waitlistPosition;
  final List<RuleAuditCheck> auditChecks;

  const PetitionItem({
    required this.id,
    required this.courseCode,
    required this.sectionNumber,
    this.sectionId,
    this.ruleCode,
    this.category,
    required this.status,
    required this.submittedAt,
    this.rdsToken = '',
    this.note = '',
    this.waitlistPosition,
    this.auditChecks = const [],
  });

  factory PetitionItem.fromWaitlistEntry(
    WaitlistEntry entry, {
    String sectionNumber = '01',
  }) {
    return PetitionItem(
      id: entry.id,
      courseCode: entry.courseCode,
      sectionNumber: sectionNumber,
      sectionId: entry.sectionId,
      category: 'Waitlist',
      status: PetitionStatus.waitlisted,
      submittedAt: NotificationItem.formatRelativeTime(entry.createdAt),
      waitlistPosition: entry.position,
      note:
          'Waitlist Position #${entry.position} • Auto-Promotion Armed (${entry.status})',
    );
  }
}

class BypassRule {
  final String id;
  final String code;
  final String title;
  final String description;
  final String category;
  final bool enabled;
  final String lastUpdated;

  const BypassRule({
    required this.id,
    required this.code,
    required this.title,
    required this.description,
    required this.category,
    required this.enabled,
    required this.lastUpdated,
  });

  factory BypassRule.fromJson(Map<String, dynamic> json) {
    return BypassRule(
      id: (json['id'] ?? '').toString(),
      code: (json['code'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      category: (json['category'] ?? '').toString(),
      enabled: json['enabled'] == true,
      lastUpdated: (json['lastUpdated'] ?? '').toString(),
    );
  }
}

class AuditLogItem {
  final String id;
  final String timestamp;
  final String actor;
  final String action;
  final String details;
  final String badgeType;

  const AuditLogItem({
    required this.id,
    required this.timestamp,
    required this.actor,
    required this.action,
    required this.details,
    required this.badgeType,
  });

  factory AuditLogItem.fromJson(Map<String, dynamic> json) {
    return AuditLogItem(
      id: (json['id'] ?? '').toString(),
      timestamp: (json['timestamp'] ?? '').toString(),
      actor: (json['actor'] ?? '').toString(),
      action: (json['action'] ?? '').toString(),
      details: (json['details'] ?? '').toString(),
      badgeType: (json['badgeType'] ?? 'teal').toString(),
    );
  }
}

class AdminMetrics {
  final int requestsPerSec;
  final int p95LatencyMs;
  final int slaCeilingMs;
  final double errorRate;
  final int poolUsed;
  final int poolTotal;
  final int apiNodes;
  final bool surgeSpikeActive;
  final String? lastScalingEvent;

  const AdminMetrics({
    this.requestsPerSec = 1842,
    this.p95LatencyMs = 12,
    this.slaCeilingMs = 200,
    this.errorRate = 0.08,
    this.poolUsed = 156,
    this.poolTotal = 200,
    this.apiNodes = 6,
    this.surgeSpikeActive = false,
    this.lastScalingEvent,
  });

  factory AdminMetrics.fromJson(Map<String, dynamic> json) {
    return AdminMetrics(
      requestsPerSec: (json['requestsPerSec'] as num?)?.toInt() ?? 0,
      p95LatencyMs: (json['p95LatencyMs'] as num?)?.toInt() ?? 12,
      slaCeilingMs: (json['slaCeilingMs'] as num?)?.toInt() ?? 200,
      errorRate: (json['errorRate'] as num?)?.toDouble() ?? 0.0,
      poolUsed: (json['poolUsed'] as num?)?.toInt() ?? 0,
      poolTotal: (json['poolTotal'] as num?)?.toInt() ?? 200,
      apiNodes: (json['apiNodes'] as num?)?.toInt() ?? 1,
      surgeSpikeActive: json['surgeSpikeActive'] == true,
      lastScalingEvent: json['lastScalingEvent']?.toString(),
    );
  }
}

class DemandPoint {
  final String time;
  final int requests;

  const DemandPoint({required this.time, required this.requests});

  factory DemandPoint.fromJson(Map<String, dynamic> json) {
    return DemandPoint(
      time: (json['time'] ?? '').toString(),
      requests: (json['requests'] as num?)?.toInt() ?? 0,
    );
  }
}

class MajorBreakdown {
  final String major;
  final int count;
  final int percentage;

  const MajorBreakdown({
    required this.major,
    required this.count,
    required this.percentage,
  });

  factory MajorBreakdown.fromJson(Map<String, dynamic> json) {
    return MajorBreakdown(
      major: (json['major'] ?? '').toString(),
      count: (json['count'] as num?)?.toInt() ?? 0,
      percentage: (json['percentage'] as num?)?.toInt() ?? 0,
    );
  }
}

class EscalationItem {
  final String id;
  final String courseCode;
  final String courseTitle;
  final int enrolled;
  final int totalCapacity;
  final int waitlisted;
  final int deficit;
  final String severity;
  final String status;
  final List<DemandPoint> demandSurge;
  final List<MajorBreakdown> breakdown;
  final bool? autoGenerated;

  const EscalationItem({
    required this.id,
    required this.courseCode,
    required this.courseTitle,
    required this.enrolled,
    required this.totalCapacity,
    required this.waitlisted,
    required this.deficit,
    required this.severity,
    required this.status,
    this.demandSurge = const [],
    this.breakdown = const [],
    this.autoGenerated,
  });

  factory EscalationItem.fromJson(Map<String, dynamic> json) {
    final surgeRaw = json['demandSurge'] as List<dynamic>? ?? const [];
    final breakRaw = json['breakdown'] as List<dynamic>? ?? const [];
    return EscalationItem(
      id: (json['id'] ?? '').toString(),
      courseCode: (json['courseCode'] ?? '').toString(),
      courseTitle: (json['courseTitle'] ?? '').toString(),
      enrolled: (json['enrolled'] as num?)?.toInt() ?? 0,
      totalCapacity: (json['totalCapacity'] as num?)?.toInt() ?? 0,
      waitlisted: (json['waitlisted'] as num?)?.toInt() ?? 0,
      deficit: (json['deficit'] as num?)?.toInt() ?? 0,
      severity: (json['severity'] ?? 'SEV-1').toString(),
      status: (json['status'] ?? 'Open').toString(),
      demandSurge: surgeRaw
          .whereType<Map<String, dynamic>>()
          .map(DemandPoint.fromJson)
          .toList(),
      breakdown: breakRaw
          .whereType<Map<String, dynamic>>()
          .map(MajorBreakdown.fromJson)
          .toList(),
      autoGenerated: json['autoGenerated'] as bool?,
    );
  }
}

class ScheduleReceipt {
  final String transactionId;
  final String studentId;
  final String cartToken;
  final String timestamp;
  final double totalCredits;
  final List<CourseSection> sections;
  final String digitalSignature;
  final String? status;
  final String? source;

  const ScheduleReceipt({
    required this.transactionId,
    required this.studentId,
    required this.cartToken,
    required this.timestamp,
    required this.totalCredits,
    required this.sections,
    required this.digitalSignature,
    this.status,
    this.source,
  });

  factory ScheduleReceipt.fromJson(Map<String, dynamic> json) {
    final secRaw = json['sections'] as List<dynamic>? ?? const [];
    return ScheduleReceipt(
      transactionId: (json['transactionId'] ?? '').toString(),
      studentId: (json['studentId'] ?? '').toString(),
      cartToken: (json['cartToken'] ?? '').toString(),
      timestamp: (json['timestamp'] ?? '').toString(),
      totalCredits: (json['totalCredits'] as num?)?.toDouble() ?? 0.0,
      sections: secRaw
          .whereType<Map<String, dynamic>>()
          .map(CourseSection.fromJson)
          .toList(),
      digitalSignature: (json['digitalSignature'] ?? '').toString(),
      status: json['status']?.toString(),
      source: json['source']?.toString(),
    );
  }
}

class AuthUser {
  final String id;
  final String name;
  final UserRole role;
  final String email;
  final String? department;
  final String? instructorName;

  const AuthUser({
    required this.id,
    required this.name,
    required this.role,
    required this.email,
    this.department,
    this.instructorName,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      role: UserRole.fromString(json['role']?.toString()),
      email: (json['email'] ?? '').toString(),
      department: json['department']?.toString(),
      instructorName: json['instructorName']?.toString(),
    );
  }
}

class LoginResponse {
  final bool ok;
  final String token;
  final AuthUser user;
  final String? expiresIn;

  const LoginResponse({
    required this.ok,
    required this.token,
    required this.user,
    this.expiresIn,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    return LoginResponse(
      ok: json['ok'] == true,
      token: (json['token'] ?? '').toString(),
      user: AuthUser.fromJson(
        (json['user'] as Map<String, dynamic>?) ?? const {},
      ),
      expiresIn: json['expiresIn']?.toString(),
    );
  }
}

class DagNodeSummary {
  final String code;
  final String title;
  final double credits;
  final List<String> prerequisites;
  final bool eligible;
  final bool cleared;
  final List<String> missingPrerequisites;

  const DagNodeSummary({
    required this.code,
    required this.title,
    required this.credits,
    required this.prerequisites,
    required this.eligible,
    required this.cleared,
    required this.missingPrerequisites,
  });

  factory DagNodeSummary.fromJson(Map<String, dynamic> json) {
    return DagNodeSummary(
      code: (json['code'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      credits: (json['credits'] as num?)?.toDouble() ?? 3.0,
      prerequisites: (json['prerequisites'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      eligible: json['eligible'] == true,
      cleared: json['cleared'] == true,
      missingPrerequisites:
          (json['missingPrerequisites'] as List<dynamic>? ?? const [])
              .map((e) => e.toString())
              .toList(),
    );
  }
}

class DagSummary {
  final List<String> eligibleCourses;
  final Map<String, List<String>> blockedCourses;
  final List<String> criticalPath;
  final bool hasCycle;
  final List<String> cyclePath;
  final List<String> topologicalOrder;
  final List<DagNodeSummary> nodes;

  const DagSummary({
    this.eligibleCourses = const [],
    this.blockedCourses = const {},
    this.criticalPath = const [],
    this.hasCycle = false,
    this.cyclePath = const [],
    this.topologicalOrder = const [],
    this.nodes = const [],
  });

  factory DagSummary.fromJson(Map<String, dynamic> json) {
    final blockedRaw = json['blockedCourses'] as Map<String, dynamic>? ?? {};
    final blocked = <String, List<String>>{};
    for (final entry in blockedRaw.entries) {
      final list = entry.value is List
          ? (entry.value as List).map((e) => e.toString()).toList()
          : <String>[];
      blocked[entry.key] = list;
    }

    return DagSummary(
      eligibleCourses: (json['eligibleCourses'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      blockedCourses: blocked,
      criticalPath: (json['criticalPath'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      hasCycle: json['hasCycle'] == true,
      cyclePath: (json['cyclePath'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      topologicalOrder: (json['topologicalOrder'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      nodes: (json['nodes'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(DagNodeSummary.fromJson)
          .toList(),
    );
  }
}

enum ScheduleStrategy {
  milestoneFirst('MilestoneFirst'),
  minimizeGaps('MinimizeGaps');

  final String wireValue;
  const ScheduleStrategy(this.wireValue);

  static ScheduleStrategy fromString(String? value) {
    return value == 'MinimizeGaps'
        ? ScheduleStrategy.minimizeGaps
        : ScheduleStrategy.milestoneFirst;
  }
}

class ScheduleClash {
  final CourseSection sectionA;
  final CourseSection sectionB;
  final String day;
  final String time;

  const ScheduleClash({
    required this.sectionA,
    required this.sectionB,
    required this.day,
    required this.time,
  });

  factory ScheduleClash.fromJson(Map<String, dynamic> json) {
    return ScheduleClash(
      sectionA: CourseSection.fromJson(
        (json['sectionA'] as Map<String, dynamic>?) ?? const {},
      ),
      sectionB: CourseSection.fromJson(
        (json['sectionB'] as Map<String, dynamic>?) ?? const {},
      ),
      day: (json['day'] ?? '').toString(),
      time: (json['time'] ?? '').toString(),
    );
  }
}

class SolveScheduleResult {
  final bool ok;
  final List<String> recommendedSectionIds;
  final List<CourseSection> sections;
  final double totalCredits;
  final List<ScheduleClash> clashes;
  final ScheduleStrategy strategy;
  final Map<String, String> rejectedCourses;
  final int idleGapMinutes;
  final List<String> warnings;

  const SolveScheduleResult({
    required this.ok,
    required this.recommendedSectionIds,
    required this.sections,
    required this.totalCredits,
    required this.clashes,
    required this.strategy,
    this.rejectedCourses = const {},
    this.idleGapMinutes = 0,
    this.warnings = const [],
  });

  factory SolveScheduleResult.fromJson(Map<String, dynamic> json) {
    final rejectedRaw = json['rejectedCourses'] as Map<String, dynamic>? ?? {};
    final rejected = <String, String>{};
    for (final entry in rejectedRaw.entries) {
      rejected[entry.key] = entry.value.toString();
    }

    return SolveScheduleResult(
      ok: json['ok'] == true,
      recommendedSectionIds:
          (json['recommendedSectionIds'] as List<dynamic>? ?? const [])
              .map((e) => e.toString())
              .toList(),
      sections: (json['sections'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(CourseSection.fromJson)
          .toList(),
      totalCredits: (json['totalCredits'] as num?)?.toDouble() ?? 0.0,
      clashes: (json['clashes'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ScheduleClash.fromJson)
          .toList(),
      strategy: ScheduleStrategy.fromString(json['strategy']?.toString()),
      rejectedCourses: rejected,
      idleGapMinutes: (json['idleGapMinutes'] as num?)?.toInt() ?? 0,
      warnings: (json['warnings'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
    );
  }
}

enum NotificationChannel {
  sms('SMS'),
  push('PUSH'),
  inApp('IN_APP');

  final String wireValue;
  const NotificationChannel(this.wireValue);

  static NotificationChannel fromString(String? value) {
    switch (value) {
      case 'SMS':
        return NotificationChannel.sms;
      case 'PUSH':
        return NotificationChannel.push;
      default:
        return NotificationChannel.inApp;
    }
  }
}

enum NotificationEventType {
  seatOpen('SEAT_OPEN'),
  petitionDecided('PETITION_DECIDED'),
  waitlistAlert('WAITLIST_ALERT'),
  rdsFallback('RDS_FALLBACK'),
  enrollmentConfirmed('ENROLLMENT_CONFIRMED');

  final String wireValue;
  const NotificationEventType(this.wireValue);

  static NotificationEventType fromString(String? value) {
    switch (value) {
      case 'SEAT_OPEN':
        return NotificationEventType.seatOpen;
      case 'PETITION_DECIDED':
        return NotificationEventType.petitionDecided;
      case 'WAITLIST_ALERT':
        return NotificationEventType.waitlistAlert;
      case 'RDS_FALLBACK':
        return NotificationEventType.rdsFallback;
      default:
        return NotificationEventType.enrollmentConfirmed;
    }
  }
}

class NotificationItem {
  final String id;
  final String studentId;
  final String? sectionId;
  final String? courseCode;
  final NotificationChannel channel;
  final NotificationEventType eventType;
  final String title;
  final String message;
  final String status;
  final String? error;
  final String createdAt;
  final bool read;
  final Map<String, dynamic>? metadata;

  const NotificationItem({
    required this.id,
    required this.studentId,
    this.sectionId,
    this.courseCode,
    required this.channel,
    required this.eventType,
    required this.title,
    required this.message,
    required this.status,
    this.error,
    required this.createdAt,
    this.read = false,
    this.metadata,
  });

  factory NotificationItem.fromJson(Map<String, dynamic> json) {
    return NotificationItem(
      id: (json['id'] ?? '').toString(),
      studentId: (json['studentId'] ?? '').toString(),
      sectionId: json['sectionId']?.toString(),
      courseCode: json['courseCode']?.toString(),
      channel: NotificationChannel.fromString(json['channel']?.toString()),
      eventType:
          NotificationEventType.fromString(json['eventType']?.toString()),
      title: (json['title'] ?? '').toString(),
      message: (json['message'] ?? '').toString(),
      status: (json['status'] ?? 'sent').toString(),
      error: json['error']?.toString(),
      createdAt: (json['createdAt'] ?? '').toString(),
      read: json['read'] == true,
      metadata: json['metadata'] as Map<String, dynamic>?,
    );
  }

  AlertItem toAlertItem() {
    String mappedType;
    String actionLabel;
    switch (eventType) {
      case NotificationEventType.seatOpen:
        mappedType = 'seat_drop';
        actionLabel = 'Claim Seat →';
        break;
      case NotificationEventType.waitlistAlert:
        mappedType = 'fast_enroll';
        actionLabel = 'Add to Cart';
        break;
      case NotificationEventType.rdsFallback:
        mappedType = 'rule_alert';
        actionLabel = '1-Click Swap';
        break;
      case NotificationEventType.petitionDecided:
        mappedType = 'rule_alert';
        actionLabel = 'View Decision';
        break;
      case NotificationEventType.enrollmentConfirmed:
        mappedType = 'clearance';
        actionLabel = 'View Receipt';
        break;
    }

    return AlertItem(
      id: id,
      title: title.toUpperCase(),
      description: message,
      timeAgo: formatRelativeTime(createdAt),
      type: mappedType,
      actionLabel: actionLabel,
      sectionId: sectionId,
      courseCode: courseCode,
      eventType: eventType,
    );
  }

  static String formatRelativeTime(String iso) {
    final parsed = DateTime.tryParse(iso);
    if (parsed == null) return iso.isEmpty ? 'Just now' : iso;
    final diff = DateTime.now().difference(parsed);
    if (diff.inSeconds < 60) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}

class AlertItem {
  final String id;
  final String title;
  final String description;
  final String timeAgo;
  final String type; // 'seat_drop', 'fast_enroll', 'rule_alert', 'clearance'
  final String actionLabel;
  final String? sectionId;
  final String? courseCode;
  final NotificationEventType? eventType;

  const AlertItem({
    required this.id,
    required this.title,
    required this.description,
    required this.timeAgo,
    required this.type,
    required this.actionLabel,
    this.sectionId,
    this.courseCode,
    this.eventType,
  });

  bool get isSeatAlert => type == 'seat_drop' || type == 'fast_enroll';
  bool get isDecisionAlert => type == 'rule_alert' || type == 'clearance';
}

class WaitlistEntry {
  final String id;
  final String studentId;
  final String sectionId;
  final String courseCode;
  final int position;
  final String createdAt;
  final String status;

  const WaitlistEntry({
    required this.id,
    required this.studentId,
    required this.sectionId,
    required this.courseCode,
    required this.position,
    required this.createdAt,
    required this.status,
  });

  factory WaitlistEntry.fromJson(Map<String, dynamic> json) {
    return WaitlistEntry(
      id: (json['id'] ?? '').toString(),
      studentId: (json['studentId'] ?? '').toString(),
      sectionId: (json['sectionId'] ?? '').toString(),
      courseCode: (json['courseCode'] ?? '').toString(),
      position: (json['position'] as num?)?.toInt() ?? 1,
      createdAt: (json['createdAt'] ?? '').toString(),
      status: (json['status'] ?? 'waiting').toString(),
    );
  }
}

class RdsFallbackPrompt {
  final String id;
  final String failedSectionId;
  final String failedCourseCode;
  final String reason;
  final List<CourseSection> alternatives;
  final String createdAt;
  final bool resolved;
  final String? resolvedSectionId;

  const RdsFallbackPrompt({
    required this.id,
    required this.failedSectionId,
    required this.failedCourseCode,
    required this.reason,
    required this.alternatives,
    required this.createdAt,
    this.resolved = false,
    this.resolvedSectionId,
  });

  factory RdsFallbackPrompt.fromJson(Map<String, dynamic> json) {
    final altsRaw = json['alternatives'] as List<dynamic>? ?? const [];
    return RdsFallbackPrompt(
      id: (json['id'] ?? '').toString(),
      failedSectionId: (json['failedSectionId'] ?? '').toString(),
      failedCourseCode: (json['failedCourseCode'] ?? '').toString(),
      reason: (json['reason'] ?? '').toString(),
      alternatives: altsRaw
          .whereType<Map<String, dynamic>>()
          .map(CourseSection.fromJson)
          .toList(),
      createdAt: (json['createdAt'] ?? '').toString(),
      resolved: json['resolved'] == true,
      resolvedSectionId: json['resolvedSectionId']?.toString(),
    );
  }
}

class ComponentHealth {
  final String status;
  final int? latencyMs;
  final String? details;

  const ComponentHealth({
    required this.status,
    this.latencyMs,
    this.details,
  });

  factory ComponentHealth.fromJson(Map<String, dynamic> json) {
    return ComponentHealth(
      status: (json['status'] ?? 'down').toString(),
      latencyMs: (json['latencyMs'] as num?)?.toInt(),
      details: json['details']?.toString(),
    );
  }
}

class HealthCheckResult {
  final String status;
  final String service;
  final String? mode;
  final Map<String, ComponentHealth> checks;
  final String? timestamp;

  const HealthCheckResult({
    required this.status,
    required this.service,
    this.mode,
    this.checks = const {},
    this.timestamp,
  });

  factory HealthCheckResult.fromJson(Map<String, dynamic> json) {
    final checksRaw = json['checks'] as Map<String, dynamic>? ?? {};
    final checks = <String, ComponentHealth>{};
    for (final entry in checksRaw.entries) {
      if (entry.value is Map<String, dynamic>) {
        checks[entry.key] =
            ComponentHealth.fromJson(entry.value as Map<String, dynamic>);
      }
    }
    return HealthCheckResult(
      status: (json['status'] ?? 'degraded').toString(),
      service: (json['service'] ?? 'smartadvisor-api').toString(),
      mode: json['mode']?.toString(),
      checks: checks,
      timestamp: json['timestamp']?.toString(),
    );
  }
}

class BackendState {
  final StudentProfile student;
  final List<CourseSection> sections;
  final List<String> stagedSectionIds;
  final List<CourseSection> stagedSections;
  final double totalCredits;
  final List<ScheduleClash> clashes;
  final List<ExceptionCase> exceptions;
  final List<BypassRule> bypassRules;
  final List<AuditLogItem> auditLog;
  final AdminMetrics metrics;
  final List<EscalationItem> escalations;
  final ScheduleReceipt? receipt;
  final List<NotificationItem> notifications;
  final List<String> waitlistSectionIds;
  final List<WaitlistEntry> waitlistEntries;
  final DagSummary? dagSummary;
  final RdsFallbackPrompt? rdsFallbackPrompt;

  const BackendState({
    required this.student,
    required this.sections,
    required this.stagedSectionIds,
    this.stagedSections = const [],
    this.totalCredits = 0.0,
    this.clashes = const [],
    required this.exceptions,
    required this.bypassRules,
    required this.auditLog,
    required this.metrics,
    required this.escalations,
    this.receipt,
    this.notifications = const [],
    this.waitlistSectionIds = const [],
    this.waitlistEntries = const [],
    this.dagSummary,
    this.rdsFallbackPrompt,
  });

  factory BackendState.fromJson(Map<String, dynamic> json) {
    final sections = (json['sections'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(CourseSection.fromJson)
        .toList();
    final stagedIds = (json['stagedSectionIds'] as List<dynamic>? ?? const [])
        .map((e) => e.toString())
        .toList();

    List<CourseSection> stagedSections;
    if (json['stagedSections'] is List) {
      stagedSections = (json['stagedSections'] as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(CourseSection.fromJson)
          .toList();
    } else {
      stagedSections = <CourseSection>[];
      for (final id in stagedIds) {
        for (final sec in sections) {
          if (sec.id == id) {
            stagedSections.add(sec);
            break;
          }
        }
      }
    }

    final totalCredits = (json['totalCredits'] as num?)?.toDouble() ??
        stagedSections.fold<double>(0.0, (sum, s) => sum + s.credits);

    final clashes = json['clashes'] is List
        ? (json['clashes'] as List<dynamic>)
            .whereType<Map<String, dynamic>>()
            .map(ScheduleClash.fromJson)
            .toList()
        : DayCodeHelper.detectScheduleClashes(stagedSections);

    return BackendState(
      student: StudentProfile.fromJson(
        (json['student'] as Map<String, dynamic>?) ?? const {},
      ),
      sections: sections,
      stagedSectionIds: stagedIds,
      stagedSections: stagedSections,
      totalCredits: totalCredits,
      clashes: clashes,
      exceptions: (json['exceptions'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ExceptionCase.fromJson)
          .toList(),
      bypassRules: (json['bypassRules'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(BypassRule.fromJson)
          .toList(),
      auditLog: (json['auditLog'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(AuditLogItem.fromJson)
          .toList(),
      metrics: AdminMetrics.fromJson(
        (json['metrics'] as Map<String, dynamic>?) ?? const {},
      ),
      escalations: (json['escalations'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(EscalationItem.fromJson)
          .toList(),
      receipt: json['receipt'] is Map<String, dynamic>
          ? ScheduleReceipt.fromJson(json['receipt'] as Map<String, dynamic>)
          : null,
      notifications: (json['notifications'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(NotificationItem.fromJson)
          .toList(),
      waitlistSectionIds:
          (json['waitlistSectionIds'] as List<dynamic>? ?? const [])
              .map((e) => e.toString())
              .toList(),
      waitlistEntries: (json['waitlistEntries'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(WaitlistEntry.fromJson)
          .toList(),
      dagSummary: json['dagSummary'] is Map<String, dynamic>
          ? DagSummary.fromJson(json['dagSummary'] as Map<String, dynamic>)
          : null,
      rdsFallbackPrompt: json['rdsFallbackPrompt'] is Map<String, dynamic>
          ? RdsFallbackPrompt.fromJson(
              json['rdsFallbackPrompt'] as Map<String, dynamic>,
            )
          : null,
    );
  }
}

enum StageResultKind { staged, ruleAlert, sectionFull, error }

class StageResult {
  final StageResultKind kind;
  final BackendState? state;
  final CourseSection? section;
  final String? ruleCode;
  final int? studentCredits;
  final int? requiredCredits;
  final bool? overrideEligible;
  final List<String> missingPrerequisites;
  final List<CourseSection> conflictingSections;
  final CourseSection? fullSection;
  final List<CourseSection> alternatives;
  final String? message;

  const StageResult._({
    required this.kind,
    this.state,
    this.section,
    this.ruleCode,
    this.studentCredits,
    this.requiredCredits,
    this.overrideEligible,
    this.missingPrerequisites = const [],
    this.conflictingSections = const [],
    this.fullSection,
    this.alternatives = const [],
    this.message,
  });

  bool get isStaged => kind == StageResultKind.staged;

  factory StageResult.staged({BackendState? state, CourseSection? section}) {
    return StageResult._(
      kind: StageResultKind.staged,
      state: state,
      section: section,
    );
  }

  factory StageResult.ruleAlert({
    CourseSection? section,
    required String ruleCode,
    int? studentCredits,
    int? requiredCredits,
    bool? overrideEligible,
    List<String> missingPrerequisites = const [],
    List<CourseSection> conflictingSections = const [],
    String? message,
  }) {
    return StageResult._(
      kind: StageResultKind.ruleAlert,
      section: section,
      ruleCode: ruleCode,
      studentCredits: studentCredits,
      requiredCredits: requiredCredits,
      overrideEligible: overrideEligible,
      missingPrerequisites: missingPrerequisites,
      conflictingSections: conflictingSections,
      message: message,
    );
  }

  factory StageResult.sectionFull({
    CourseSection? fullSection,
    List<CourseSection> alternatives = const [],
    String? message,
  }) {
    return StageResult._(
      kind: StageResultKind.sectionFull,
      fullSection: fullSection,
      alternatives: alternatives,
      message: message,
    );
  }

  factory StageResult.error(String message) {
    return StageResult._(
      kind: StageResultKind.error,
      message: message,
    );
  }
}

class EnrollConfirmResult {
  final bool ok;
  final ScheduleReceipt? receipt;
  final BackendState? state;
  final RdsFallbackPrompt? fallbackPrompt;
  final String? message;

  const EnrollConfirmResult({
    required this.ok,
    this.receipt,
    this.state,
    this.fallbackPrompt,
    this.message,
  });

  factory EnrollConfirmResult.fromJson(Map<String, dynamic> json) {
    return EnrollConfirmResult(
      ok: json['ok'] == true,
      receipt: json['receipt'] is Map<String, dynamic>
          ? ScheduleReceipt.fromJson(json['receipt'] as Map<String, dynamic>)
          : null,
      state: json['state'] is Map<String, dynamic>
          ? BackendState.fromJson(json['state'] as Map<String, dynamic>)
          : null,
      fallbackPrompt: json['fallbackPrompt'] is Map<String, dynamic>
          ? RdsFallbackPrompt.fromJson(
              json['fallbackPrompt'] as Map<String, dynamic>,
            )
          : null,
      message: json['message']?.toString(),
    );
  }
}

class SyncEvent {
  final String type; // SYNC_UPDATE | RDS_FALLBACK | NOTIFICATION | PONG
  final String? studentId;
  final BackendState? state;
  final Map<String, dynamic>? payload;
  final int? timestamp;

  const SyncEvent({
    required this.type,
    this.studentId,
    this.state,
    this.payload,
    this.timestamp,
  });

  factory SyncEvent.fromJson(Map<String, dynamic> json) {
    return SyncEvent(
      type: (json['type'] ?? '').toString(),
      studentId: json['studentId']?.toString(),
      state: json['state'] is Map<String, dynamic>
          ? BackendState.fromJson(json['state'] as Map<String, dynamic>)
          : null,
      payload: json['payload'] is Map<String, dynamic>
          ? json['payload'] as Map<String, dynamic>
          : null,
      timestamp: (json['timestamp'] as num?)?.toInt(),
    );
  }
}
