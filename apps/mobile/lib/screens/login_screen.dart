import 'package:flutter/material.dart';
import '../state/app_state.dart';
import '../theme/app_theme.dart';

class LoginScreen extends StatefulWidget {
  final AppState appState;

  const LoginScreen({super.key, required this.appState});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _idController = TextEditingController(text: '2412159042');
  final _passController = TextEditingController(text: '••••••••••••');
  bool _rememberMe = true;
  bool _submitting = false;

  @override
  void dispose() {
    _idController.dispose();
    _passController.dispose();
    super.dispose();
  }

  Future<void> _handleSignIn() async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      await widget.appState.login(_idController.text, _passController.text);
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authError = widget.appState.authError;

    return Scaffold(
      backgroundColor: AppTheme.navy,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 20),
              // Institutional Logo & Gateway Live Badge
              Center(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.white.withOpacity(0.12)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: const BoxDecoration(
                          color: AppTheme.emerald,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Flexible(
                        child: Text(
                          'RDS GATEWAY LIVE • NSU Official',
                          overflow: TextOverflow.ellipsis,
                          maxLines: 1,
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 28),

              // Title & Branding
              const Text(
                'SmartAdvisor NSU',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 32,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Autonomous Advising & Registration Engine\nNorth South University • CSE 327 Sec 04',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
              const SizedBox(height: 36),

              // Login Card Container
              Container(
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.15),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Registration Slot Badge
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Flexible(
                          child: Text(
                            'Student Portal',
                            overflow: TextOverflow.ellipsis,
                            maxLines: 1,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.navy,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.emeraldLight,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text(
                            'Slot: Open',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.emeraldDark,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),

                    // NSU ID Input
                    const Text(
                      '10-DIGIT NSU ID',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.6,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _idController,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: AppTheme.canvas,
                        prefixIcon: const Icon(
                          Icons.badge_outlined,
                          size: 20,
                          color: AppTheme.textMuted,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
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
                    const SizedBox(height: 14),

                    // Password Input
                    const Text(
                      'PASSWORD',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.6,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _passController,
                      obscureText: true,
                      style: const TextStyle(fontSize: 14),
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: AppTheme.canvas,
                        prefixIcon: const Icon(
                          Icons.lock_outline,
                          size: 20,
                          color: AppTheme.textMuted,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
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
                    const SizedBox(height: 12),

                    if (authError != null && authError.isNotEmpty) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.crimsonLight,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: AppTheme.crimson.withOpacity(0.3),
                          ),
                        ),
                        child: Text(
                          authError,
                          style: const TextStyle(
                            fontSize: 11,
                            color: AppTheme.crimsonDark,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],

                    // Remember Me Row
                    Row(
                      children: [
                        SizedBox(
                          width: 22,
                          height: 22,
                          child: Checkbox(
                            value: _rememberMe,
                            activeColor: AppTheme.teal,
                            onChanged: (v) =>
                                setState(() => _rememberMe = v ?? true),
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            'Remember on this device',
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 11,
                              color: AppTheme.textSecondary,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),

                    // Sign In Button
                    ElevatedButton(
                      onPressed: _submitting ? null : _handleSignIn,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.navy,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            _submitting ? 'Signing in...' : 'Sign in →',
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),
              const Center(
                child: Text(
                  '256-bit SSL • Official NSU Cloud Infrastructure',
                  style: TextStyle(color: Colors.white38, fontSize: 10),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
