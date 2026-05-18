import { describe, expect, it } from 'vitest';
import {
  analyzeGolfSwingMetrics,
  computeHeadMovement,
  computeHipSway,
  computeLeadArmAngleAtTop,
  computePostureChange,
  computeShoulderTurnAngleTopPreferred,
  computeShoulderTurnRatio,
  evaluateMetric,
} from '../golfMetrics';
import type { PoseFrame, PoseLandmark } from '../landmarkAdapters';

const MP = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
};

const maxConfig = { goodMax: 0.1, acceptableMax: 0.2, units: 'test', confidence: 'medium' as const };
const minConfig = { goodMin: 165, acceptableMin: 150, units: 'test', confidence: 'medium' as const };
const angleRangeConfig = { goodMin: 90, goodMax: 105, acceptableMin: 80, acceptableMax: 115, units: 'test', confidence: 'medium' as const };

function lm(x: number, y: number, z?: number): PoseLandmark {
  return { x, y, z, visibility: 1 };
}

function frame(overrides: Partial<Record<keyof typeof MP, PoseLandmark>> = {}, worldOverrides: Partial<Record<keyof typeof MP, PoseLandmark>> = {}): PoseFrame {
  const landmarks: PoseLandmark[] = [];
  landmarks[MP.nose] = lm(0.5, 0.2);
  landmarks[MP.leftEar] = lm(0.45, 0.2);
  landmarks[MP.rightEar] = lm(0.55, 0.2);
  landmarks[MP.leftShoulder] = lm(0, 0.5);
  landmarks[MP.rightShoulder] = lm(1, 0.5);
  landmarks[MP.leftHip] = lm(0.25, 1);
  landmarks[MP.rightHip] = lm(0.75, 1);
  landmarks[MP.leftElbow] = lm(0, 0);
  landmarks[MP.leftWrist] = lm(-1, 0);
  landmarks[MP.rightElbow] = lm(1, 0);
  landmarks[MP.rightWrist] = lm(2, 0);

  for (const [key, value] of Object.entries(overrides)) {
    landmarks[MP[key as keyof typeof MP]] = value as PoseLandmark;
  }

  let worldLandmarks: PoseLandmark[] | undefined;
  if (Object.keys(worldOverrides).length) {
    worldLandmarks = [];
    worldLandmarks[MP.leftShoulder] = lm(0, 0, 0);
    worldLandmarks[MP.rightShoulder] = lm(1, 0, 0);
    for (const [key, value] of Object.entries(worldOverrides)) {
      worldLandmarks[MP[key as keyof typeof MP]] = value as PoseLandmark;
    }
  }

  return { landmarks, worldLandmarks, model: 'mediapipe' };
}

function headShiftTimeline(shift: number) {
  return [
    frame(),
    frame({ nose: lm(0.5 + shift, 0.2), leftEar: lm(0.45 + shift, 0.2), rightEar: lm(0.55 + shift, 0.2) }),
  ];
}

function hipSwayTimeline(awayShift: number) {
  return [
    frame(),
    frame({ leftHip: lm(0.25 - awayShift, 1), rightHip: lm(0.75 - awayShift, 1) }),
  ];
}

function leadArmFrame(angleDeg: number) {
  const radians = (angleDeg * Math.PI) / 180;
  return frame({
    leftShoulder: lm(1, 0),
    leftElbow: lm(0, 0),
    leftWrist: lm(Math.cos(radians), Math.sin(radians)),
  });
}

function shoulderRatioTimeline(ratio: number) {
  return [frame(), frame({ leftShoulder: lm(0.5 - ratio / 2, 0.5), rightShoulder: lm(0.5 + ratio / 2, 0.5) })];
}

function postureTimeline(score: number) {
  const rise = score / 0.6;
  return [
    frame(),
    frame({
      leftShoulder: lm(0, 0.5 - rise),
      rightShoulder: lm(1, 0.5 - rise),
      leftHip: lm(0.25, 1 - rise),
      rightHip: lm(0.75, 1 - rise),
    }),
  ];
}

function shoulderAngleFrames(angleDeg: number) {
  const radians = (angleDeg * Math.PI) / 180;
  return {
    address: frame({}, { leftShoulder: lm(0, 0, 0), rightShoulder: lm(1, 0, 0) }),
    top: frame({}, { leftShoulder: lm(0, 0, 0), rightShoulder: lm(Math.cos(radians), 0, Math.sin(radians)) }),
  };
}

describe('golf metric threshold checks', () => {
  it('classifies head movement as good, acceptable, and problematic', () => {
    expect(evaluateMetric(computeHeadMovement(headShiftTimeline(0.08), 0).value, maxConfig)).toBe('good');
    expect(evaluateMetric(computeHeadMovement(headShiftTimeline(0.14), 0).value, maxConfig)).toBe('acceptable');
    expect(evaluateMetric(computeHeadMovement(headShiftTimeline(0.2), 0).value, { ...maxConfig, acceptableMax: 0.18 })).toBe('problematic');
  });

  it('classifies right-handed face-on hip sway away from target', () => {
    expect(analyzeGolfSwingMetrics(hipSwayTimeline(0.12), { addressIndex: 0, topIndex: 1 }, { handedness: 'right', view: 'face-on' }).metrics.hipSway.rating).toBe('good');
    expect(analyzeGolfSwingMetrics(hipSwayTimeline(0.18), { addressIndex: 0, topIndex: 1 }, { handedness: 'right', view: 'face-on' }).metrics.hipSway.rating).toBe('acceptable');
    expect(analyzeGolfSwingMetrics(hipSwayTimeline(0.25), { addressIndex: 0, topIndex: 1 }, { handedness: 'right', view: 'face-on' }).metrics.hipSway.rating).toBe('problematic');
  });

  it('classifies lead arm angle at top', () => {
    expect(evaluateMetric(computeLeadArmAngleAtTop([frame(), leadArmFrame(170)], 1, 'right').value, minConfig)).toBe('good');
    expect(evaluateMetric(computeLeadArmAngleAtTop([frame(), leadArmFrame(158)], 1, 'right').value, minConfig)).toBe('acceptable');
    expect(evaluateMetric(computeLeadArmAngleAtTop([frame(), leadArmFrame(138)], 1, 'right').value, minConfig)).toBe('problematic');
  });

  it('classifies shoulder turn ratio', () => {
    expect(analyzeGolfSwingMetrics(shoulderRatioTimeline(0.62), { addressIndex: 0, topIndex: 1 }).metrics.shoulderTurn.rating).toBe('good');
    expect(analyzeGolfSwingMetrics(shoulderRatioTimeline(0.78), { addressIndex: 0, topIndex: 1 }).metrics.shoulderTurn.rating).toBe('acceptable');
    expect(analyzeGolfSwingMetrics(shoulderRatioTimeline(0.9), { addressIndex: 0, topIndex: 1 }).metrics.shoulderTurn.rating).toBe('problematic');
    expect(computeShoulderTurnRatio(shoulderRatioTimeline(0.62), 0, 1).value).toBeCloseTo(0.62);
  });

  it('classifies posture change scores', () => {
    expect(analyzeGolfSwingMetrics(postureTimeline(0.07), { addressIndex: 0, topIndex: 1 }, { view: 'down-the-line' }).metrics.postureChange.rating).toBe('good');
    expect(analyzeGolfSwingMetrics(postureTimeline(0.15), { addressIndex: 0, topIndex: 1 }, { view: 'down-the-line' }).metrics.postureChange.rating).toBe('acceptable');
    expect(analyzeGolfSwingMetrics(postureTimeline(0.26), { addressIndex: 0, topIndex: 1 }, { view: 'down-the-line' }).metrics.postureChange.rating).toBe('problematic');
    expect(computePostureChange(postureTimeline(0.15), 0, 1, 'face-on').notes).toContain('Posture metric confidence is lower from face-on video.');
  });

  it('classifies preferred shoulder turn angle', () => {
    const good = shoulderAngleFrames(98);
    const acceptable = shoulderAngleFrames(86);
    const problematic = shoulderAngleFrames(72);
    expect(evaluateMetric(computeShoulderTurnAngleTopPreferred(good.top, good.address).value, angleRangeConfig)).toBe('good');
    expect(evaluateMetric(computeShoulderTurnAngleTopPreferred(acceptable.top, acceptable.address).value, angleRangeConfig)).toBe('acceptable');
    expect(evaluateMetric(computeShoulderTurnAngleTopPreferred(problematic.top, problematic.address).value, angleRangeConfig)).toBe('problematic');
  });

  it('computes hip sway directly and includes proxy feedback when 3D shoulder angle is unavailable', () => {
    expect(computeHipSway(hipSwayTimeline(0.12), 0, 1, 'right', 'face-on').value).toBeCloseTo(0.12);
    const aggregate = analyzeGolfSwingMetrics(shoulderRatioTimeline(0.62), { addressIndex: 0, topIndex: 1 });
    expect(aggregate.metrics.shoulderTurn.proxyUsed).toBe(true);
    expect(aggregate.metrics.shoulderTurn.feedback).toContain('Shoulder turn angle was unavailable, so a 2D ratio proxy was used.');
  });
});
