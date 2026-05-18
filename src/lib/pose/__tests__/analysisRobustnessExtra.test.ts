import { describe, expect, it } from 'vitest';
import { __createSampleTimesForTests } from '../../poseDetector.js';
import { detectSwingPhases } from '../../swingPhaseDetector.js';

describe('sampling density', () => {
  it('creates dense samples for 6s clip', () => {
    const times = __createSampleTimesForTests(6);
    expect(times.length).toBeGreaterThanOrEqual(90);
    expect(times.length).toBeLessThanOrEqual(120);
  });
});

function frame(x: number) {
  const landmarks: any[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  landmarks[11] = { x: 0.4, y: 0.4, visibility: 1 };
  landmarks[12] = { x: 0.6, y: 0.4, visibility: 1 };
  landmarks[23] = { x: 0.45, y: 0.6, visibility: 1 };
  landmarks[24] = { x: 0.55, y: 0.6, visibility: 1 };
  landmarks[15] = { x, y: 0.45, visibility: 1 };
  landmarks[16] = { x, y: 0.45, visibility: 1 };
  return { landmarks };
}

describe('phase detection heuristics', () => {
  it('does not default strictly to 55/80 when reversal exists', () => {
    const timeline = [
      ...Array.from({ length: 8 }, () => frame(0.5)),
      frame(0.45), frame(0.4), frame(0.35), frame(0.3), frame(0.28),
      frame(0.3), frame(0.35), frame(0.42), frame(0.5), frame(0.58), frame(0.62),
      frame(0.61), frame(0.59),
    ].map((f, i) => ({ ...f, timestampMs: i * 66 }));
    const phases = detectSwingPhases(timeline);
    const swingLen = phases.finishIndex! - phases.takeawayStartIndex!;
    const pct55 = phases.takeawayStartIndex! + Math.floor(swingLen * 0.55);
    const pct80 = phases.takeawayStartIndex! + Math.floor(swingLen * 0.8);
    expect(phases.topIndex).not.toBe(pct55);
    expect(phases.impactIndex).not.toBe(pct80);
  });
});
