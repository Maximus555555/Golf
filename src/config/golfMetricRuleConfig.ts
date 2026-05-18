export const GOLF_METRIC_THRESHOLDS = {
  headMovement: { goodMax: 0.1, acceptableMax: 0.18, units: 'bodyWidthRatio', sourceStatus: 'coaching-backed-proxy' },
  postureChange: { goodMax: 0.1, acceptableMax: 0.2, units: 'compositeScore', sourceStatus: 'derived-proxy-dtl-preferred' },
  hipSway: { goodMax: 0.15, acceptableMax: 0.22, units: 'bodyWidthRatio', sourceStatus: 'source-informed-face-on' },
  leadArmAngleTop: { goodMin: 165, acceptableMin: 150, units: 'degrees', sourceStatus: 'coaching-backed' },
  shoulderTurnAngleTopPreferred: { goodMin: 90, goodMax: 105, acceptableMin: 80, acceptableMax: 115, units: 'degrees', sourceStatus: 'preferred-3d-angle' },
  shoulderTurnRatio: { goodMax: 0.7, acceptableMax: 0.85, units: 'ratio', sourceStatus: 'derived-2d-fallback-proxy' },
} as const;
