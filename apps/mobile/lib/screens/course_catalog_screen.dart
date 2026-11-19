import 'package:flutter/material.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/bottom_sheets.dart';
import 'course_detail_screen.dart';

class CourseCatalogScreen extends StatefulWidget {
  final AppState appState;

  const CourseCatalogScreen({super.key, required this.appState});

  @override
  State<CourseCatalogScreen> createState() => _CourseCatalogScreenState();
}

class _CourseCatalogScreenState extends State<CourseCatalogScreen> {
  String _selectedFilterKey = 'all';
  String _searchQuery = '';

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

  @override
  Widget build(BuildContext context) {
    final allCourses = widget.appState.catalogCourses;
    final filtered = allCourses.where((course) {
      if (_selectedFilterKey == 'eligible' && course.isPrereqBlocked) {
        return false;
      }
      if (_selectedFilterKey == 'available' && !course.hasAvailableSeats) {
        return false;
      }
      if (_searchQuery.isNotEmpty) {
        final q = _searchQuery.toLowerCase();
        return course.code.toLowerCase().contains(q) ||
            course.title.toLowerCase().contains(q);
      }
      return true;
    }).toList();

    final filters = [
      (key: 'all', label: 'All (${allCourses.length})'),
      (key: 'eligible', label: 'Eligible for me'),
      (key: 'available', label: 'Available Seats'),
    ];

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.navy,
        foregroundColor: Colors.white,
        title: const Text(
          'Course Catalog & Search',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
      ),
      body: Column(
        children: [
          // Search & Filter header container
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            color: Colors.white,
            child: Column(
              children: [
                TextField(
                  onChanged: (val) => setState(() => _searchQuery = val),
                  decoration: InputDecoration(
                    hintText: 'Search course code or title (e.g. CSE 327)...',
                    hintStyle: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textMuted,
                    ),
                    prefixIcon: const Icon(
                      Icons.search,
                      size: 20,
                      color: AppTheme.textMuted,
                    ),
                    filled: true,
                    fillColor: AppTheme.canvas,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: AppTheme.border),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: AppTheme.border),
                    ),
                  ),
                ),
                const SizedBox(height: 10),

                // Filter Chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: filters.map((f) {
                      final isSelected = _selectedFilterKey == f.key;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(f.label),
                          labelStyle: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: isSelected
                                ? Colors.white
                                : AppTheme.textSecondary,
                          ),
                          selected: isSelected,
                          selectedColor: AppTheme.navy,
                          backgroundColor: AppTheme.canvas,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(20),
                            side: BorderSide(
                              color:
                                  isSelected ? AppTheme.navy : AppTheme.border,
                            ),
                          ),
                          onSelected: (_) =>
                              setState(() => _selectedFilterKey = f.key),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AppTheme.border),

          // Course Cards List
          Expanded(
            child: filtered.isEmpty
                ? const Center(
                    child: Text(
                      'No matching courses found.',
                      style: TextStyle(
                        fontSize: 13,
                        color: AppTheme.textMuted,
                      ),
                    ),
                  )
                : ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (ctx, index) {
                      return _buildCourseCard(filtered[index]);
                    },
                  ),
          ),

          // Floating Bottom Cart Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            decoration: BoxDecoration(
              color: AppTheme.navy,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.12),
                  blurRadius: 10,
                  offset: const Offset(0, -3),
                ),
              ],
            ),
            child: SafeArea(
              top: false,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text(
                          'ADVISING CART',
                          style: TextStyle(
                            color: Colors.white70,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          '${widget.appState.totalCredits.toStringAsFixed(1)} / ${widget.appState.maxCredits.toStringAsFixed(1)} Cr (${widget.appState.stagedCourses.length} Staged)',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: () {
                      Navigator.pop(context);
                      widget.appState.setTab(1);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.teal,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 18,
                        vertical: 10,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      elevation: 0,
                    ),
                    child: const Text(
                      'Review Cart →',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCourseCard(CourseItem course) {
    final firstSec = course.sections.first;
    final hasMultiSections = course.sections.length > 1;

    return InkWell(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => CourseDetailScreen(
              appState: widget.appState,
              courseCode: course.code,
            ),
          ),
        );
      },
      borderRadius: BorderRadius.circular(16),
      child: Container(
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
                    course.code,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.navy,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.canvasAlt,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    '${course.credits.toStringAsFixed(1)} Cr',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.navy,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              course.title,
              style: const TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
              ),
            ),
            if (course.prereqNote.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                course.prereqNote,
                style: const TextStyle(
                  fontSize: 11,
                  color: AppTheme.amberDark,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            const SizedBox(height: 12),

            if (course.isPrereqBlocked)
              Builder(
                builder: (context) {
                  final hasApprovedCreditWaiver = widget.appState.exceptions.any(
                    (ex) =>
                        ex.status == PetitionStatus.approved &&
                        ex.studentId == widget.appState.studentId &&
                        DayCodeHelper.normalizeCourseCode(ex.courseCode) ==
                            DayCodeHelper.normalizeCourseCode(course.code) &&
                        (ex.category == 'Credit Standing' ||
                            ex.ruleCode == 'RULE-4.2'),
                  );
                  final isCreditFloorBlocked =
                      firstSec.minCreditsRequired != null &&
                          widget.appState.completedCredits <
                              firstSec.minCreditsRequired! &&
                          !hasApprovedCreditWaiver;
                  final blockedRuleCode =
                      isCreditFloorBlocked ? 'RULE-4.2' : 'RULE-2.1';
                  return SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () {
                        MobileBottomSheets.showMissingPrereqRule42(
                          context,
                          targetCourse: course.code,
                          sectionId: firstSec.id,
                          ruleCode: blockedRuleCode,
                          studentCredits: widget.appState.completedCredits,
                          requiredCredits: firstSec.minCreditsRequired,
                          missingPrerequisites: isCreditFloorBlocked
                              ? const <String>[]
                              : course.missingPrerequisites,
                          appState: widget.appState,
                        );
                      },
                      icon: const Icon(Icons.lock_outline, size: 16),
                      label: Text(
                        isCreditFloorBlocked
                            ? 'Prerequisites Not Met (Rule 4.2)'
                            : 'Prerequisites Not Met (Rule 2.1)',
                      ),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.amberLight,
                        foregroundColor: AppTheme.amberDark,
                        elevation: 0,
                        side: BorderSide(color: AppTheme.amber.withOpacity(0.3)),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                  );
                },
              )
            else if (hasMultiSections)
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => CourseDetailScreen(
                          appState: widget.appState,
                          courseCode: course.code,
                        ),
                      ),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.teal,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    elevation: 0,
                  ),
                  child: Text(
                    '${course.statusAction} →',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
              )
            else
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () async {
                    final messenger = ScaffoldMessenger.maybeOf(context);
                    final res = await widget.appState.stageSection(firstSec.id);
                    if (!mounted) return;
                    if (res.isStaged) {
                      messenger?.showSnackBar(
                        SnackBar(
                          content: Text(
                            '${firstSec.courseCode} Sec ${firstSec.sectionNumber} staged!',
                          ),
                          backgroundColor: AppTheme.emeraldDark,
                        ),
                      );
                    } else if (res.kind == StageResultKind.ruleAlert) {
                      MobileBottomSheets.showMissingPrereqRule42(
                        context,
                        targetCourse: firstSec.courseCode,
                        sectionId: firstSec.id,
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
                        courseCode: firstSec.courseCode,
                        fullSection: firstSec.sectionNumber,
                        fullSectionObj: res.fullSection ?? firstSec,
                        alternatives: res.alternatives,
                        appState: widget.appState,
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
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: AppTheme.border),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: Text(
                    course.statusAction,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      color: AppTheme.navy,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
