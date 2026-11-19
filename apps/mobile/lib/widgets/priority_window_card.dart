import 'dart:async';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class PriorityWindowCard extends StatefulWidget {
  final DateTime? slotClosesAt;
  final bool enableTicker;
  final int stagedCount;

  const PriorityWindowCard({
    super.key,
    this.slotClosesAt,
    this.enableTicker = true,
    this.stagedCount = 0,
  });

  @override
  State<PriorityWindowCard> createState() => _PriorityWindowCardState();
}

class _PriorityWindowCardState extends State<PriorityWindowCard> {
  static const int _defaultSeconds = 2 * 3600 + 14 * 60 + 34; // 02:14:34
  late int _secondsRemaining;
  Timer? _timer;

  int _computeSecondsRemaining() {
    final target = widget.slotClosesAt;
    if (target == null) return _defaultSeconds;
    final diff = target.difference(DateTime.now()).inSeconds;
    if (diff <= 0) return 0;
    return diff;
  }

  @override
  void initState() {
    super.initState();
    _secondsRemaining = _computeSecondsRemaining();
    if (widget.enableTicker) {
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        setState(() {
          if (widget.slotClosesAt != null) {
            _secondsRemaining = _computeSecondsRemaining();
          } else if (_secondsRemaining > 0) {
            _secondsRemaining--;
          }
        });
      });
    }
  }

  @override
  void didUpdateWidget(covariant PriorityWindowCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.slotClosesAt != widget.slotClosesAt) {
      _secondsRemaining = _computeSecondsRemaining();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _timer = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hours = (_secondsRemaining ~/ 3600).toString().padLeft(2, '0');
    final minutes =
        ((_secondsRemaining % 3600) ~/ 60).toString().padLeft(2, '0');
    final seconds = (_secondsRemaining % 60).toString().padLeft(2, '0');
    final cartLabel =
        widget.stagedCount > 0 ? 'Cart Ready (${widget.stagedCount})' : 'Cart Ready';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.navy,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: AppTheme.navy.withOpacity(0.18),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppTheme.teal.withOpacity(0.3),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: AppTheme.teal.withOpacity(0.4)),
                    ),
                    child: const Text(
                      'PRIORITY WINDOW',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.6,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    width: 6,
                    height: 6,
                    decoration: const BoxDecoration(
                      color: AppTheme.emerald,
                      shape: BoxShape.circle,
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.shopping_bag_outlined,
                        color: Colors.white,
                        size: 12,
                      ),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          cartLabel,
                          style: const TextStyle(
                            fontSize: 10,
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                          ),
                          overflow: TextOverflow.ellipsis,
                          maxLines: 1,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Big ticking countdown
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              '$hours : $minutes : $seconds HRS',
              style: const TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.bold,
                letterSpacing: 1.5,
                color: Colors.white,
                fontFamily: 'monospace',
              ),
            ),
          ),
          const SizedBox(height: 4),

          const Text(
            'Phase 2 window closes automatically. Atomic slot lock active.',
            style: TextStyle(fontSize: 11, color: Colors.white70),
          ),
        ],
      ),
    );
  }
}
