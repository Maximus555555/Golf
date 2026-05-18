export type MetricRating = 'good' | 'acceptable' | 'problematic';

export const METRIC_FEEDBACK: Record<string, Record<MetricRating, string>> = {
  headMovement: {
    good: 'Your head stayed relatively centered during the swing.',
    acceptable: 'Your head moved a bit laterally. Slightly more centered head motion may improve consistency.',
    problematic: 'Your head moved too far laterally during the swing. Excess sway can make contact less consistent.',
  },
  postureChange: {
    good: 'You maintained your posture well through the backswing.',
    acceptable: 'You lost some posture at the top. Try to keep your setup angles more stable.',
    problematic: 'You lost too much posture during the backswing. Standing up early can hurt strike quality.',
  },
  hipSway: {
    good: 'Your backswing hip sway stayed within a controlled range.',
    acceptable: 'Your hips drifted a little too far away from the target in the backswing.',
    problematic: 'Your hips swayed too far away from the target in the backswing. That can make recentering harder.',
  },
  leadArmAngleTop: {
    good: 'Your lead arm stayed long and structured at the top.',
    acceptable: 'Your lead arm bent a little at the top. Slightly more width may help.',
    problematic: 'Your lead arm collapsed too much at the top. That usually reduces swing width and consistency.',
  },
  shoulderTurn: {
    good: 'You created a strong shoulder turn in the backswing.',
    acceptable: 'Your shoulder turn was a bit limited.',
    problematic: 'Your backswing shoulder turn was too limited.',
  },
};

export function getMetricFeedback(metricKey: string, rating: MetricRating, notes: string[] = []) {
  const base = METRIC_FEEDBACK[metricKey]?.[rating] ?? 'Swing metric feedback is unavailable.';
  return notes.length ? `${base} ${notes.join(' ')}` : base;
}
