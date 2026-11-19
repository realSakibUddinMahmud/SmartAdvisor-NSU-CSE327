import 'package:flutter/material.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/bottom_sheets.dart';
import '../widgets/credit_ring_widget.dart';
import '../widgets/priority_window_card.dart';
import 'course_catalog_screen.dart';

class HomeDashboardScreen extends StatelessWidget {
  final AppState appState;

  const HomeDashboardScreen({super.key, required this.appState});

  @override
  Widget build(BuildContext context) {
    final isCleared = appState.student.advisingClearedBy.trim().isNotEmpty;
    final openQuickAddSections = appState.sections
        .where((s) => !s.isFull && s.minCreditsRequired == null)
        .take(2)
        .toList();
    final fallbackPrompt = appState.rdsFallbackPrompt;
    final hasActiveFallback =
        fallbackPrompt != null && !fallbackPrompt.resolved;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Greeting & Academic Clearance Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Good morning, ${appState.studentName.split(' ').first}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.navy,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${appState.studentId} • ${appState.standing}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.textMuted,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isCleared
                      ? AppTheme.emeraldLight
                      : AppTheme.amberLight,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: (isCleared ? AppTheme.emerald : AppTheme.amber)
                        .withOpacity(0.3),
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      isCleared
                          ? Icons.check_circle
                          : Icons.hourglass_top_rounded,
                      color: isCleared ? AppTheme.emerald : AppTheme.amber,
                      size: 14,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      isCleared ? 'Cleared' : 'Pending',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: isCleared
                            ? AppTheme.emeraldDark
                            : AppTheme.amberDark,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),

          if (hasActiveFallback) ...[
            InkWell(
              onTap: () {
                MobileBottomSheets.showRdsFallbackSheet(
                  context,
                  prompt: fallbackPrompt,
                  appState: appState,
                );
              },
              borderRadius: BorderRadius.circular(14),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.crimsonLight,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: AppTheme.crimson.withOpacity(0.35),
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.warning_rounded,
                      color: AppTheme.crimson,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'RDS Fallback Needed: ${fallbackPrompt.failedCourseCode}',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.crimsonDark,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const Text(
                            'Tap for 1-click DAG-verified alternative swap',
                            style: TextStyle(
                              fontSize: 11,
                              color: AppTheme.textSecondary,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.arrow_forward_ios_rounded,
                      size: 14,
                      color: AppTheme.crimson,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
          ],

          // 1. Dark-Navy Priority Window Countdown Card
          PriorityWindowCard(
            slotClosesAt: appState.slotClosesAt,
            stagedCount: appState.stagedCourses.length,
          ),
          const SizedBox(height: 14),

          // 2. Credit Summary Circular Ring Card
          CreditSummaryRing(
            currentCredits: appState.totalCredits,
            maxCredits: appState.maxCredits,
            clashCount: appState.clashes.length,
          ),
          const SizedBox(height: 22),

          // 3. Action Workspace (4 Tiles)
          const Text(
            'ACTION WORKSPACE',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.8,
              color: AppTheme.textMuted,
            ),
          ),
          const SizedBox(height: 10),

          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.32,
            children: [
              _buildActionTile(
                icon: Icons.search_rounded,
                title: 'Courses',
                subtitle: 'Catalog (${appState.catalogCourses.length} Courses)',
                color: AppTheme.teal,
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => CourseCatalogScreen(appState: appState),
                    ),
                  );
                },
              ),
              _buildActionTile(
                icon: Icons.calendar_month_outlined,
                title: 'Schedule',
                subtitle: 'AI Timetable (${appState.stagedCourses.length})',
                color: AppTheme.navy,
                onTap: () => appState.setTab(1),
              ),
              _buildActionTile(
                icon: Icons.assignment_outlined,
                title: 'Requests',
                subtitle: '${appState.petitions.length} Active Petitions',
                color: AppTheme.amber,
                onTap: () => appState.setTab(2),
              ),
              _buildActionTile(
                icon: Icons.notifications_active_outlined,
                title: 'Alerts',
                subtitle: '${appState.alerts.length} Real-time Pulses',
                color: AppTheme.crimson,
                onTap: () => appState.setTab(3),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // 4. Live Feed & Updates with working 1-tap Quick Add
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Expanded(
                child: Text(
                  'LIVE FEED & FAST-ENROLL',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.8,
                    color: AppTheme.textMuted,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              InkWell(
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => CourseCatalogScreen(appState: appState),
                    ),
                  );
                },
                child: Text(
                  'View All (${appState.sections.length}) →',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.teal,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          ...openQuickAddSections.map((sec) {
            final isStaged = appState.stagedSectionIds.contains(sec.id);
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: _buildQuickAddCard(
                context,
                section: sec,
                isStaged: isStaged,
                onQuickAdd: () async {
                  final messenger = ScaffoldMessenger.maybeOf(context);
                  final res = await appState.stageSection(sec.id);
                  if (!context.mounted) return;
                  if (res.isStaged) {
                    messenger?.showSnackBar(
                      SnackBar(
                        content: Text(
                          '${sec.courseCode} Sec ${sec.sectionNumber} staged in advising cart!',
                        ),
                        backgroundColor: AppTheme.emeraldDark,
                      ),
                    );
                  } else if (res.kind == StageResultKind.ruleAlert) {
                    MobileBottomSheets.showMissingPrereqRule42(
                      context,
                      targetCourse: sec.courseCode,
                      sectionId: sec.id,
                      ruleCode: res.ruleCode ?? 'RULE-4.2',
                      studentCredits: res.studentCredits,
                      requiredCredits: res.requiredCredits,
                      missingPrerequisites: res.missingPrerequisites,
                      conflictingSections: res.conflictingSections,
                      appState: appState,
                    );
                  } else if (res.kind == StageResultKind.sectionFull) {
                    MobileBottomSheets.showSectionFullFallback(
                      context,
                      courseCode: sec.courseCode,
                      fullSection: sec.sectionNumber,
                      fullSectionObj: res.fullSection ?? sec,
                      alternatives: res.alternatives,
                      appState: appState,
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
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildActionTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.navy,
                  ),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppTheme.textMuted,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickAddCard(
    BuildContext context, {
    required CourseSection section,
    required bool isStaged,
    required VoidCallback onQuickAdd,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
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
                    Expanded(
                      child: Text(
                        '${section.courseCode} Sec ${section.sectionNumber}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.navy,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: AppTheme.emeraldLight,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        '${section.availableSeats} Open',
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.emeraldDark,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  section.faculty,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppTheme.textSecondary,
                  ),
                ),
                Text(
                  '${section.days} ${section.timeSlot} • ${section.room}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppTheme.textMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          ElevatedButton(
            onPressed: isStaged ? null : onQuickAdd,
            style: ElevatedButton.styleFrom(
              backgroundColor: isStaged ? AppTheme.canvasAlt : AppTheme.teal,
              foregroundColor: isStaged ? AppTheme.textMuted : Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            child: Text(
              isStaged ? 'Staged ✓' : 'Quick Add',
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }
}
