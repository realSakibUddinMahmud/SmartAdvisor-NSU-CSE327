import 'package:flutter/material.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';
import '../widgets/persistent_app_bar.dart';
import 'alerts_screen.dart';
import 'home_dashboard_screen.dart';
import 'petitions_screen.dart';
import 'schedule_builder_screen.dart';

class MainScaffold extends StatefulWidget {
  final AppState appState;

  const MainScaffold({super.key, required this.appState});

  @override
  State<MainScaffold> createState() => _MainScaffoldState();
}

class _MainScaffoldState extends State<MainScaffold> {
  @override
  void initState() {
    super.initState();
    widget.appState.addListener(_onStateChange);
  }

  @override
  void dispose() {
    widget.appState.removeListener(_onStateChange);
    super.dispose();
  }

  void _onStateChange() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final screens = [
      HomeDashboardScreen(appState: widget.appState),
      ScheduleBuilderScreen(appState: widget.appState),
      PetitionsScreen(appState: widget.appState),
      AlertsScreen(appState: widget.appState),
    ];

    return Scaffold(
      backgroundColor: AppTheme.canvas,
      appBar: PersistentAppBar(
        appState: widget.appState,
        onNotificationTap: () => widget.appState.setTab(3),
      ),
      body: screens[widget.appState.currentTab],
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppTheme.border, width: 1)),
        ),
        child: BottomNavigationBar(
          currentIndex: widget.appState.currentTab,
          onTap: (index) => widget.appState.setTab(index),
          backgroundColor: Colors.white,
          selectedItemColor: AppTheme.teal,
          unselectedItemColor: AppTheme.textMuted,
          selectedLabelStyle: const TextStyle(
            fontWeight: FontWeight.bold,
            fontSize: 11,
          ),
          unselectedLabelStyle: const TextStyle(
            fontWeight: FontWeight.normal,
            fontSize: 11,
          ),
          type: BottomNavigationBarType.fixed,
          elevation: 0,
          items: [
            const BottomNavigationBarItem(
              icon: Icon(Icons.dashboard_outlined),
              activeIcon: Icon(Icons.dashboard),
              label: 'Advising',
            ),
            BottomNavigationBarItem(
              icon: Badge(
                label: Text('${widget.appState.stagedCourses.length}'),
                backgroundColor: AppTheme.teal,
                child: const Icon(Icons.calendar_month_outlined),
              ),
              activeIcon: Badge(
                label: Text('${widget.appState.stagedCourses.length}'),
                backgroundColor: AppTheme.teal,
                child: const Icon(Icons.calendar_month),
              ),
              label: 'Schedule',
            ),
            BottomNavigationBarItem(
              icon: Badge(
                label: Text('${widget.appState.petitions.length}'),
                backgroundColor: AppTheme.amber,
                child: const Icon(Icons.assignment_outlined),
              ),
              activeIcon: Badge(
                label: Text('${widget.appState.petitions.length}'),
                backgroundColor: AppTheme.amber,
                child: const Icon(Icons.assignment),
              ),
              label: 'Prereqs',
            ),
            BottomNavigationBarItem(
              icon: Badge(
                label: Text('${widget.appState.alerts.length}'),
                backgroundColor: AppTheme.crimson,
                child: const Icon(Icons.notifications_outlined),
              ),
              activeIcon: Badge(
                label: Text('${widget.appState.alerts.length}'),
                backgroundColor: AppTheme.crimson,
                child: const Icon(Icons.notifications),
              ),
              label: 'Alerts & IT',
            ),
          ],
        ),
      ),
    );
  }
}

typedef MainNavigationShell = MainScaffold;
