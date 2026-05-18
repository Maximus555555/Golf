import { describe, expect, it } from 'vitest';
import { getStableBodyScale } from '../bodyScale';
import { rejectOutlierFrames } from '../poseQuality';
import { detectSwingPhases } from '../../swingPhaseDetector';

function frame(overrides: any = {}) {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  landmarks[11] = { x: 0.4, y: 0.4, visibility: 1 };
  landmarks[12] = { x: 0.6, y: 0.4, visibility: 1 };
  landmarks[0] = { x: 0.5, y: 0.2, visibility: 1 };
  return { landmarks, ...overrides };
}

describe('robust analysis helpers', () => {
  it('uses median stable body scale', () => {
    const timeline = [0.2, 0.19, 0.21, 0.8].map((w) => frame({ landmarks: Object.assign(Array(33).fill({ x: 0.5, y: 0.5, visibility: 1 }), { 11: { x: 0.5 - w/2, y: 0.4, visibility: 1 }, 12: { x: 0.5 + w/2, y: 0.4, visibility: 1 } }) }));
    const res = getStableBodyScale(timeline, 1);
    expect(res.bodyWidth).toBeLessThan(0.3);
  });

  it('rejects outlier head jumps', () => {
    const t = [frame(), frame({ landmarks: Object.assign(Array(33).fill({ x: 0.5, y: 0.5, visibility: 1 }), {0:{x:1.2,y:0.2,visibility:1},11:{x:0.4,y:0.4,visibility:1},12:{x:0.6,y:0.4,visibility:1}}) })];
    const rejected = rejectOutlierFrames(t, 0.2);
    expect(rejected.has(1)).toBe(true);
  });

  it('detects swing phases', () => {
    const t = Array.from({ length: 40 }, (_, i) => frame({ timestampMs: i * 50 }));
    const phases = detectSwingPhases(t, {});
    expect(phases.addressIndex).not.toBeNull();
    expect(phases.topIndex).not.toBeNull();
  });
});
