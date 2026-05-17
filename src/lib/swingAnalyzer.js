const LANDMARK = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftAnkle: 27,
  rightAnkle: 28,
};

const MIN_VISIBILITY = 0.45;

const ISSUE_COPY = {
  headMovement: {
    id: 'head-movement',
    title: 'Keep your head more centered',
    severity: 'medium',
    whatHappened: 'Your head moved noticeably during the swing.',
    whyItMatters: 'Large head movement can make it harder to return the club consistently to the ball.',
    howToFix: 'Keep your head more centered while turning your shoulders around your body.',
    drill: 'Make slow half-swings while keeping your eyes on the same point.',
  },
  postureLoss: {
    id: 'posture-loss',
    title: 'Maintain your posture longer',
    severity: 'medium',
    whatHappened: 'Your upper body appeared to rise during the swing.',
    whyItMatters: 'Standing up can change your swing path and cause inconsistent contact.',
    howToFix: 'Keep your knees flexed and maintain your chest angle longer.',
    drill: 'Practice slow swings while holding your finish and checking that your posture stays athletic.',
  },
  leadArmCollapse: {
    id: 'lead-arm-collapse',
    title: 'Keep width in your lead arm',
    severity: 'low',
    whatHappened: 'Your lead arm appeared to bend significantly near the top of the backswing.',
    whyItMatters: 'A collapsing lead arm can make the swing longer and harder to control.',
    howToFix: 'Shorten the backswing and keep the lead arm comfortably extended.',
    drill: 'Take three-quarter swings focusing on width, not power.',
  },
  hipSway: {
    id: 'hip-sway',
    title: 'Turn instead of swaying',
    severity: 'medium',
    whatHappened: 'Your hips appeared to slide sideways during the swing.',
    whyItMatters: 'Too much sway can make timing and contact less consistent.',
    howToFix: 'Feel like you are turning around your center instead of sliding off the ball.',
    drill: 'Make practice swings with your feet slightly closer together to improve centered rotation.',
  },
  poorBalance: {
    id: 'poor-balance',
    title: 'Hold a balanced finish',
    severity: 'low',
    whatHappened: 'Your finish position looked unstable.',
    whyItMatters: 'Poor balance often means the swing was rushed or off-center.',
    howToFix: 'Swing at 70% speed and hold the finish.',
    drill: 'After each swing, hold your finish for three seconds.',
  },
};

function point(frame, index) {
  const landmark = frame?.landmarks?.[index];
  if (!landmark || (landmark.visibility ?? 1) < MIN_VISIBILITY) return null;
  return landmark;
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 };
}

function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleDegrees(a, b, c) {
  if (!a || !b || !c) return null;
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  if (!mag) return null;
  const cos = Math.max(-1, Math.min(1, dot / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function max(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? Math.max(...usable) : null;
}

function frameMetrics(frame) {
  const leftShoulder = point(frame, LANDMARK.leftShoulder);
  const rightShoulder = point(frame, LANDMARK.rightShoulder);
  const leftHip = point(frame, LANDMARK.leftHip);
  const rightHip = point(frame, LANDMARK.rightHip);
  const leftAnkle = point(frame, LANDMARK.leftAnkle);
  const rightAnkle = point(frame, LANDMARK.rightAnkle);
  const leftElbow = point(frame, LANDMARK.leftElbow);
  const leftWrist = point(frame, LANDMARK.leftWrist);

  return {
    nose: point(frame, LANDMARK.nose),
    shoulderCenter: midpoint(leftShoulder, rightShoulder),
    hipCenter: midpoint(leftHip, rightHip),
    ankleCenter: midpoint(leftAnkle, rightAnkle),
    shoulderWidth: distance(leftShoulder, rightShoulder),
    stanceWidth: distance(leftAnkle, rightAnkle),
    leadArmAngle: angleDegrees(leftShoulder, leftElbow, leftWrist),
  };
}

function makeIssue(key, confidence, severityOverride) {
  return {
    ...ISSUE_COPY[key],
    severity: severityOverride ?? ISSUE_COPY[key].severity,
    confidence,
  };
}

export function analyzeSwing(poseTimeline = []) {
  const metrics = poseTimeline.map(frameMetrics);
  const usableMetrics = metrics.filter((metric) => metric.shoulderCenter && metric.hipCenter);

  if (usableMetrics.length < 6) {
    return {
      issues: [],
      summary: 'No major beginner issues were detected from this recording. Try recording again with your full body visible from the side or front.',
      diagnostics: { usableFrames: usableMetrics.length, reason: 'not-enough-visible-landmarks' },
    };
  }

  const setupWindow = usableMetrics.slice(0, Math.max(3, Math.round(usableMetrics.length * 0.18)));
  const finishWindow = usableMetrics.slice(Math.max(0, Math.round(usableMetrics.length * 0.78)));
  const setupShoulderWidth = average(setupWindow.map((metric) => metric.shoulderWidth)) || 0.18;
  const setupStanceWidth = average(setupWindow.map((metric) => metric.stanceWidth)) || setupShoulderWidth * 1.6;
  const setupNose = midpointOfPoints(setupWindow.map((metric) => metric.nose));
  const setupShoulderY = average(setupWindow.map((metric) => metric.shoulderCenter?.y));
  const setupHipY = average(setupWindow.map((metric) => metric.hipCenter?.y));
  const setupHip = midpointOfPoints(setupWindow.map((metric) => metric.hipCenter));

  const issues = [];

  const maxHeadMove = max(
    usableMetrics.map((metric) => (metric.nose && setupNose ? distance(metric.nose, setupNose) / setupShoulderWidth : null)),
  );
  if (maxHeadMove > 0.75) {
    issues.push(makeIssue('headMovement', clampConfidence((maxHeadMove - 0.55) / 0.7), maxHeadMove > 1.05 ? 'high' : 'medium'));
  }

  const maxShoulderRise = max(usableMetrics.map((metric) => (setupShoulderY && metric.shoulderCenter ? setupShoulderY - metric.shoulderCenter.y : null)));
  const maxHipRise = max(usableMetrics.map((metric) => (setupHipY && metric.hipCenter ? setupHipY - metric.hipCenter.y : null)));
  const postureRise = ((maxShoulderRise || 0) + (maxHipRise || 0) * 0.7) / setupShoulderWidth;
  if (postureRise > 0.35) {
    issues.push(makeIssue('postureLoss', clampConfidence((postureRise - 0.25) / 0.45), postureRise > 0.58 ? 'high' : 'medium'));
  }

  const backswingWindow = usableMetrics.slice(Math.round(usableMetrics.length * 0.25), Math.round(usableMetrics.length * 0.62));
  const minLeadArmAngle = Math.min(...backswingWindow.map((metric) => metric.leadArmAngle).filter(Number.isFinite));
  if (Number.isFinite(minLeadArmAngle) && minLeadArmAngle < 132) {
    issues.push(makeIssue('leadArmCollapse', clampConfidence((140 - minLeadArmAngle) / 38), minLeadArmAngle < 112 ? 'medium' : 'low'));
  }

  const maxHipSway = max(
    usableMetrics.map((metric) => (metric.hipCenter && setupHip ? Math.abs(metric.hipCenter.x - setupHip.x) / setupStanceWidth : null)),
  );
  if (maxHipSway > 0.32) {
    issues.push(makeIssue('hipSway', clampConfidence((maxHipSway - 0.25) / 0.35), maxHipSway > 0.5 ? 'high' : 'medium'));
  }

  const finishDrift = average(
    finishWindow.map((metric) => {
      if (!metric.nose || !metric.hipCenter || !metric.ankleCenter) return null;
      const headToAnkles = Math.abs(metric.nose.x - metric.ankleCenter.x) / setupStanceWidth;
      const hipsToAnkles = Math.abs(metric.hipCenter.x - metric.ankleCenter.x) / setupStanceWidth;
      return headToAnkles * 0.6 + hipsToAnkles * 0.4;
    }),
  );
  if (finishDrift > 0.38) {
    issues.push(makeIssue('poorBalance', clampConfidence((finishDrift - 0.3) / 0.4), finishDrift > 0.58 ? 'medium' : 'low'));
  }

  const topIssues = issues.sort((a, b) => b.confidence - a.confidence).slice(0, 3);

  return {
    issues: topIssues,
    summary: topIssues.length
      ? 'Here are the biggest beginner swing patterns detected from your recording.'
      : 'No major beginner issues were detected from this recording. Try recording again with your full body visible from the side or front.',
    diagnostics: {
      usableFrames: usableMetrics.length,
      maxHeadMove,
      postureRise,
      minLeadArmAngle,
      maxHipSway,
      finishDrift,
    },
  };
}

function midpointOfPoints(points) {
  const usable = points.filter(Boolean);
  if (!usable.length) return null;
  return {
    x: average(usable.map((point) => point.x)),
    y: average(usable.map((point) => point.y)),
    z: average(usable.map((point) => point.z ?? 0)),
  };
}

function clampConfidence(value) {
  return Math.max(0.35, Math.min(0.96, value));
}
