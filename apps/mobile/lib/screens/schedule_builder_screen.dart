import 'package:flutter/material.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/bottom_sheets.dart';

class ScheduleBuilderScreen extends StatelessWidget {
  final AppState appState;

  const ScheduleBuilderScreen({super.key, required this.appState});

  @override
  Widget build(BuildContext context) {
    final stagedSections = appState.stagedSections;
    final clashes = appState.clashes;
    final clashCount = clashes.length;
    final hasSaturday = stagedSections.any(
      (s) => DayCodeHelper.expandDayCodes(s.days).contains('Sat'),
    );
    final clashingSectionIds = <String>{
      for (final c in clashes) ...[c.sectionA.id, c.sectionB.id],
    };

    // Distinct time slots sorted chronologically
    final timeSlots = stagedSections.map((s) => s.timeSlot).toSet().toList()
      ..sort((a, b) {
        final startA = DayCodeHelper.parseTimeSlot(a)?.startMin ?? 0;
        final startB = DayCodeHelper.parseTimeSlot(b)?.startMin ?? 0;
        return startA.compareTo(startB);
      });

    final fallbackPrompt = appState.rdsFallbackPrompt;
    final hasActiveFallback =
        fallbackPrompt != null && !fallbackPrompt.resolved;
    final solveResult = appState.lastSolveResult;
    final fitLabel = solveResult != null
        ? 'Gap ${solveResult.idleGapMinutes}m AI'
        : '96% Plan Fit AI';

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header & Strategy Toggle (Wrap prevents 360dp truncation/overflow)
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            runSpacing: 10,
            children: [
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Instant Schedule AI Builder',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.navy,
                      letterSpacing: -0.2,
                    ),
                  ),
                  Text(
                    'Zero-Clash Optimization Engine',
                    style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  color: AppTheme.canvasAlt,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppTheme.border),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _buildStrategyPill(
                      label: 'Milestone',
                      isSelected: appState.isMilestoneFirst,
                      onTap: () => appState.toggleStrategy(true),
                    ),
                    _buildStrategyPill(
                      label: 'Min Gaps',
                      isSelected: !appState.isMilestoneFirst,
                      onTap: () => appState.toggleStrategy(false),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // KPI Badges Row
          Row(
            children: [
              _buildKpiBadge(
                label:
                    '${appState.totalCredits.toStringAsFixed(1)} / ${appState.maxCredits.toStringAsFixed(1)} Cr',
                icon: Icons.school_outlined,
                color: AppTheme.navy,
              ),
              const SizedBox(width: 8),
              _buildKpiBadge(
                label: '$clashCount ${clashCount <= 1 ? 'Clash' : 'Clashes'}',
                icon: clashCount == 0
                    ? Icons.check_circle_outline
                    : Icons.error_outline_rounded,
                color: clashCount == 0 ? AppTheme.emerald : AppTheme.crimson,
              ),
              const SizedBox(width: 8),
              _buildKpiBadge(
                label: fitLabel,
                icon: Icons.auto_awesome,
                color: AppTheme.teal,
              ),
            ],
          ),

          if (clashCount > 0) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.crimsonLight,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.crimson.withOpacity(0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'TIMETABLE CLASH DETECTED',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.crimsonDark,
                    ),
                  ),
                  const SizedBox(height: 4),
                  ...clashes.map(
                    (c) => Text(
                      '• ${c.sectionA.courseCode} (${c.sectionA.days}) vs ${c.sectionB.courseCode} (${c.sectionB.days}) on ${c.day}',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppTheme.crimsonDark,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          if (hasActiveFallback) ...[
            const SizedBox(height: 12),
            InkWell(
              onTap: () {
                MobileBottomSheets.showRdsFallbackSheet(
                  context,
                  prompt: fallbackPrompt,
                  appState: appState,
                );
              },
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.amberLight,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.amber.withOpacity(0.4)),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.sync_problem_rounded,
                      color: AppTheme.amberDark,
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'RDS Fallback ready for ${fallbackPrompt.failedCourseCode}. Tap to switch.',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.amberDark,
                        ),
                      ),
                    ),
                    const Text(
                      'Resolve →',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.navy,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],

          const SizedBox(height: 18),

          // Dynamic 6-Day Timetable Grid (Sun, Mon, Tue, Wed, Thu, Sat)
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
                        hasSaturday
                            ? '6-DAY TIMETABLE PREVIEW'
                            : '5-DAY TIMETABLE PREVIEW',
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.8,
                          color: AppTheme.textMuted,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Text(
                      'ST • MW • RA Pattern',
                      style: TextStyle(fontSize: 10, color: AppTheme.textMuted),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                // 6-Day Header: Sun, Mon, Tue, Wed, Thu, Sat
                Row(
                  children: DayCodeHelper.allWeekDays.map((day) {
                    return Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        margin: const EdgeInsets.symmetric(horizontal: 1),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppTheme.canvas,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          day,
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.navy,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 10),

                if (timeSlots.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Center(
                      child: Text(
                        'No courses staged in timetable yet.',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppTheme.textMuted,
                        ),
                      ),
                    ),
                  )
                else
                  ...timeSlots.map((slot) {
                    final cells = DayCodeHelper.allWeekDays.map((day) {
                      final matching = stagedSections.where((sec) {
                        if (sec.timeSlot != slot) return false;
                        return DayCodeHelper.expandDayCodes(sec.days)
                            .contains(day);
                      }).toList();
                      return matching;
                    }).toList();

                    return Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            slot,
                            style: const TextStyle(
                              fontSize: 9,
                              color: AppTheme.textMuted,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 3),
                          _buildDynamicTimetableRow(cells, clashingSectionIds),
                        ],
                      ),
                    );
                  }),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Staged Courses List Header + AI Optimize Trigger
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  'STAGED COURSES (${appState.stagedCourses.length})',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.8,
                    color: AppTheme.textMuted,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              InkWell(
                onTap: () async {
                  final messenger = ScaffoldMessenger.maybeOf(context);
                  final res = await appState.solveSchedule(applyToCart: true);
                  if (!context.mounted) return;
                  if (res != null) {
                    messenger?.showSnackBar(
                      SnackBar(
                        content: Text(
                          'AI ${res.strategy.wireValue} plan applied (${res.totalCredits.toStringAsFixed(1)} Cr, ${res.clashes.length} clashes).',
                        ),
                        backgroundColor: AppTheme.teal,
                      ),
                    );
                  }
                },
                child: const Text(
                  'AI Optimize Cart →',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppTheme.teal,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // Staged Course Cards
          ...List.generate(appState.stagedCourses.length, (index) {
            final course = appState.stagedCourses[index];
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _buildStagedCard(context, course),
            );
          }),

          const SizedBox(height: 16),

          // Confirm & Finalize Button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () async {
                final messenger = ScaffoldMessenger.maybeOf(context);
                final res = await appState.confirmEnrollment();
                if (!context.mounted) return;

                if (res.fallbackPrompt != null) {
                  MobileBottomSheets.showRdsFallbackSheet(
                    context,
                    prompt: res.fallbackPrompt!,
                    appState: appState,
                  );
                } else if (res.ok && res.receipt != null) {
                  final firstSec = res.receipt!.sections.isNotEmpty
                      ? res.receipt!.sections.first
                      : null;
                  MobileBottomSheets.showSeatApproved(
                    context,
                    courseCode: firstSec?.courseCode ?? 'Spring 2025',
                    sectionNumber: firstSec?.sectionNumber ?? 'Plan',
                    rdsToken: res.receipt!.transactionId,
                    digitalSignature: res.receipt!.digitalSignature,
                    totalCredits: res.receipt!.totalCredits,
                    onViewSchedule: () {},
                  );
                } else if (res.message != null) {
                  messenger?.showSnackBar(
                    SnackBar(
                      content: Text(res.message!),
                      backgroundColor: AppTheme.crimson,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.navy,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                elevation: 0,
              ),
              child: Text(
                'Confirm (${appState.totalCredits.toStringAsFixed(1)} Cr) Finalize →',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStrategyPill({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.navy : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.bold,
            color: isSelected ? Colors.white : AppTheme.textSecondary,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
    );
  }

  Widget _buildKpiBadge({
    required String label,
    required IconData icon,
    required Color color,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 4),
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                  maxLines: 1,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDynamicTimetableRow(
    List<List<CourseSection>> dayCells,
    Set<String> clashingSectionIds,
  ) {
    return Row(
      children: dayCells.map((cellSections) {
        final isEmpty = cellSections.isEmpty;
        final hasClash = cellSections.length > 1 ||
            cellSections.any((s) => clashingSectionIds.contains(s.id));
        final label = isEmpty
            ? '-'
            : cellSections.map((s) => s.courseCode).join('\n');

        return Expanded(
          child: Container(
            height: 38,
            margin: const EdgeInsets.symmetric(horizontal: 1.5),
            padding: const EdgeInsets.symmetric(horizontal: 2),
            decoration: BoxDecoration(
              color: hasClash
                  ? AppTheme.crimsonLight
                  : isEmpty
                      ? AppTheme.canvas
                      : cellSections.first.courseCode.contains('327')
                          ? AppTheme.navy.withOpacity(0.08)
                          : AppTheme.teal.withOpacity(0.12),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(
                color: hasClash
                    ? AppTheme.crimson
                    : isEmpty
                        ? AppTheme.border.withOpacity(0.5)
                        : AppTheme.border,
              ),
            ),
            child: Center(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                    color: hasClash
                        ? AppTheme.crimsonDark
                        : isEmpty
                            ? AppTheme.textMuted
                            : AppTheme.navy,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildStagedCard(BuildContext context, StagedCourse course) {
    final fullSectionObj = appState.findSectionById(course.resolvedSectionId);
    final alternatives = appState.alternativeSectionsFor(
      course.courseCode,
      excludeSectionId: course.resolvedSectionId,
    );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        '${course.courseCode} Sec ${course.sectionNumber}',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.navy,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '(${course.credits.toStringAsFixed(1)} Cr)',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppTheme.teal,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${course.days} ${course.timeSlot} • ${course.room}',
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
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextButton(
                onPressed: () {
                  final messenger = ScaffoldMessenger.maybeOf(context);
                  MobileBottomSheets.showSectionFullFallback(
                    context,
                    courseCode: course.courseCode,
                    fullSection: course.sectionNumber,
                    fullSectionObj: fullSectionObj,
                    alternatives: alternatives,
                    appState: appState,
                    onSelectAlternative: (newSec) async {
                      final normalizedCode =
                          course.courseCode.replaceAll(' ', '');
                      final newId = '$normalizedCode-$newSec';
                      final res = await appState.stageSection(newId);
                      if (!res.isStaged && res.message != null) {
                        messenger?.showSnackBar(
                          SnackBar(
                            content: Text(res.message!),
                            backgroundColor: AppTheme.crimson,
                          ),
                        );
                      }
                    },
                  );
                },
                style: TextButton.styleFrom(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text(
                  'Swap Sec',
                  style: TextStyle(fontSize: 11, color: AppTheme.teal),
                ),
              ),
              IconButton(
                onPressed: () =>
                    appState.unstageSection(course.resolvedSectionId),
                icon: const Icon(
                  Icons.close,
                  size: 16,
                  color: AppTheme.textMuted,
                ),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
