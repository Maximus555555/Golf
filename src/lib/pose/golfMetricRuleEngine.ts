import { GOLF_METRIC_THRESHOLDS } from '../../config/golfMetricRuleConfig';
import { GOLF_METRIC_RULE_TEXT } from './golfMetricRuleText';
import type { ComputedSwingMetricsInput, GolfMetricEvaluationResult, MetricConfidence, MetricResult, MetricStatus } from './types';

const confidenceOrder: Record<MetricConfidence, number> = { high: 3, medium: 2, low: 1 };
const statusOrder: Record<MetricStatus, number> = { problematic: 3, acceptable: 2, good: 1, unsupported: 0 };

const toFiniteOrNull = (value: number | null | undefined, min = -Infinity, max = Infinity) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value as number)) : null);
const downgrade = (c: MetricConfidence): MetricConfidence => (c === 'high' ? 'medium' : c === 'medium' ? 'low' : 'low');

export const rateMaxMetric = (value: number, goodMax: number, acceptableMax: number): Exclude<MetricStatus, 'unsupported'> => (value <= goodMax ? 'good' : value <= acceptableMax ? 'acceptable' : 'problematic');
export const rateMinMetric = (value: number, goodMin: number, acceptableMin: number): Exclude<MetricStatus, 'unsupported'> => (value >= goodMin ? 'good' : value >= acceptableMin ? 'acceptable' : 'problematic');
export const rateRangeMetric = (value: number, goodMin: number, goodMax: number, acceptableMin: number, acceptableMax: number): Exclude<MetricStatus, 'unsupported'> => (value >= goodMin && value <= goodMax ? 'good' : value >= acceptableMin && value <= acceptableMax ? 'acceptable' : 'problematic');

function buildMetric(base: any, value: number | null, status: MetricStatus, supported: boolean, confidence: MetricConfidence, notes: string[] = [], units: string | null, proxyUsed?: boolean): MetricResult {
  return {
    id: base.id, label: base.label, value, units, status, confidence, supported, proxyUsed,
    notes: notes.length ? notes : undefined,
    problemId: supported && status !== 'good' ? base.problemId : null,
    commonProblems: supported && status !== 'good' ? base.commonProblems : undefined,
    likelyCauses: supported && status !== 'good' ? base.likelyCauses : undefined,
    suggestedFix: supported && status !== 'good' ? base.prioritizedFixes?.[0] ?? null : null,
    prioritizedFixes: supported && status !== 'good' ? base.prioritizedFixes : undefined,
    drillList: supported && status !== 'good' ? base.drills : undefined,
    feedbackMessage: supported ? base.feedback[status] : null,
  };
}

export function evaluateGolfMetricRules(input: ComputedSwingMetricsInput): GolfMetricEvaluationResult {
  const view = input?.view ?? 'unknown';
  const conf = input?.confidence ?? {};
  const support = input?.support ?? {};

  const hm = toFiniteOrNull(input?.headMovement, 0);
  const hmSupported = (support.headMovement ?? true) && hm !== null;
  const hmStatus = hmSupported ? rateMaxMetric(hm!, GOLF_METRIC_THRESHOLDS.headMovement.goodMax, GOLF_METRIC_THRESHOLDS.headMovement.acceptableMax) : 'unsupported';

  const pc = toFiniteOrNull(input?.postureChange, 0);
  const pcSupported = (support.postureChange ?? true) && pc !== null;
  const pcNotes = view === 'face-on' && pcSupported ? ['Posture metric confidence is lower from face-on video.'] : [];
  const pcStatus = pcSupported ? rateMaxMetric(pc!, GOLF_METRIC_THRESHOLDS.postureChange.goodMax, GOLF_METRIC_THRESHOLDS.postureChange.acceptableMax) : 'unsupported';
  const pcConfidence = view === 'face-on' ? downgrade(conf.postureChange ?? 'medium') : (conf.postureChange ?? 'medium');

  const hs = toFiniteOrNull(input?.hipSway, 0);
  const hipViewSupported = view === 'face-on';
  const hsSupported = (support.hipSway ?? true) && hipViewSupported && hs !== null;
  const hsStatus = hsSupported ? rateMaxMetric(hs!, GOLF_METRIC_THRESHOLDS.hipSway.goodMax, GOLF_METRIC_THRESHOLDS.hipSway.acceptableMax) : 'unsupported';
  const hsNotes = hipViewSupported ? [] : ['Hip sway is only evaluated from face-on video.'];

  const la = toFiniteOrNull(input?.leadArmAngleTop, 0, 180);
  const laSupported = (support.leadArmAngleTop ?? true) && la !== null;
  const laStatus = laSupported ? rateMinMetric(la!, GOLF_METRIC_THRESHOLDS.leadArmAngleTop.goodMin, GOLF_METRIC_THRESHOLDS.leadArmAngleTop.acceptableMin) : 'unsupported';

  const stAngle = toFiniteOrNull(input?.shoulderTurnAngleTopPreferred, 0, 180);
  const stRatio = toFiniteOrNull(input?.shoulderTurnRatio, 0);
  const useAngle = stAngle !== null;
  const stSupported = (support.shoulderTurn ?? true) && (stAngle !== null || stRatio !== null);
  const stNotes = !useAngle && stSupported ? ['Shoulder turn angle was unavailable, so a 2D ratio proxy was used.'] : [];
  const stStatus = !stSupported ? 'unsupported' : useAngle
    ? rateRangeMetric(stAngle!, GOLF_METRIC_THRESHOLDS.shoulderTurnAngleTopPreferred.goodMin, GOLF_METRIC_THRESHOLDS.shoulderTurnAngleTopPreferred.goodMax, GOLF_METRIC_THRESHOLDS.shoulderTurnAngleTopPreferred.acceptableMin, GOLF_METRIC_THRESHOLDS.shoulderTurnAngleTopPreferred.acceptableMax)
    : rateMaxMetric(stRatio!, GOLF_METRIC_THRESHOLDS.shoulderTurnRatio.goodMax, GOLF_METRIC_THRESHOLDS.shoulderTurnRatio.acceptableMax);

  const metrics = {
    headMovement: buildMetric(GOLF_METRIC_RULE_TEXT.headMovement, hm, hmStatus, hmSupported, conf.headMovement ?? 'medium', [], GOLF_METRIC_THRESHOLDS.headMovement.units),
    postureChange: buildMetric(GOLF_METRIC_RULE_TEXT.postureChange, pc, pcStatus, pcSupported, pcConfidence, pcNotes, GOLF_METRIC_THRESHOLDS.postureChange.units),
    hipSway: buildMetric(GOLF_METRIC_RULE_TEXT.hipSway, hs, hsStatus, hsSupported, conf.hipSway ?? 'medium', hsNotes, GOLF_METRIC_THRESHOLDS.hipSway.units),
    leadArmAngleTop: buildMetric(GOLF_METRIC_RULE_TEXT.leadArmAngleTop, la, laStatus, laSupported, conf.leadArmAngleTop ?? 'medium', [], GOLF_METRIC_THRESHOLDS.leadArmAngleTop.units),
    shoulderTurn: buildMetric(GOLF_METRIC_RULE_TEXT.shoulderTurn, useAngle ? stAngle : stRatio, stStatus, stSupported, conf.shoulderTurn ?? 'medium', stNotes, useAngle ? GOLF_METRIC_THRESHOLDS.shoulderTurnAngleTopPreferred.units : GOLF_METRIC_THRESHOLDS.shoulderTurnRatio.units, !useAngle && stSupported),
  };

  const values = Object.values(metrics);
  const summary = {
    goodCount: values.filter((m) => m.status === 'good').length,
    acceptableCount: values.filter((m) => m.status === 'acceptable').length,
    problematicCount: values.filter((m) => m.status === 'problematic').length,
    unsupportedCount: values.filter((m) => m.status === 'unsupported').length,
    primaryFocusIds: values
      .filter((m) => m.supported && (m.status === 'problematic' || m.status === 'acceptable'))
      .sort((a, b) => statusOrder[b.status] - statusOrder[a.status] || confidenceOrder[b.confidence] - confidenceOrder[a.confidence])
      .slice(0, 3)
      .map((m) => m.id),
  };

  return { metrics, summary };
}

/*
Developer summary:
- files changed: src/config/golfMetricRuleConfig.ts, src/lib/pose/golfMetricRuleEngine.ts, src/lib/pose/golfMetricRuleText.ts, src/lib/pose/types.ts, src/lib/pose/__tests__/golfMetricRuleEngine.test.ts
- threshold defaults: defined in GOLF_METRIC_THRESHOLDS with exact values from spec
- status mapping rules: max/min/range helper functions map to good/acceptable/problematic; unsupported when not supported
- unsupported view logic: hip sway returns unsupported unless face-on
*/
