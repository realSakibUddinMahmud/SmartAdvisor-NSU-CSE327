import 'package:flutter/material.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/bottom_sheets.dart';

class PetitionsScreen extends StatefulWidget {
  final AppState appState;

  const PetitionsScreen({super.key, required this.appState});

  @override
  State<PetitionsScreen> createState() => _PetitionsScreenState();
}

class _PetitionsScreenState extends State<PetitionsScreen> {
  String _selectedFilterKey = 'all';

  @override
  Widget build(BuildContext context) {
    final allPetitions = widget.appState.petitions;
    final approvedCount = allPetitions
        .where((p) => p.status == PetitionStatus.approved)
        .length;
    final pendingCount =
        allPetitions.where((p) => p.status == PetitionStatus.pending).length;
    final waitlistedCount = allPetitions
        .where((p) => p.status == PetitionStatus.waitlisted)
        .length;
    final flaggedCount =
        allPetitions.where((p) => p.status == PetitionStatus.flagged).length;

    final filtered = allPetitions.where((p) {
      if (_selectedFilterKey == 'approved') {
        return p.status == PetitionStatus.approved;
      }
      if (_selectedFilterKey == 'pending') {
        return p.status == PetitionStatus.pending;
      }
      if (_selectedFilterKey == 'waitlisted') {
        return p.status == PetitionStatus.waitlisted;
      }
      if (_selectedFilterKey == 'flagged') {
        return p.status == PetitionStatus.flagged;
      }
      return true;
    }).toList();

    final filters = [
      (key: 'all', label: 'All ${allPetitions.length}'),
      (key: 'approved', label: 'Approved $approvedCount'),
      (key: 'pending', label: 'Pending $pendingCount'),
      (key: 'waitlisted', label: 'Waitlisted $waitlistedCount'),
      if (flaggedCount > 0) (key: 'flagged', label: 'Flagged $flaggedCount'),
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Seat Requests & Petitions',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.navy,
                        letterSpacing: -0.2,
                      ),
                    ),
                    Text(
                      'Audited by Autonomous DAG & Faculty Committee',
                      style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              ElevatedButton.icon(
                onPressed: () {
                  MobileBottomSheets.showSubmitPetitionSheet(
                    context,
                    appState: widget.appState,
                  );
                },
                icon: const Icon(Icons.add, size: 16),
                label: const Text('New'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.teal,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  minimumSize: Size.zero,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Dynamic Filter Pills
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
                      color: isSelected ? Colors.white : AppTheme.textSecondary,
                    ),
                    selected: isSelected,
                    selectedColor: AppTheme.navy,
                    backgroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                      side: BorderSide(
                        color: isSelected ? AppTheme.navy : AppTheme.border,
                      ),
                    ),
                    onSelected: (_) =>
                        setState(() => _selectedFilterKey = f.key),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),

          if (filtered.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text(
                  'No petitions match this filter.',
                  style: TextStyle(fontSize: 13, color: AppTheme.textMuted),
                ),
              ),
            )
          else
            ...List.generate(filtered.length, (index) {
              final petition = filtered[index];
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _buildPetitionCard(context, petition),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildPetitionCard(BuildContext context, PetitionItem petition) {
    final Color statusColor;
    final Color statusBg;
    final String statusText;
    final IconData statusIcon;

    switch (petition.status) {
      case PetitionStatus.approved:
        statusColor = AppTheme.emerald;
        statusBg = AppTheme.emeraldLight;
        statusText = 'APPROVED';
        statusIcon = Icons.check_circle_outline;
        break;
      case PetitionStatus.pending:
        statusColor = AppTheme.amber;
        statusBg = AppTheme.amberLight;
        statusText = 'PENDING REVIEW';
        statusIcon = Icons.hourglass_top_outlined;
        break;
      case PetitionStatus.waitlisted:
        statusColor = AppTheme.teal;
        statusBg = AppTheme.teal.withOpacity(0.1);
        final pos = petition.waitlistPosition ?? 3;
        statusText = 'WAITLISTED (#$pos)';
        statusIcon = Icons.format_list_numbered_rounded;
        break;
      case PetitionStatus.flagged:
        statusColor = AppTheme.amberDark;
        statusBg = AppTheme.amberLight;
        statusText = 'FLAGGED';
        statusIcon = Icons.flag_outlined;
        break;
      case PetitionStatus.rejected:
        statusColor = AppTheme.crimson;
        statusBg = AppTheme.crimsonLight;
        statusText = 'REJECTED';
        statusIcon = Icons.cancel_outlined;
        break;
    }

    return InkWell(
      onTap: () {
        if (petition.status == PetitionStatus.approved) {
          MobileBottomSheets.showSeatApproved(
            context,
            courseCode: petition.courseCode,
            sectionNumber: petition.sectionNumber,
            rdsToken: petition.rdsToken.isNotEmpty
                ? petition.rdsToken
                : widget.appState.cartToken,
            onViewSchedule: () => widget.appState.setTab(1),
          );
        } else if (petition.status == PetitionStatus.pending ||
            petition.status == PetitionStatus.flagged) {
          MobileBottomSheets.showMissingPrereqRule42(
            context,
            targetCourse: petition.courseCode,
            sectionId: petition.sectionId,
            ruleCode: petition.ruleCode ?? 'RULE-4.2',
            appState: widget.appState,
          );
        }
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
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        '${petition.courseCode} Sec ${petition.sectionNumber}',
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.navy,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: statusBg,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(statusIcon, color: statusColor, size: 12),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                statusText,
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: statusColor,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  petition.submittedAt,
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppTheme.textMuted,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              petition.note,
              style: const TextStyle(
                fontSize: 12,
                color: AppTheme.textSecondary,
                height: 1.3,
              ),
            ),
            if (petition.rdsToken.isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.canvas,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.vpn_key_outlined,
                      size: 12,
                      color: AppTheme.teal,
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        'RDS Token: ${petition.rdsToken}',
                        style: const TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.bold,
                          color: AppTheme.navy,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
