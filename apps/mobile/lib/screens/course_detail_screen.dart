import 'package:flutter/material.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/bottom_sheets.dart';

class CourseDetailScreen extends StatefulWidget {
  final AppState appState;
  final String courseCode;

  const CourseDetailScreen({
    super.key,
    required this.appState,
    this.courseCode = 'CSE 327',
  });

  @override
  State<CourseDetailScreen> createState() => _CourseDetailScreenState();
}

class _CourseDetailScreenState extends State<CourseDetailScreen> {
  String? _selectedSectionNumber;

  @override
  void initState() {
    super.initState();
    widget.appState.addListener(_onStateChanged);
  }

  @override
  void dispose() {
    widget.appState.removeListener(_onStateChanged);
    super.dispose();
  }

  void _onStateChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _stageAndHandleSection(CourseSection targetSec) async {
    final messenger = ScaffoldMessenger.maybeOf(context);
    final res = await widget.appState.stageSection(targetSec.id);
    if (!mounted) return;

    if (res.isStaged) {
      MobileBottomSheets.showSeatApproved(
        context,
        courseCode: targetSec.courseCode,
        sectionNumber: targetSec.sectionNumber,
        rdsToken: widget.appState.cartToken,
        onViewSchedule: () {
          Navigator.pop(context);
          widget.appState.setTab(1);
        },
      );
    } else if (res.kind == StageResultKind.ruleAlert) {
      MobileBottomSheets.showMissingPrereqRule42(
        context,
        targetCourse: targetSec.courseCode,
        sectionId: targetSec.id,
        ruleCode: res.ruleCode ?? 'RULE-4.2',
        studentCredits: res.studentCredits,
        requiredCredits: res.requiredCredits,
        missingPrerequisites: res.missingPrerequisites,
        conflictingSections: res.conflictingSections,
        appState: widget.appState,
      );
    } else if (res.kind == StageResultKind.sectionFull) {
      MobileBottomSheets.showSectionFullFallback(
        context,
        courseCode: targetSec.courseCode,
        fullSection: targetSec.sectionNumber,
        fullSectionObj: res.fullSection ?? targetSec,
        alternatives: res.alternatives,
        appState: widget.appState,
        onSelectAlternative: (altSec) {
          if (mounted) {
            setState(() => _selectedSectionNumber = altSec);
          }
        },
      );
    } else if (res.message != null) {
      messenger?.showSnackBar(
        SnackBar(
          content: Text(res.message!),
          backgroundColor: AppTheme.crimson,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final sections = widget.appState.sectionsForCourse(widget.courseCode);
    if (sections.isEmpty) {
      return Scaffold(
        appBar: AppBar(
          backgroundColor: AppTheme.navy,
          foregroundColor: Colors.white,
          title: Text('${widget.courseCode} • Section Picker'),
        ),
        body: const Center(
          child: Text('No sections available for this course.'),
        ),
      );
    }

    final activeSelection = _selectedSectionNumber != null &&
            sections.any((s) => s.sectionNumber == _selectedSectionNumber)
        ? _selectedSectionNumber!
        : sections.first.sectionNumber;

    final primary = sections.first;
    final openSectionsCount = sections.where((s) => !s.isFull).length;
    final avgEnrolled =
        (sections.fold<int>(0, (sum, s) => sum + s.enrolled) / sections.length)
            .round();
    final avgCapacity =
        (sections.fold<int>(0, (sum, s) => sum + s.capacity) / sections.length)
            .round();

    final clearedGrades = <String, String>{
      for (final c in widget.appState.student.clearedCourses)
        DayCodeHelper.normalizeCourseCode(c.code): c.grade,
    };

    final prereqs = primary.prerequisites;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.navy,
        foregroundColor: Colors.white,
        title: Text(
          '${primary.courseCode} • Section Picker',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Course Header Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          primary.courseCode,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            color: AppTheme.navy,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.navy.withOpacity(0.08),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            '${primary.credits.toStringAsFixed(1)} Cr • ${primary.department}',
                            style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.navy,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    primary.courseTitle.isNotEmpty
                        ? primary.courseTitle
                        : primary.courseCode,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Stats Row
                  Row(
                    children: [
                      _buildStatBox(
                        '${sections.length.toString().padLeft(2, '0')} Total',
                        'Sections',
                      ),
                      const SizedBox(width: 8),
                      _buildStatBox(
                        '${openSectionsCount.toString().padLeft(2, '0')} Sec Open',
                        'Seat Availability',
                        isPositive: openSectionsCount > 0,
                      ),
                      const SizedBox(width: 8),
                      _buildStatBox('$avgEnrolled/$avgCapacity', 'Avg Capacity'),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Prerequisite DAG Chain
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'PREREQUISITE DIRECTED ACYCLIC GRAPH (DAG)',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.8,
                      color: AppTheme.textMuted,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      if (prereqs.isEmpty)
                        _buildDagNode('No Prereqs', 'Entry Level', true)
                      else
                        for (final p in prereqs) ...[
                          Builder(
                            builder: (_) {
                              final norm = DayCodeHelper.normalizeCourseCode(p);
                              final grade = clearedGrades[norm];
                              final passed = grade != null;
                              return _buildDagNode(
                                p,
                                passed ? 'Grade: $grade' : 'Missing',
                                passed,
                              );
                            },
                          ),
                          const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 4),
                            child: Icon(
                              Icons.arrow_forward_rounded,
                              size: 16,
                              color: AppTheme.emerald,
                            ),
                          ),
                        ],
                      if (primary.minCreditsRequired != null) ...[
                        _buildDagNode(
                          '${primary.minCreditsRequired}+ Cr',
                          '${widget.appState.completedCredits}/${primary.minCreditsRequired}',
                          widget.appState.completedCredits >=
                              primary.minCreditsRequired!,
                        ),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 4),
                          child: Icon(
                            Icons.arrow_forward_rounded,
                            size: 16,
                            color: AppTheme.amber,
                          ),
                        ),
                      ],
                      _buildDagNode(
                        primary.courseCode,
                        'Target',
                        false,
                        isTarget: true,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            const Text(
              'SELECTABLE SECTIONS',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.8,
                color: AppTheme.textMuted,
              ),
            ),
            const SizedBox(height: 10),

            ...sections.map((sec) {
              final isSelected = activeSelection == sec.sectionNumber;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _buildSectionCard(sec, isSelected),
              );
            }),
          ],
        ),
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          border: const Border(top: BorderSide(color: AppTheme.border)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.06),
              blurRadius: 10,
              offset: const Offset(0, -3),
            ),
          ],
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.lock_clock_outlined,
                    size: 14,
                    color: AppTheme.teal,
                  ),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      '60s atomic reservation lock will be activated',
                      style: TextStyle(
                        fontSize: 11,
                        color: AppTheme.teal.withOpacity(0.9),
                        fontWeight: FontWeight.w600,
                      ),
                      overflow: TextOverflow.ellipsis,
                      maxLines: 1,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () async {
                    final targetSec = sections.firstWhere(
                      (s) => s.sectionNumber == activeSelection,
                      orElse: () => sections.first,
                    );
                    await _stageAndHandleSection(targetSec);
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.teal,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 0,
                  ),
                  child: const Text(
                    'Confirm & Add to Advising Cart →',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatBox(String val, String label, {bool isPositive = false}) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
        decoration: BoxDecoration(
          color: isPositive ? AppTheme.emeraldLight : AppTheme.canvas,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isPositive
                ? AppTheme.emerald.withOpacity(0.3)
                : AppTheme.border,
          ),
        ),
        child: Column(
          children: [
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                val,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: isPositive ? AppTheme.emeraldDark : AppTheme.navy,
                ),
                maxLines: 1,
              ),
            ),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                label,
                style: const TextStyle(fontSize: 9, color: AppTheme.textMuted),
                maxLines: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDagNode(
    String course,
    String grade,
    bool passed, {
    bool isTarget = false,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        decoration: BoxDecoration(
          color: passed
              ? AppTheme.emeraldLight
              : isTarget
                  ? AppTheme.navy.withOpacity(0.08)
                  : AppTheme.amberLight,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: passed
                ? AppTheme.emerald.withOpacity(0.4)
                : isTarget
                    ? AppTheme.navy.withOpacity(0.3)
                    : AppTheme.amber.withOpacity(0.4),
          ),
        ),
        child: Column(
          children: [
            Text(
              course,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                color: passed
                    ? AppTheme.emeraldDark
                    : isTarget
                        ? AppTheme.navy
                        : AppTheme.amberDark,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              grade,
              style: const TextStyle(fontSize: 9, color: AppTheme.textMuted),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionCard(
    CourseSection sec,
    bool isSelected,
  ) {
    return InkWell(
      onTap: () async {
        setState(() => _selectedSectionNumber = sec.sectionNumber);
        if (sec.isFull) {
          await _stageAndHandleSection(sec);
        }
      },
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.teal.withOpacity(0.05) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? AppTheme.teal : AppTheme.border,
            width: isSelected ? 1.8 : 1.0,
          ),
        ),
        child: Row(
          children: [
            Icon(
              isSelected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: isSelected ? AppTheme.teal : AppTheme.textMuted,
              size: 20,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          'Sec ${sec.sectionNumber}',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.navy,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: sec.isFull
                                ? AppTheme.crimsonLight
                                : sec.isFewSeats
                                    ? AppTheme.amberLight
                                    : AppTheme.emeraldLight,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            sec.displayBadge,
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: sec.isFull
                                  ? AppTheme.crimson
                                  : sec.isFewSeats
                                      ? AppTheme.amberDark
                                      : AppTheme.emeraldDark,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    sec.faculty,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    '${sec.days} ${sec.timeSlot} • ${sec.room}',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.textMuted,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${sec.availableSeats}/${sec.capacity}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    fontFamily: 'monospace',
                    color: sec.isFull ? AppTheme.crimson : AppTheme.navy,
                  ),
                ),
                Text(
                  sec.isFull ? 'Waitlisted' : 'Open Seats',
                  style: const TextStyle(
                    fontSize: 9,
                    color: AppTheme.textMuted,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
