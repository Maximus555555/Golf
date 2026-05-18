import { describe, expect, it } from 'vitest';
import { evaluateGolfMetricRules, rateMaxMetric, rateMinMetric, rateRangeMetric } from '../golfMetricRuleEngine';

describe('golfMetricRuleEngine', () => {
  it('boundary tests for threshold helpers', () => {
    expect(rateMaxMetric(0.1, 0.1, 0.18)).toBe('good');
    expect(rateMaxMetric(0.18, 0.1, 0.18)).toBe('acceptable');
    expect(rateMaxMetric(0.181, 0.1, 0.18)).toBe('problematic');
    expect(rateMinMetric(165, 165, 150)).toBe('good');
    expect(rateMinMetric(150, 165, 150)).toBe('acceptable');
    expect(rateMinMetric(149.9, 165, 150)).toBe('problematic');
    expect(rateRangeMetric(90, 90, 105, 80, 115)).toBe('good');
    expect(rateRangeMetric(105, 90, 105, 80, 115)).toBe('good');
    expect(rateRangeMetric(80, 90, 105, 80, 115)).toBe('acceptable');
    expect(rateRangeMetric(115, 90, 105, 80, 115)).toBe('acceptable');
    expect(rateRangeMetric(79.9, 90, 105, 80, 115)).toBe('problematic');
  });

  it('unsupported-view hip sway behavior', () => {
    const r = evaluateGolfMetricRules({ view: 'down-the-line', hipSway: 0.1 });
    expect(r.metrics.hipSway.supported).toBe(false);
    expect(r.metrics.hipSway.status).toBe('unsupported');
    expect(r.metrics.hipSway.notes).toContain('Hip sway is only evaluated from face-on video.');
  });

  it('shoulder turn preferred-vs-fallback behavior', () => {
    const preferred = evaluateGolfMetricRules({ shoulderTurnAngleTopPreferred: 95, shoulderTurnRatio: 0.9 });
    expect(preferred.metrics.shoulderTurn.proxyUsed).toBe(false);
    expect(preferred.metrics.shoulderTurn.status).toBe('good');

    const fallback = evaluateGolfMetricRules({ shoulderTurnAngleTopPreferred: null, shoulderTurnRatio: 0.8 });
    expect(fallback.metrics.shoulderTurn.proxyUsed).toBe(true);
    expect(fallback.metrics.shoulderTurn.status).toBe('acceptable');
    expect(fallback.metrics.shoulderTurn.notes).toContain('Shoulder turn angle was unavailable, so a 2D ratio proxy was used.');
  });

  it('null/undefined/NaN safety', () => {
    const r = evaluateGolfMetricRules({ headMovement: Number.NaN, postureChange: undefined, hipSway: null, leadArmAngleTop: undefined, shoulderTurnRatio: Number.NaN });
    expect(r.summary.unsupportedCount).toBe(5);
    expect(r.metrics.headMovement.problemId).toBeNull();
  });

  it('summary counts and primary focus ordering', () => {
    const r = evaluateGolfMetricRules({
      view: 'face-on',
      headMovement: 0.25,
      postureChange: 0.15,
      hipSway: 0.3,
      leadArmAngleTop: 168,
      shoulderTurnRatio: 0.82,
      confidence: { headMovement: 'high', hipSway: 'medium', postureChange: 'low', shoulderTurn: 'high' },
    });
    expect(r.summary.problematicCount).toBe(2);
    expect(r.summary.acceptableCount).toBe(2);
    expect(r.summary.goodCount).toBe(1);
    expect(r.summary.primaryFocusIds.slice(0, 2)).toEqual(['headMovement', 'hipSway']);
  });
});
