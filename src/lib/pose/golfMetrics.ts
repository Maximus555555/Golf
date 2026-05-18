import thresholds from '../../config/golfMetricThresholds.json';
import { getMetricFeedback, type MetricRating } from './golfMetricFeedback';
import { getLandmark, getWorldLandmark, type LandmarkName, type PoseFrame, type PoseLandmark } from './landmarkAdapters';

export type Handedness = 'right' | 'left';
export type SwingView = 'face-on' | 'down-the-line' | string;
export type MetricConfidence = 'high' | 'medium' | 'medium-low' | 'low';
export type SwingEvents = { addressIndex: number; topIndex: number; impactIndex?: number };

export type MetricResult = {
  value: number | null;
  units: string;
  confidence: MetricConfidence;
  supported: boolean;
  notes?: string[];
};

type ThresholdConfig = {
  goodMax?: number;
  acceptableMax?: number;
  goodMin?: number;
  acceptableMin?: number;
  units: string;
  confidence: MetricConfidence;
};

const metricThresholds = thresholds.metrics as Record<string, ThresholdConfig>;

function getFrame(timeline: PoseFrame[], index: number) {
  return Number.isInteger(index) && index >= 0 && index < timeline.length ? timeline[index] : undefined;
}

export function distance2D(a?: PoseLandmark | null, b?: PoseLandmark | null) {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a?: PoseLandmark | null, b?: PoseLandmark | null) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: Number.isFinite(a.z) && Number.isFinite(b.z) ? ((a.z ?? 0) + (b.z ?? 0)) / 2 : undefined };
}

export function averagePoints(points: Array<PoseLandmark | null | undefined>) {
  const usable = points.filter((point): point is PoseLandmark => Boolean(point) && Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (!usable.length) return null;
  return {
    x: usable.reduce((sum, point) => sum + point.x, 0) / usable.length,
    y: usable.reduce((sum, point) => sum + point.y, 0) / usable.length,
    z: usable.some((point) => Number.isFinite(point.z)) ? usable.reduce((sum, point) => sum + (point.z ?? 0), 0) / usable.length : undefined,
  };
}

export function angleABC(a?: PoseLandmark | null, b?: PoseLandmark | null, c?: PoseLandmark | null) {
  if (!a || !b || !c) return null;
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const magnitude = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  if (!magnitude) return null;
  const cos = Math.max(-1, Math.min(1, (ab.x * cb.x + ab.y * cb.y) / magnitude));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function safeBodyWidth(addressFrame?: PoseFrame) {
  const left = getLandmark(addressFrame, 'leftShoulder');
  const right = getLandmark(addressFrame, 'rightShoulder');
  const width = distance2D(left, right);
  return width && width > 0 ? width : null;
}

export function smoothSeries(values: Array<number | null | undefined>, window = 3) {
  const safeWindow = Math.max(1, Math.floor(window));
  const radius = Math.floor(safeWindow / 2);
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - radius), Math.min(values.length, index + radius + 1)).filter(Number.isFinite) as number[];
    return slice.length ? slice.reduce((sum, value) => sum + value, 0) / slice.length : null;
  });
}

export function getLeadSide(handedness: Handedness = 'right'): 'left' | 'right' {
  return handedness === 'left' ? 'right' : 'left';
}

export function getTargetDirectionSign(view: SwingView = 'face-on', handedness: Handedness = 'right') {
  if (view !== 'face-on') return null;
  return handedness === 'left' ? -1 : 1;
}

function emptyMetric(units: string, confidence: MetricConfidence, note: string): MetricResult {
  return { value: null, units, confidence, supported: false, notes: [note] };
}

function headCenter(frame?: PoseFrame) {
  return averagePoints([getLandmark(frame, 'nose'), getLandmark(frame, 'leftEar'), getLandmark(frame, 'rightEar')]);
}

export function computeHeadMovement(timeline: PoseFrame[], addressIndex: number): MetricResult {
  const config = metricThresholds.headMovement;
  const addressFrame = getFrame(timeline, addressIndex);
  const bodyWidth = safeBodyWidth(addressFrame);
  const addressHead = headCenter(addressFrame);
  if (!bodyWidth || !addressHead) return emptyMetric(config.units, config.confidence, 'Head movement could not be measured from the available setup landmarks.');

  const shifts = timeline.map((frame) => headCenter(frame)).filter(Boolean).map((point) => Math.abs(point!.x - addressHead.x));
  if (!shifts.length) return emptyMetric(config.units, config.confidence, 'Head landmarks were unavailable during the swing.');
  return { value: Math.max(...shifts) / bodyWidth, units: config.units, confidence: config.confidence, supported: true };
}

function pelvisCenter(frame?: PoseFrame) {
  return midpoint(getLandmark(frame, 'leftHip'), getLandmark(frame, 'rightHip'));
}

export function computeHipSway(timeline: PoseFrame[], addressIndex: number, topIndex: number, handedness: Handedness = 'right', view: SwingView = 'face-on'): MetricResult {
  const config = metricThresholds.hipSway;
  const targetSign = getTargetDirectionSign(view, handedness);
  if (targetSign === null) {
    return { value: null, units: config.units, confidence: 'low', supported: false, notes: ['Hip sway away from the target requires a face-on video.'] };
  }

  const addressFrame = getFrame(timeline, addressIndex);
  const addressPelvis = pelvisCenter(addressFrame);
  const bodyWidth = safeBodyWidth(addressFrame);
  if (!bodyWidth || !addressPelvis) return emptyMetric(config.units, config.confidence, 'Hip sway could not be measured from the setup landmarks.');

  const backswing = timeline.slice(addressIndex, topIndex + 1);
  const awayValues = backswing.map((frame) => pelvisCenter(frame)).filter(Boolean).map((point) => (point!.x - addressPelvis.x) * -targetSign);
  if (!awayValues.length) return emptyMetric(config.units, config.confidence, 'Hip landmarks were unavailable during the backswing.');
  return { value: Math.max(0, ...awayValues) / bodyWidth, units: config.units, confidence: config.confidence, supported: true };
}

function sideName(side: 'left' | 'right', joint: 'Shoulder' | 'Elbow' | 'Wrist') {
  return `${side}${joint}` as LandmarkName;
}

export function computeLeadArmAngleAtTop(timeline: PoseFrame[], topIndex: number, handedness: Handedness = 'right') {
  const config = metricThresholds.leadArmAngleTop;
  const topFrame = getFrame(timeline, topIndex);
  const leadSide = getLeadSide(handedness);
  const elbowAngle = angleABC(getLandmark(topFrame, sideName(leadSide, 'Shoulder')), getLandmark(topFrame, sideName(leadSide, 'Elbow')), getLandmark(topFrame, sideName(leadSide, 'Wrist')));
  if (!Number.isFinite(elbowAngle)) {
    return { ...emptyMetric(config.units, config.confidence, 'Lead arm angle could not be measured at the top.'), leadArmAngleTopDeg: null, leadElbowFlexTopDeg: null };
  }
  return {
    value: elbowAngle,
    leadArmAngleTopDeg: elbowAngle,
    leadElbowFlexTopDeg: 180 - elbowAngle!,
    units: config.units,
    confidence: config.confidence,
    supported: true,
  };
}

export function computeShoulderTurnRatio(timeline: PoseFrame[], addressIndex: number, topIndex: number): MetricResult {
  const config = metricThresholds.shoulderTurnRatio;
  const addressFrame = getFrame(timeline, addressIndex);
  const topFrame = getFrame(timeline, topIndex);
  const setupWidth = Math.abs((getLandmark(addressFrame, 'leftShoulder')?.x ?? NaN) - (getLandmark(addressFrame, 'rightShoulder')?.x ?? NaN));
  const topWidth = Math.abs((getLandmark(topFrame, 'leftShoulder')?.x ?? NaN) - (getLandmark(topFrame, 'rightShoulder')?.x ?? NaN));
  if (!Number.isFinite(setupWidth) || setupWidth <= 0 || !Number.isFinite(topWidth)) return emptyMetric(config.units, config.confidence, 'Shoulder turn ratio could not be measured.');
  return { value: topWidth / setupWidth, units: config.units, confidence: config.confidence, supported: true };
}

function shoulderLineYaw(frame?: PoseFrame) {
  const left = getWorldLandmark(frame, 'leftShoulder');
  const right = getWorldLandmark(frame, 'rightShoulder');
  if (!left || !right) return null;
  return Math.atan2((right.z ?? 0) - (left.z ?? 0), right.x - left.x);
}

export function computeShoulderTurnAngleTopPreferred(topFrame?: PoseFrame, addressFrame?: PoseFrame): MetricResult {
  const config = metricThresholds.shoulderTurnAngleTopPreferred;
  const topYaw = shoulderLineYaw(topFrame);
  const addressYaw = shoulderLineYaw(addressFrame);
  if (!Number.isFinite(topYaw) || !Number.isFinite(addressYaw)) {
    return { value: null, units: config.units, confidence: config.confidence, supported: false, notes: ['Shoulder turn angle was unavailable, so a 2D ratio proxy was used.'] };
  }
  let delta = Math.abs(((topYaw! - addressYaw! + Math.PI) % (2 * Math.PI)) - Math.PI);
  return { value: (delta * 180) / Math.PI, units: config.units, confidence: config.confidence, supported: true };
}

function torsoInclination(frame?: PoseFrame) {
  const midShoulder = midpoint(getLandmark(frame, 'leftShoulder'), getLandmark(frame, 'rightShoulder'));
  const midHip = midpoint(getLandmark(frame, 'leftHip'), getLandmark(frame, 'rightHip'));
  if (!midShoulder || !midHip) return null;
  const vector = { x: midShoulder.x - midHip.x, y: midShoulder.y - midHip.y };
  const magnitude = Math.hypot(vector.x, vector.y);
  if (!magnitude) return null;
  return (Math.acos(Math.max(-1, Math.min(1, Math.abs(vector.y) / magnitude))) * 180) / Math.PI;
}

export function computePostureChange(timeline: PoseFrame[], addressIndex: number, topIndex: number, view: SwingView = 'down-the-line'): MetricResult {
  const config = metricThresholds.postureChange;
  const addressFrame = getFrame(timeline, addressIndex);
  const topFrame = getFrame(timeline, topIndex);
  const bodyWidth = safeBodyWidth(addressFrame);
  const addressMidShoulder = midpoint(getLandmark(addressFrame, 'leftShoulder'), getLandmark(addressFrame, 'rightShoulder'));
  const topMidShoulder = midpoint(getLandmark(topFrame, 'leftShoulder'), getLandmark(topFrame, 'rightShoulder'));
  const addressMidHip = midpoint(getLandmark(addressFrame, 'leftHip'), getLandmark(addressFrame, 'rightHip'));
  const topMidHip = midpoint(getLandmark(topFrame, 'leftHip'), getLandmark(topFrame, 'rightHip'));
  const addressTorso = torsoInclination(addressFrame);
  const topTorso = torsoInclination(topFrame);

  if (!bodyWidth || !addressMidShoulder || !topMidShoulder || !addressMidHip || !topMidHip || !Number.isFinite(addressTorso) || !Number.isFinite(topTorso)) {
    return emptyMetric(config.units, config.confidence, 'Posture change could not be measured from the available landmarks.');
  }

  const shoulderRise = Math.max(0, addressMidShoulder.y - topMidShoulder.y) / bodyWidth;
  const hipRise = Math.max(0, addressMidHip.y - topMidHip.y) / bodyWidth;
  const torsoLoss = Math.max(0, addressTorso! - topTorso!) / 45;
  const notes = view === 'face-on' ? ['Posture metric confidence is lower from face-on video.'] : [];
  return {
    value: 0.4 * torsoLoss + 0.3 * shoulderRise + 0.3 * hipRise,
    units: config.units,
    confidence: view === 'down-the-line' ? config.confidence : 'low',
    supported: true,
    notes,
  };
}

export function evaluateMetric(value: number | null, config: ThresholdConfig): MetricRating | null {
  if (!Number.isFinite(value)) return null;
  if (Number.isFinite(config.goodMin) && Number.isFinite(config.goodMax) && Number.isFinite(config.acceptableMin) && Number.isFinite(config.acceptableMax)) {
    if (value! >= config.goodMin! && value! <= config.goodMax!) return 'good';
    if (value! >= config.acceptableMin! && value! <= config.acceptableMax!) return 'acceptable';
    return 'problematic';
  }
  if (Number.isFinite(config.goodMax) && Number.isFinite(config.acceptableMax)) return value! <= config.goodMax! ? 'good' : value! <= config.acceptableMax! ? 'acceptable' : 'problematic';
  if (Number.isFinite(config.goodMin) && Number.isFinite(config.acceptableMin)) return value! >= config.goodMin! ? 'good' : value! >= config.acceptableMin! ? 'acceptable' : 'problematic';
  return null;
}

export function evaluateShoulderTurn(angle: MetricResult, ratio: MetricResult) {
  if (angle.supported && Number.isFinite(angle.value)) return { result: angle, rating: evaluateMetric(angle.value, metricThresholds.shoulderTurnAngleTopPreferred), proxyUsed: false };
  return { result: { ...ratio, notes: [...(ratio.notes ?? []), 'Shoulder turn angle was unavailable, so a 2D ratio proxy was used.'] }, rating: evaluateMetric(ratio.value, metricThresholds.shoulderTurnRatio), proxyUsed: true };
}

function withRating(metricKey: string, result: MetricResult, rating: MetricRating | null) {
  return { ...result, rating, feedback: rating ? getMetricFeedback(metricKey, rating, result.notes ?? []) : null };
}

export function resolveSwingEvents(timeline: PoseFrame[], events?: Partial<SwingEvents>): SwingEvents {
  const normalized = timeline.map((frame) => `${frame.phase ?? ''} ${frame.event ?? ''} ${frame.name ?? ''}`.toLowerCase());
  const addressIndex = events?.addressIndex ?? normalized.findIndex((label) => /address|setup|start/.test(label));
  const topIndex = events?.topIndex ?? normalized.findIndex((label) => /top|top-of-backswing|top_of_backswing/.test(label));
  const impactIndex = events?.impactIndex ?? normalized.findIndex((label) => /impact/.test(label));
  return {
    addressIndex: addressIndex >= 0 ? addressIndex : 0,
    topIndex: topIndex >= 0 ? topIndex : Math.max(0, Math.min(timeline.length - 1, Math.round((timeline.length - 1) / 2))),
    impactIndex: impactIndex >= 0 ? impactIndex : undefined,
  };
}

export function analyzeGolfSwingMetrics(
  timeline: PoseFrame[],
  events?: Partial<SwingEvents>,
  options: { handedness?: Handedness; view?: SwingView } = {},
) {
  const { addressIndex, topIndex, impactIndex } = resolveSwingEvents(timeline, events);
  const handedness = options.handedness ?? 'right';
  const view = options.view ?? 'face-on';
  const head = computeHeadMovement(timeline, addressIndex);
  const posture = computePostureChange(timeline, addressIndex, topIndex, view);
  const hip = computeHipSway(timeline, addressIndex, topIndex, handedness, view);
  const leadArm = computeLeadArmAngleAtTop(timeline, topIndex, handedness);
  const shoulderRatio = computeShoulderTurnRatio(timeline, addressIndex, topIndex);
  const shoulderAngle = computeShoulderTurnAngleTopPreferred(getFrame(timeline, topIndex), getFrame(timeline, addressIndex));
  const shoulder = evaluateShoulderTurn(shoulderAngle, shoulderRatio);

  const metrics = {
    headMovement: withRating('headMovement', head, evaluateMetric(head.value, metricThresholds.headMovement)),
    postureChange: withRating('postureChange', posture, evaluateMetric(posture.value, metricThresholds.postureChange)),
    hipSway: withRating('hipSway', hip, evaluateMetric(hip.value, metricThresholds.hipSway)),
    leadArmAngleTop: withRating('leadArmAngleTop', leadArm, evaluateMetric(leadArm.value, metricThresholds.leadArmAngleTop)),
    shoulderTurn: { ...withRating('shoulderTurn', shoulder.result, shoulder.rating), proxyUsed: shoulder.proxyUsed },
  };

  const ratings = Object.values(metrics).map((metric) => metric.rating).filter(Boolean) as MetricRating[];
  return {
    metrics,
    summary: {
      problematicCount: ratings.filter((rating) => rating === 'problematic').length,
      acceptableCount: ratings.filter((rating) => rating === 'acceptable').length,
      goodCount: ratings.filter((rating) => rating === 'good').length,
    },
    events: { addressIndex, topIndex, impactIndex },
  };
}

/*
Developer summary:
- Files changed: src/config/golfMetricThresholds.json, src/lib/pose/golfMetrics.ts, src/lib/pose/golfMetricFeedback.ts, src/lib/pose/landmarkAdapters.ts, src/lib/pose/__tests__/golfMetrics.test.ts.
- Formulas implemented: head movement, posture change composite, hip sway away from target, lead arm top angle/flex, 2D shoulder turn ratio, and preferred 3D shoulder-line yaw angle.
- Tests added: deterministic threshold classification tests for all configured golf metrics.
- Thresholds live in src/config/golfMetricThresholds.json.
*/
