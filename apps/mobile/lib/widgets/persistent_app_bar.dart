import 'package:flutter/material.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';

class PersistentAppBar extends StatelessWidget implements PreferredSizeWidget {
  final AppState? appState;
  final VoidCallback? onNotificationTap;

  const PersistentAppBar({
    super.key,
    this.appState,
    this.onNotificationTap,
  });

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final isLive = appState?.isLiveConnected ?? false;
    final isOffline = appState?.isOfflineMode ?? false;
    final alertCount = appState?.alerts.length ?? 0;

    final Color pulseColor;
    if (isLive) {
      pulseColor = AppTheme.emerald;
    } else if (isOffline) {
      pulseColor = AppTheme.emerald;
    } else {
      pulseColor = AppTheme.amber;
    }

    return AppBar(
      backgroundColor: AppTheme.navy,
      elevation: 0,
      title: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: AppTheme.teal,
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.school, color: Colors.white, size: 18),
          ),
          const SizedBox(width: 8),
          const Flexible(
            child: Text(
              'SmartAdvisor NSU',
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                letterSpacing: -0.2,
              ),
            ),
          ),
        ],
      ),
      actions: [
        if (onNotificationTap != null)
          IconButton(
            onPressed: onNotificationTap,
            tooltip: 'Alerts & Real-Time Radar',
            padding: const EdgeInsets.symmetric(horizontal: 6),
            constraints: const BoxConstraints(minWidth: 34, minHeight: 34),
            icon: Badge(
              isLabelVisible: alertCount > 0,
              label: Text('$alertCount'),
              backgroundColor: AppTheme.crimson,
              child: const Icon(
                Icons.notifications_none_rounded,
                color: Colors.white,
                size: 20,
              ),
            ),
          ),
        // Green Pulse Phase 2 Pill
        Center(
          child: Container(
            margin: const EdgeInsets.only(right: 12),
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.08),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withOpacity(0.15)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: pulseColor,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                const Text(
                  'Phase 2 (90+ Cr)',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
