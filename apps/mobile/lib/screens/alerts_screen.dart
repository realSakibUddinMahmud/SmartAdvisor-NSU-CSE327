import 'package:flutter/material.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/bottom_sheets.dart';

class AlertsScreen extends StatefulWidget {
  final AppState appState;

  const AlertsScreen({super.key, required this.appState});

  @override
  State<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends State<AlertsScreen> {
  String _selectedFilterKey = 'all';
  bool _telegramRadarActive = true;
  bool _retrying = false;

  @override
  Widget build(BuildContext context) {
    final allAlerts = widget.appState.alerts;
    final seatsCount = allAlerts.where((a) => a.isSeatAlert).length;
    final decisionsCount = allAlerts.where((a) => a.isDecisionAlert).length;

    final filteredAlerts = allAlerts.where((alert) {
      if (_selectedFilterKey == 'seats') return alert.isSeatAlert;
      if (_selectedFilterKey == 'decisions') return alert.isDecisionAlert;
      return true;
    }).toList();

    final filters = [
      (key: 'all', label: 'All ${allAlerts.length}'),
      (key: 'seats', label: 'Seats $seatsCount'),
      (key: 'decisions', label: 'Decisions $decisionsCount'),
    ];

    final latencyMs = widget.appState.hasLiveMetrics
        ? widget.appState.metrics.p95LatencyMs
        : 12;
    final gatewaySubtitle = widget.appState.isLiveConnected
        ? (widget.appState.isSseFallback
            ? 'SSE Real-Time Seat Radar Active'
            : 'WebSocket Real-Time Seat Radar Active')
        : (widget.appState.isOfflineMode
            ? 'Offline Cache Mode (Tap Retry to Sync)'
            : 'WebSocket Real-Time Seat Radar Active');

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Gateway Status Banner with Live Retry & Bootstrap Resync
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.navy,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: widget.appState.lastError != null &&
                                  !widget.appState.isLiveConnected
                              ? AppTheme.amber
                              : AppTheme.emerald,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'RDS EDGE GATEWAY (${latencyMs}ms)',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.5,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              gatewaySubtitle,
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 10,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: _retrying
                      ? null
                      : () async {
                          setState(() => _retrying = true);
                          await widget.appState.reconnectRealtimeAndSync();
                          if (!context.mounted) return;
                          setState(() => _retrying = false);
                          final live = widget.appState.isLiveConnected;
                          ScaffoldMessenger.maybeOf(context)?.showSnackBar(
                            SnackBar(
                              content: Text(
                                live
                                    ? 'Re-synchronized with live SmartAdvisor gateway.'
                                    : 'Gateway refreshed (local cache synced).',
                              ),
                              backgroundColor: AppTheme.navy,
                            ),
                          );
                        },
                  style: TextButton.styleFrom(
                    backgroundColor: Colors.white.withOpacity(0.12),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    minimumSize: Size.zero,
                  ),
                  child: Text(
                    _retrying ? 'Syncing' : 'Retry',
                    style: const TextStyle(color: Colors.white, fontSize: 11),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Header
          const Text(
            'Alerts & Real-Time Radar',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppTheme.navy,
              letterSpacing: -0.2,
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
          const SizedBox(height: 14),

          // Filtered Alerts List
          if (filteredAlerts.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Center(
                child: Text(
                  'No alerts in this category.',
                  style: TextStyle(fontSize: 13, color: AppTheme.textMuted),
                ),
              ),
            )
          else
            ...List.generate(filteredAlerts.length, (index) {
              final alert = filteredAlerts[index];
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _buildAlertCard(context, alert),
              );
            }),

          const SizedBox(height: 14),

          // Instant Telegram & SMS Radar Banner
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.border),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppTheme.teal.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.send_rounded,
                    color: AppTheme.teal,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Instant Telegram & SMS Radar',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.navy,
                        ),
                      ),
                      SizedBox(height: 2),
                      Text(
                        'Instant alert push when closed section drops a seat.',
                        style: TextStyle(
                          fontSize: 11,
                          color: AppTheme.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                Switch(
                  value: _telegramRadarActive,
                  activeColor: AppTheme.teal,
                  onChanged: (val) {
                    setState(() => _telegramRadarActive = val);
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAlertCard(BuildContext context, AlertItem alert) {
    final Color badgeColor;
    final IconData icon;

    switch (alert.type) {
      case 'seat_drop':
        badgeColor = AppTheme.emerald;
        icon = Icons.event_seat_outlined;
        break;
      case 'fast_enroll':
        badgeColor = AppTheme.teal;
        icon = Icons.flash_on_rounded;
        break;
      case 'rule_alert':
        badgeColor = AppTheme.amber;
        icon = Icons.rule_folder_outlined;
        break;
      default:
        badgeColor = AppTheme.navy;
        icon = Icons.verified_user_outlined;
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: badgeColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: badgeColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(
                        alert.title,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.5,
                          color: badgeColor,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      alert.timeAgo,
                      style: const TextStyle(
                        fontSize: 10,
                        color: AppTheme.textMuted,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  alert.description,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppTheme.textSecondary,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () async {
                      final messenger = ScaffoldMessenger.maybeOf(context);
                      if (alert.eventType == NotificationEventType.rdsFallback &&
                          widget.appState.rdsFallbackPrompt != null) {
                        MobileBottomSheets.showRdsFallbackSheet(
                          context,
                          prompt: widget.appState.rdsFallbackPrompt!,
                          appState: widget.appState,
                        );
                        return;
                      }
                      if ((alert.type == 'seat_drop' ||
                              alert.type == 'fast_enroll') &&
                          alert.sectionId != null) {
                        final res = await widget.appState
                            .stageSection(alert.sectionId!);
                        if (!context.mounted) return;
                        if (res.isStaged) {
                          widget.appState.setTab(1);
                          messenger?.showSnackBar(
                            SnackBar(
                              content:
                                  Text('Action executed: ${alert.actionLabel}'),
                              backgroundColor: AppTheme.navy,
                            ),
                          );
                        } else if (res.kind == StageResultKind.sectionFull &&
                            res.fullSection != null) {
                          MobileBottomSheets.showSectionFullFallback(
                            context,
                            courseCode: res.fullSection!.courseCode,
                            fullSection: res.fullSection!.sectionNumber,
                            fullSectionObj: res.fullSection,
                            alternatives: res.alternatives,
                            appState: widget.appState,
                          );
                        } else if (res.kind == StageResultKind.ruleAlert &&
                            res.section != null) {
                          MobileBottomSheets.showMissingPrereqRule42(
                            context,
                            targetCourse: res.section!.courseCode,
                            sectionId: res.section!.id,
                            ruleCode: res.ruleCode ?? 'RULE-4.2',
                            studentCredits: res.studentCredits,
                            requiredCredits: res.requiredCredits,
                            missingPrerequisites: res.missingPrerequisites,
                            conflictingSections: res.conflictingSections,
                            appState: widget.appState,
                          );
                        } else {
                          messenger?.showSnackBar(
                            SnackBar(
                              content: Text(
                                res.message ?? 'Unable to stage section.',
                              ),
                              backgroundColor: AppTheme.crimson,
                            ),
                          );
                        }
                        return;
                      } else if (alert.type == 'seat_drop' ||
                          alert.type == 'fast_enroll') {
                        widget.appState.setTab(1);
                      } else if (alert.type == 'rule_alert') {
                        widget.appState.setTab(2);
                      }
                      messenger?.showSnackBar(
                        SnackBar(
                          content: Text('Action executed: ${alert.actionLabel}'),
                          backgroundColor: AppTheme.navy,
                        ),
                      );
                    },
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      minimumSize: Size.zero,
                      backgroundColor: badgeColor.withOpacity(0.08),
                    ),
                    child: Text(
                      alert.actionLabel,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: badgeColor,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
