import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class CreditSummaryRing extends StatelessWidget {
  final double currentCredits;
  final double maxCredits;
  final int clashCount;

  const CreditSummaryRing({
    super.key,
    this.currentCredits = 10.0,
    this.maxCredits = 15.0,
    this.clashCount = 0,
  });

  @override
  Widget build(BuildContext context) {
    final percentage =
        maxCredits <= 0 ? 0.0 : (currentCredits / maxCredits).clamp(0.0, 1.0);
    final percentInt = (percentage * 100).round();
    final hasClashes = clashCount > 0;
    final clashLabel = hasClashes
        ? '$clashCount ${clashCount == 1 ? 'Clash' : 'Clashes'}'
        : 'No Clashes';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        children: [
          // Circular Progress Indicator
          SizedBox(
            width: 64,
            height: 64,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CircularProgressIndicator(
                  value: percentage,
                  strokeWidth: 6,
                  backgroundColor: AppTheme.canvasAlt,
                  valueColor:
                      const AlwaysStoppedAnimation<Color>(AppTheme.teal),
                ),
                Text(
                  '$percentInt%',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.navy,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),

          // Details
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Credit Summary',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.navy,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${currentCredits.toStringAsFixed(1)} / ${maxCredits.toStringAsFixed(1)} Credits',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.teal,
                  ),
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: hasClashes
                            ? AppTheme.crimsonLight
                            : AppTheme.emeraldLight,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        clashLabel,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: hasClashes
                              ? AppTheme.crimsonDark
                              : AppTheme.emeraldDark,
                        ),
                      ),
                    ),
                    Text(
                      '$percentInt% Utilized',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppTheme.textMuted,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
