import Sentiment from 'sentiment';

const analyzer = new Sentiment();

function pct(part: number, total: number): string {
  if (!total) return '0';
  return ((part / total) * 100).toFixed(0);
}

export function summarizeGeneralSentiment(score: number, headlines: string[]): string {
  if (!headlines.length) {
    return 'No qualifying investor headlines were available for this date.';
  }

  const sentiments = headlines.map((headline) => ({
    headline,
    comparative: analyzer.analyze(headline).comparative,
  }));

  const strongPositive = sentiments.filter((s) => s.comparative > 0.5);
  const moderatePositive = sentiments.filter((s) => s.comparative > 0.2 && s.comparative <= 0.5);
  const moderateNegative = sentiments.filter((s) => s.comparative < -0.2 && s.comparative >= -0.5);
  const strongNegative = sentiments.filter((s) => s.comparative < -0.5);

  const narrative =
    score >= 7
      ? 'Market sentiment appears bullish, with strong positive coverage likely boosting investor confidence.'
      : score >= 5.5
        ? 'Market sentiment leans optimistic, with positive developments outweighing concerns.'
        : score >= 4.5
          ? 'Market sentiment is balanced without a strong directional bias.'
          : score >= 3
            ? 'Market sentiment leans cautious, with mixed but predominantly negative signals.'
            : 'Market sentiment appears bearish, highlighting risks that may pressure confidence.';

  const series = [
    `${strongPositive.length} headlines (${pct(strongPositive.length, headlines.length)}%) strongly positive`,
    `${moderatePositive.length} headlines (${pct(moderatePositive.length, headlines.length)}%) moderately positive`,
    `${moderateNegative.length} headlines (${pct(moderateNegative.length, headlines.length)}%) moderately negative`,
    `${strongNegative.length} headlines (${pct(strongNegative.length, headlines.length)}%) strongly negative`,
  ];

  return `${narrative}\n\nSentiment distribution:\n- ${series.join('\n- ')}`;
}

export function summarizeInvestorSentiment(
  score: number,
  headlines: string[],
  keyTerms: Record<string, number>,
): string {
  if (!headlines.length) {
    return 'No investor-relevant headlines were available to assess the investment climate.';
  }

  const termList = Object.entries(keyTerms)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([term, count]) => `${term} (${count}x)`);

  const narrative =
    score >= 7
      ? 'Highly conducive to new investment interest. Strong positive signals and opportunities dominate coverage.'
      : score >= 5.5
        ? 'Favorable conditions for investor interest. Positive indicators likely attract qualified investors.'
        : score >= 4.5
          ? 'Neutral investment climate with balanced opportunities and risks.'
          : score >= 3
            ? 'Mixed outlook; cautionary signals may temper investor enthusiasm.'
            : 'Current news cycle likely discourages fresh investment interest due to notable challenges.';

  return `${narrative}\n\nKey investment terms: ${termList.join(', ') || 'none detected'}`;
}
