import { describe, it, expect } from 'vitest';
import { getLeadArmSide, getTargetDirectionSign } from './swingAnalyzer.js';

describe('swing analyzer handedness helpers', () => {
  it('uses left lead arm for right handed', () => {
    expect(getLeadArmSide('right')).toBe('left');
  });

  it('uses right lead arm for left handed', () => {
    expect(getLeadArmSide('left')).toBe('right');
  });

  it('computes right-handed face-on target direction', () => {
    expect(getTargetDirectionSign('right', false)).toBe(1);
  });

  it('computes left-handed face-on target direction', () => {
    expect(getTargetDirectionSign('left', false)).toBe(-1);
  });

  it('mirroring reverses target direction', () => {
    expect(getTargetDirectionSign('right', true)).toBe(-1);
    expect(getTargetDirectionSign('left', true)).toBe(1);
  });
});
