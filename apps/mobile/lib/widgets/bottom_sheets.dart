import 'package:flutter/material.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';

class MobileBottomSheets {
  /// 1. SEAT / ENROLLMENT RECEIPT APPROVED SHEET
  static void showSeatApproved(
    BuildContext context, {
    String courseCode = 'CSE 327',
    String sectionNumber = '01',
    String rdsToken = '#NSU-241215-327A',
    String? digitalSignature,
    double? totalCredits,
    VoidCallback? onViewSchedule,
  }) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(ctx).viewInsets.bottom,
            ),
            child: Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
              ),
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 20),
                    decoration: BoxDecoration(
                      color: AppTheme.border,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: AppTheme.emeraldLight,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: AppTheme.emerald.withOpacity(0.3),
                        width: 2,
                      ),
                    ),
                    child: const Icon(
                      Icons.check_circle_rounded,
                      color: AppTheme.emerald,
                      size: 40,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Seat Reservation Confirmed',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.navy,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.navy,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Text(
                          'LOCKED',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.8,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          totalCredits != null
                              ? '$courseCode Sec $sectionNumber • ${totalCredits.toStringAsFixed(1)} Cr'
                              : '$courseCode Sec $sectionNumber',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textSecondary,
                          ),
                          overflow: TextOverflow.ellipsis,
                          maxLines: 1,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: AppTheme.canvas,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Flexible(
                              child: Text(
                                'RDS Transaction Token',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: AppTheme.textMuted,
                                ),
                                overflow: TextOverflow.ellipsis,
                                maxLines: 1,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                rdsToken,
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  fontFamily: 'monospace',
                                  color: AppTheme.navy,
                                ),
                                overflow: TextOverflow.ellipsis,
                                maxLines: 1,
                              ),
                            ),
                          ],
                        ),
                        if (digitalSignature != null &&
                            digitalSignature.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          const Divider(height: 1, color: AppTheme.border),
                          const SizedBox(height: 8),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'Signature',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: AppTheme.textMuted,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  digitalSignature,
                                  textAlign: TextAlign.end,
                                  style: const TextStyle(
                                    fontSize: 10,
                                    fontFamily: 'monospace',
                                    color: AppTheme.textSecondary,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ],
                        const SizedBox(height: 8),
                        const Divider(height: 1, color: AppTheme.border),
                        const SizedBox(height: 8),
                        const Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Flexible(
                              child: Text(
                                'Atomic Lock Buffer',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: AppTheme.textMuted,
                                ),
                                overflow: TextOverflow.ellipsis,
                                maxLines: 1,
                              ),
                            ),
                            SizedBox(width: 8),
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.bolt,
                                  color: AppTheme.emerald,
                                  size: 16,
                                ),
                                SizedBox(width: 4),
                                Text(
                                  'Atomic Sync OK',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                    color: AppTheme.emeraldDark,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () {
                        Navigator.pop(ctx);
                        onViewSchedule?.call();
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
                        'View Conflict-Free Schedule →',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  /// 2. MISSING PREREQUISITE / RULE 4.2 / RULE 2.1 / RULE 6.3 SHEET
  static void showMissingPrereqRule42(
    BuildContext context, {
    String targetCourse = 'CSE 425',
    String? sectionId,
    String ruleCode = 'RULE-4.2',
    int? studentCredits,
    int? requiredCredits,
    List<String> missingPrerequisites = const [],
    List<CourseSection> conflictingSections = const [],
    AppState? appState,
  }) {
    final earned = studentCredits ?? appState?.completedCredits ?? 96;
    final required = requiredCredits ?? 100;
    final deficit = required - earned;
    final isExamLoadRule = ruleCode == 'RULE-6.3';
    final isPrereqRule = !isExamLoadRule &&
        (ruleCode == 'RULE-2.1' || missingPrerequisites.isNotEmpty);

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        var isSubmitting = false;
        return StatefulBuilder(
          builder: (sheetCtx, setSheetState) {
            return SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: EdgeInsets.only(
                  bottom: MediaQuery.of(ctx).viewInsets.bottom,
                ),
                child: Container(
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.vertical(
                      top: Radius.circular(24),
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          margin: const EdgeInsets.only(bottom: 20),
                          decoration: BoxDecoration(
                            color: AppTheme.border,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppTheme.amberLight,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(
                              Icons.warning_amber_rounded,
                              color: AppTheme.amber,
                              size: 24,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  isExamLoadRule
                                      ? 'Academic RULE-6.3 Exam Load Check'
                                      : isPrereqRule
                                          ? 'Academic $ruleCode Prerequisite Check'
                                          : 'Academic Rule 4.2 Floor Check',
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                    color: AppTheme.navy,
                                  ),
                                ),
                                Text(
                                  isExamLoadRule
                                      ? 'Consecutive Final Exam Load Audit'
                                      : 'Prerequisite & Senior Standing Audit',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppTheme.textMuted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppTheme.canvas,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppTheme.border),
                        ),
                        child: isExamLoadRule
                            ? Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'CONSECUTIVE EXAM LOAD CONFLICT (24H WINDOW)',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      letterSpacing: 0.6,
                                      color: AppTheme.textMuted,
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  if (conflictingSections.isEmpty)
                                    Text(
                                      '$targetCourse triggers 3+ consecutive final exams within 24 hours.',
                                      style: const TextStyle(
                                        fontSize: 12,
                                        color: AppTheme.textSecondary,
                                      ),
                                    )
                                  else
                                    ...conflictingSections.map(
                                      (sec) => Padding(
                                        padding:
                                            const EdgeInsets.only(bottom: 4),
                                        child: Text(
                                          '• ${sec.courseCode} Sec ${sec.sectionNumber} (${sec.examSlot ?? '${sec.days} ${sec.timeSlot}'})',
                                          style: const TextStyle(
                                            fontSize: 12,
                                            fontWeight: FontWeight.w600,
                                            color: AppTheme.navy,
                                          ),
                                        ),
                                      ),
                                    ),
                                ],
                              )
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'PREREQUISITE DEPENDENCY GRAPH',
                                    style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.bold,
                                      letterSpacing: 0.6,
                                      color: AppTheme.textMuted,
                                    ),
                                  ),
                                  const SizedBox(height: 10),
                                  Row(
                                    children: [
                                      _buildDagChip(
                                        missingPrerequisites.isNotEmpty
                                            ? missingPrerequisites.first
                                            : 'CSE 215',
                                        missingPrerequisites.isNotEmpty
                                            ? 'Missing'
                                            : 'Completed (A)',
                                        missingPrerequisites.isEmpty,
                                      ),
                                      const Padding(
                                        padding:
                                            EdgeInsets.symmetric(horizontal: 6),
                                        child: Icon(
                                          Icons.arrow_forward,
                                          size: 14,
                                          color: AppTheme.textMuted,
                                        ),
                                      ),
                                      _buildDagChip(
                                        '$required+ Cr',
                                        '$earned/$required Cr',
                                        earned >= required,
                                      ),
                                      const Padding(
                                        padding:
                                            EdgeInsets.symmetric(horizontal: 6),
                                        child: Icon(
                                          Icons.arrow_forward,
                                          size: 14,
                                          color: AppTheme.textMuted,
                                        ),
                                      ),
                                      _buildDagChip(
                                        targetCourse,
                                        'Target',
                                        false,
                                        isTarget: true,
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        isExamLoadRule
                            ? 'Staging $targetCourse triggers RULE-6.3 (3 or more consecutive final exams within 24 hours). Submit an exception waiver or select another section.'
                            : isPrereqRule
                                ? 'Missing prerequisite(s): ${missingPrerequisites.join(', ')}. Submit a $ruleCode waiver request for advisor approval.'
                                : 'Registration for 400-level electives requires completion of $required+ academic credits. You have earned $earned.0 credits (Deficit: -$deficit.0 Cr). Advisor sign-off is required under Rule 4.2 Standing Waiver.',
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.textSecondary,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 20),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () {
                                final messenger =
                                    ScaffoldMessenger.maybeOf(context);
                                Navigator.pop(ctx);
                                messenger?.showSnackBar(
                                  const SnackBar(
                                    content: Text(
                                      'Suggested eligible electives displayed in catalog.',
                                    ),
                                    backgroundColor: AppTheme.navy,
                                  ),
                                );
                              },
                              style: OutlinedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 12,
                                  horizontal: 4,
                                ),
                                side: const BorderSide(color: AppTheme.border),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                              child: const FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                  'Take Eligible Alt',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: AppTheme.textPrimary,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: isSubmitting
                                  ? null
                                  : () async {
                                      setSheetState(() => isSubmitting = true);
                                      final messenger =
                                          ScaffoldMessenger.maybeOf(context);
                                      final reasonText = isExamLoadRule
                                          ? 'Requesting RULE-6.3 consecutive exam load waiver for $targetCourse.'
                                          : isPrereqRule
                                              ? 'Requesting $ruleCode co-registration waiver for $targetCourse.'
                                              : 'Requesting Rule 4.2 Senior Standing waiver for $targetCourse ($earned/$required Cr).';

                                      final result =
                                          await appState?.submitPetition(
                                        sectionId: sectionId,
                                        courseCode: targetCourse,
                                        ruleCode: ruleCode,
                                        reason: reasonText,
                                      );
                                      if (!ctx.mounted) return;
                                      Navigator.pop(ctx);
                                      messenger?.showSnackBar(
                                        SnackBar(
                                          content: Text(
                                            result != null
                                                ? 'Exception petition logged (${result.id}).'
                                                : 'Exception request queued for advisor review.',
                                          ),
                                          backgroundColor: AppTheme.emeraldDark,
                                        ),
                                      );
                                    },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.amber,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(
                                  vertical: 12,
                                  horizontal: 4,
                                ),
                                elevation: 0,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10),
                                ),
                              ),
                              child: const FittedBox(
                                fit: BoxFit.scaleDown,
                                child: Text(
                                  'Ask Advisor Exception',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  /// 3. SECTION FULL FALLBACK SHEET
  static void showSectionFullFallback(
    BuildContext context, {
    String courseCode = 'CSE 327',
    String fullSection = '03',
    CourseSection? fullSectionObj,
    List<CourseSection>? alternatives,
    AppState? appState,
    Function(String secNumber)? onSelectAlternative,
  }) {
    final resolvedSectionId = fullSectionObj?.id ??
        '${courseCode.replaceAll(' ', '')}-$fullSection';
    final alreadyWaitlisted =
        appState?.waitlistSectionIds.contains(resolvedSectionId) ?? false;
    var isWatchActive = alreadyWaitlisted;

    final altSections = alternatives ??
        appState?.alternativeSectionsFor(
          courseCode,
          excludeSectionId: resolvedSectionId,
        ) ??
        const <CourseSection>[];

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (sheetCtx, setModalState) {
            final facultyName = fullSectionObj?.faculty ?? 'Section Full';
            final capText = fullSectionObj != null
                ? '${fullSectionObj.enrolled}/${fullSectionObj.capacity}'
                : '40/40';
            return SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: EdgeInsets.only(
                  bottom: MediaQuery.of(ctx).viewInsets.bottom,
                ),
                child: Container(
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.vertical(
                      top: Radius.circular(24),
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          margin: const EdgeInsets.only(bottom: 20),
                          decoration: BoxDecoration(
                            color: AppTheme.border,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'CAPACITY REACHED ($capText)',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    letterSpacing: 0.8,
                                    color: AppTheme.crimson,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '$courseCode Sec $fullSection • $facultyName',
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                    color: AppTheme.navy,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: AppTheme.crimsonLight,
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: AppTheme.crimson.withOpacity(0.3),
                              ),
                            ),
                            child: const Text(
                              '0 Seats',
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.crimson,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppTheme.canvas,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppTheme.border),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.notifications_active_outlined,
                              color: AppTheme.teal,
                              size: 20,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Notify & Waitlist Sec $fullSection',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.bold,
                                      color: AppTheme.textPrimary,
                                    ),
                                  ),
                                  const Text(
                                    'Join live waitlist & SMS/Push seat radar',
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: AppTheme.textMuted,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Switch(
                              value: isWatchActive,
                              activeColor: AppTheme.teal,
                              onChanged: (val) async {
                                final messenger =
                                    ScaffoldMessenger.maybeOf(context);
                                setModalState(() => isWatchActive = val);
                                if (val && appState != null) {
                                  final entry = await appState
                                      .joinWaitlist(resolvedSectionId);
                                  if (!ctx.mounted) return;
                                  messenger?.showSnackBar(
                                    SnackBar(
                                      content: Text(
                                        entry != null
                                            ? 'Joined waitlist (#${entry.position}) for $courseCode Sec $fullSection.'
                                            : 'Waitlist watch enabled for $courseCode Sec $fullSection.',
                                      ),
                                      backgroundColor: AppTheme.teal,
                                    ),
                                  );
                                }
                              },
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),
                      const Text(
                        'RECOMMENDED ALTERNATIVES (INSTANT 1-TAP SWAP)',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.6,
                          color: AppTheme.textMuted,
                        ),
                      ),
                      const SizedBox(height: 10),
                      if (altSections.isEmpty)
                        const Text(
                          'No open alternative sections currently available. Enable waitlist watch above.',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppTheme.textSecondary,
                          ),
                        )
                      else
                        ...altSections.map((alt) {
                          final badgeColor = alt.isFewSeats
                              ? AppTheme.amber
                              : AppTheme.emerald;
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: _buildAlternativeTile(
                              title: 'Sec ${alt.sectionNumber} • ${alt.faculty}',
                              time: '${alt.days} ${alt.timeSlot}',
                              room: alt.room,
                              badge: alt.isFewSeats
                                  ? '${alt.availableSeats} Seats Left'
                                  : '${alt.availableSeats} Open Seats',
                              badgeColor: badgeColor,
                              onTap: () {
                                Navigator.pop(ctx);
                                onSelectAlternative?.call(alt.sectionNumber);
                              },
                            ),
                          );
                        }),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  /// 4. 1-CLICK RDS FALLBACK PROMPT SHEET (US-S4)
  static void showRdsFallbackSheet(
    BuildContext context, {
    required RdsFallbackPrompt prompt,
    required AppState appState,
    VoidCallback? onResolved,
  }) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        var isResolving = false;
        return StatefulBuilder(
          builder: (sheetCtx, setModalState) {
            return SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: EdgeInsets.only(
                  bottom: MediaQuery.of(ctx).viewInsets.bottom,
                ),
                child: Container(
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.vertical(
                      top: Radius.circular(24),
                    ),
                  ),
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          margin: const EdgeInsets.only(bottom: 20),
                          decoration: BoxDecoration(
                            color: AppTheme.border,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppTheme.crimsonLight,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(
                              Icons.sync_problem_rounded,
                              color: AppTheme.crimson,
                              size: 24,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  '1-Click RDS Fallback Recovery',
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.bold,
                                    color: AppTheme.navy,
                                  ),
                                ),
                                Text(
                                  '${prompt.failedCourseCode} (${prompt.failedSectionId})',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: AppTheme.crimson,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppTheme.crimsonLight,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: AppTheme.crimson.withOpacity(0.25),
                          ),
                        ),
                        child: Text(
                          prompt.reason,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppTheme.crimsonDark,
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      const Text(
                        'DAG-VERIFIED OPEN ALTERNATIVES (1-CLICK SWITCH)',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.7,
                          color: AppTheme.textMuted,
                        ),
                      ),
                      const SizedBox(height: 10),
                      if (prompt.alternatives.isEmpty)
                        const Text(
                          'No open alternative sections available for fallback.',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppTheme.textSecondary,
                          ),
                        )
                      else
                        ...prompt.alternatives.map((alt) {
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: _buildAlternativeTile(
                              title:
                                  '${alt.courseCode} Sec ${alt.sectionNumber} • ${alt.faculty}',
                              time: '${alt.days} ${alt.timeSlot}',
                              room: alt.room,
                              badge: isResolving
                                  ? 'Switching...'
                                  : '${alt.availableSeats} Open • Switch',
                              badgeColor: AppTheme.emerald,
                              onTap: isResolving
                                  ? () {}
                                  : () async {
                                      setModalState(() => isResolving = true);
                                      final res =
                                          await appState.resolveRdsFallback(
                                        failedSectionId: prompt.failedSectionId,
                                        fallbackSectionId: alt.id,
                                      );
                                      if (!ctx.mounted) return;
                                      Navigator.pop(ctx);
                                      onResolved?.call();
                                      if (res.ok &&
                                          res.receipt != null &&
                                          context.mounted) {
                                        showSeatApproved(
                                          context,
                                          courseCode: alt.courseCode,
                                          sectionNumber: alt.sectionNumber,
                                          rdsToken: res.receipt!.transactionId,
                                          digitalSignature:
                                              res.receipt!.digitalSignature,
                                          totalCredits:
                                              res.receipt!.totalCredits,
                                        );
                                      }
                                    },
                            ),
                          );
                        }),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  /// 5. SUBMIT NEW PETITION SHEET
  static void showSubmitPetitionSheet(
    BuildContext context, {
    required AppState appState,
  }) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SubmitPetitionSheet(appState: appState),
    );
  }

  static Widget _buildDagChip(
    String title,
    String subtitle,
    bool passed, {
    bool isTarget = false,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
        decoration: BoxDecoration(
          color: passed
              ? AppTheme.emeraldLight
              : isTarget
                  ? AppTheme.navy.withOpacity(0.06)
                  : AppTheme.amberLight,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: passed
                ? AppTheme.emerald.withOpacity(0.3)
                : isTarget
                    ? AppTheme.navy.withOpacity(0.2)
                    : AppTheme.amber.withOpacity(0.3),
          ),
        ),
        child: Column(
          children: [
            Text(
              title,
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
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: const TextStyle(fontSize: 9, color: AppTheme.textMuted),
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  static Widget _buildAlternativeTile({
    required String title,
    required String time,
    required String room,
    required String badge,
    required Color badgeColor,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
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
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.navy,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '$time • $room',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.textSecondary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: badgeColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: badgeColor.withOpacity(0.25)),
              ),
              child: Text(
                badge,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: badgeColor,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SubmitPetitionSheet extends StatefulWidget {
  final AppState appState;

  const _SubmitPetitionSheet({required this.appState});

  @override
  State<_SubmitPetitionSheet> createState() => _SubmitPetitionSheetState();
}

class _SubmitPetitionSheetState extends State<_SubmitPetitionSheet> {
  final _reasonController = TextEditingController();
  String _selectedCourse = 'CSE 425';
  String _selectedRule = 'RULE-4.2';
  bool _submitting = false;
  String? _validationError;

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final courses = widget.appState.catalogCourses
        .map((c) => c.code)
        .toSet()
        .toList();
    if (!courses.contains(_selectedCourse) && courses.isNotEmpty) {
      _selectedCourse = courses.first;
    }

    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: AppTheme.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const Text(
                'Submit Advising Exception Petition',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.navy,
                ),
              ),
              const SizedBox(height: 14),
              DropdownButtonFormField<String>(
                value: _selectedCourse,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Target Course',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                items: courses
                    .map(
                      (c) => DropdownMenuItem(
                        value: c,
                        child: Text(
                          c,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (val) {
                  if (val != null) setState(() => _selectedCourse = val);
                },
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: _selectedRule,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Rule Code',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'RULE-4.2',
                    child: Text(
                      'RULE-4.2 (Credit Floor)',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  DropdownMenuItem(
                    value: 'RULE-2.1',
                    child: Text(
                      'RULE-2.1 (Prerequisite Waiver)',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  DropdownMenuItem(
                    value: 'RULE-8.4',
                    child: Text(
                      'RULE-8.4 (Capacity Override)',
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
                onChanged: (val) {
                  if (val != null) setState(() => _selectedRule = val);
                },
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _reasonController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Academic Justification (min 5 chars)',
                  hintText: 'Explain why you need this advising exception...',
                  border: OutlineInputBorder(),
                ),
              ),
              if (_validationError != null) ...[
                const SizedBox(height: 8),
                Text(
                  _validationError!,
                  style: const TextStyle(fontSize: 11, color: AppTheme.crimson),
                ),
              ],
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submitting
                      ? null
                      : () async {
                          final reason = _reasonController.text.trim();
                          if (reason.length < 5) {
                            setState(() {
                              _validationError =
                                  'Please enter at least 5 characters.';
                            });
                            return;
                          }
                          setState(() {
                            _submitting = true;
                            _validationError = null;
                          });
                          final secs = widget.appState
                              .sectionsForCourse(_selectedCourse);
                          final created = await widget.appState.submitPetition(
                            sectionId: secs.isNotEmpty ? secs.first.id : null,
                            courseCode: _selectedCourse,
                            ruleCode: _selectedRule,
                            reason: reason,
                          );
                          if (!context.mounted) return;
                          Navigator.pop(context);
                          ScaffoldMessenger.maybeOf(context)?.showSnackBar(
                            SnackBar(
                              content: Text(
                                created != null
                                    ? 'Petition ${created.id} submitted to faculty queue.'
                                    : 'Petition submitted.',
                              ),
                              backgroundColor: AppTheme.emeraldDark,
                            ),
                          );
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.navy,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(
                    _submitting ? 'Submitting...' : 'Submit Petition →',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
