import 'package:flutter/material.dart';
import 'theme/app_theme.dart';
import 'state/app_state.dart';
import 'screens/login_screen.dart';
import 'screens/main_scaffold.dart';

void main() {
  runApp(const SmartAdvisorMobileApp());
}

class SmartAdvisorMobileApp extends StatefulWidget {
  final AppState? appState;

  const SmartAdvisorMobileApp({super.key, this.appState});

  @override
  State<SmartAdvisorMobileApp> createState() => _SmartAdvisorMobileAppState();
}

class _SmartAdvisorMobileAppState extends State<SmartAdvisorMobileApp> {
  late AppState _appState;
  bool _isLocalState = false;

  @override
  void initState() {
    super.initState();
    if (widget.appState != null) {
      _appState = widget.appState!;
    } else {
      _appState = AppState();
      _isLocalState = true;
    }
    _appState.addListener(_onStateChange);
  }

  @override
  void didUpdateWidget(covariant SmartAdvisorMobileApp oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.appState != widget.appState) {
      _appState.removeListener(_onStateChange);
      if (_isLocalState) {
        _appState.dispose();
      }
      if (widget.appState != null) {
        _appState = widget.appState!;
        _isLocalState = false;
      } else {
        _appState = AppState();
        _isLocalState = true;
      }
      _appState.addListener(_onStateChange);
    }
  }

  @override
  void dispose() {
    _appState.removeListener(_onStateChange);
    if (_isLocalState) {
      _appState.dispose();
    }
    super.dispose();
  }

  void _onStateChange() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SmartAdvisor NSU',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.themeData,
      home: _appState.isLoggedIn
          ? MainScaffold(appState: _appState)
          : LoginScreen(appState: _appState),
    );
  }
}

// Support alias for both naming conventions
typedef SmartAdvisorApp = SmartAdvisorMobileApp;
