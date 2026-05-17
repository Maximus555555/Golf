import { SEVERITY_SCORE, getCoachingResponse } from '../data/coachingResponses.js';

const LANDMARK = {
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
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
};

const MIN_VISIBILITY = 0.45;
const FULL_FAILURE_MIN_ANY_POSE_FRAMES = 8;
const FULL_FAILURE_MIN_CORE_FRAMES = 5;
const FULL_FAILURE_MIN_USABLE_RATIO = 0.1;
const CORE_LANDMARK_GROUPS = [
  { name: 'head', indexes: [LANDMARK.nose, LANDMARK.leftEar, LANDMARK.rightEar] },
  { name: 'leftShoulder', indexes: [LANDMARK.leftShoulder] },
  { name: 'rightShoulder', indexes: [LANDMARK.rightShoulder] },
  { name: 'leftHip', indexes: [LANDMARK.leftHip] },
  { name: 'rightHip', indexes: [LANDMARK.rightHip] },
];
const QUALITY_LANDMARKS = [
  { name: 'nose', index: LANDMARK.nose },
  { name: 'leftShoulder', index: LANDMARK.leftShoulder },
  { name: 'rightShoulder', index: LANDMARK.rightShoulder },
  { name: 'leftElbow', index: LANDMARK.leftElbow },
  { name: 'rightElbow', index: LANDMARK.rightElbow },
  { name: 'leftWrist', index: LANDMARK.leftWrist },
  { name: 'rightWrist', index: LANDMARK.rightWrist },
  { name: 'leftHip', index: LANDMARK.leftHip },
  { name: 'rightHip', index: LANDMARK.rightHip },
  { name: 'leftKnee', index: LANDMARK.leftKnee },
  { name: 'rightKnee', index: LANDMARK.rightKnee },
  { name: 'leftAnkle', index: LANDMARK.leftAnkle },
  { name: 'rightAnkle', index: LANDMARK.rightAnkle },
];

const RECORDING_QUALITY_WARNINGS = {
  body_not_fully_visible: 'Some body points were hard to track, so the app analyzed only the clearest parts of your swing.',
  camera_too_shaky: 'The camera appears to move during the swing. Place the phone on a stable surface for better feedback.',
  too_few_usable_frames: 'The app could not read enough of the swing. Try recording again in brighter light with your full body visible.',
  wrong_distance: 'The camera may be too close. Move the phone farther back so your whole body stays in frame.',
};

function point(frame, index) {
  const landmark = frame?.landmarks?.[index];
  if (!landmark || (landmark.visibility ?? 1) < MIN_VISIBILITY) return null;
  return landmark;
}

function rawPoint(frame, index) {
  return frame?.landmarks?.[index] ?? null;
}

function firstPoint(frame, indexes) {
  for (const index of indexes) {
    const landmark = point(frame, index);
    if (landmark) return landmark;
  }
  return null;
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

function min(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? Math.min(...usable) : null;
}

function standardDeviation(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length < 2) return 0;
  const mean = average(usable);
  const variance = average(usable.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance || 0);
}

function frameMetrics(frame) {
  const head = firstPoint(frame, [LANDMARK.nose, LANDMARK.leftEar, LANDMARK.rightEar]);
  const leftShoulder = point(frame, LANDMARK.leftShoulder);
  const rightShoulder = point(frame, LANDMARK.rightShoulder);
  const leftHip = point(frame, LANDMARK.leftHip);
  const rightHip = point(frame, LANDMARK.rightHip);
  const leftKnee = point(frame, LANDMARK.leftKnee);
  const rightKnee = point(frame, LANDMARK.rightKnee);
  const leftAnkle = point(frame, LANDMARK.leftAnkle);
  const rightAnkle = point(frame, LANDMARK.rightAnkle);
  const leftElbow = point(frame, LANDMARK.leftElbow);
  const leftWrist = point(frame, LANDMARK.leftWrist);
  const rightWrist = point(frame, LANDMARK.rightWrist);
  const visibleQualityCount = QUALITY_LANDMARKS.filter(({ index }) => point(frame, index)).length;
  const visiblePoints = QUALITY_LANDMARKS.map(({ index }) => rawPoint(frame, index)).filter(Boolean);

  return {
    head,
    nose: point(frame, LANDMARK.nose),
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
    leftWrist,
    rightWrist,
    shoulderCenter: midpoint(leftShoulder, rightShoulder),
    hipCenter: midpoint(leftHip, rightHip),
    kneeCenter: midpoint(leftKnee, rightKnee),
    ankleCenter: midpoint(leftAnkle, rightAnkle),
    shoulderWidth: distance(leftShoulder, rightShoulder),
    hipWidth: distance(leftHip, rightHip),
    stanceWidth: distance(leftAnkle, rightAnkle),
    leadArmAngle: angleDegrees(leftShoulder, leftElbow, leftWrist),
    visibleRequiredRatio: visibleQualityCount / QUALITY_LANDMARKS.length,
    hasCoreLandmarks: hasCoreLandmarks(frame),
    bounds: boundingBox(visiblePoints),
  };
}

function hasCoreLandmarks(frame) {
  const presentGroups = CORE_LANDMARK_GROUPS.filter((group) => group.indexes.some((index) => point(frame, index)));
  return presentGroups.length >= 4;
}

function boundingBox(points) {
  if (!points.length) return null;
  const xs = points.map((landmark) => landmark.x).filter(Number.isFinite);
  const ys = points.map((landmark) => landmark.y).filter(Number.isFinite);
  if (!xs.length || !ys.length) return null;

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function makeIssue(issueId, severity, confidence, movementDescription) {
  const response = getCoachingResponse(issueId, severity);
  if (!response) return null;

  return {
    ...response,
    id: `${issueId}-${severity}`,
    confidence,
    movementDescription,
  };
}

export function analyzeSwing(poseTimeline = [], videoStats = {}) {
  const metrics = poseTimeline.map(frameMetrics);
  const totalFramesSampled = videoStats.totalFramesSampled ?? videoStats.totalFrames ?? poseTimeline.length;
  const framesWithAnyPose = videoStats.framesWithAnyPose ?? poseTimeline.length;
  const coreFrames = videoStats.framesWithCoreLandmarks ?? metrics.filter((metric) => metric.hasCoreLandmarks).length;
  const usableFramePercentage = totalFramesSampled ? framesWithAnyPose / totalFramesSampled : 0;
  const diagnostics = {
    totalFramesSampled,
    framesWherePoseDetectionRan: videoStats.framesWherePoseDetectionRan ?? totalFramesSampled,
    framesWithAnyPose,
    framesWithCoreLandmarks: coreFrames,
    usableFramePercentage,
    mostOftenMissingLandmarks: videoStats.mostOftenMissingLandmarks ?? getMissingLandmarkSummary(poseTimeline),
  };
  const failureReason = getFullFailureReason(diagnostics);

  if (failureReason) {
    const failureDiagnostics = { ...diagnostics, reason: failureReason };
    logAnalysisStats(failureDiagnostics);
    return {
      issues: [],
      recordingQualityNotes: [makeRecordingNote('too_few_usable_frames')],
      summary: 'The recording quality was too limited for reliable swing feedback. Please record again before using the swing notes.',
      diagnostics: failureDiagnostics,
      fullFailure: true,
    };
  }

  const shoulderHipMetrics = metrics.filter((metric) => metric.shoulderCenter && metric.hipCenter);
  const headMovementMetrics = metrics.filter((metric) => metric.head && metric.shoulderCenter && metric.shoulderWidth > 0);
  const postureMetrics = shoulderHipMetrics.filter((metric) => metric.shoulderWidth > 0);
  const hipMetrics = metrics.filter((metric) => metric.hipCenter);
  const leadArmMetrics = metrics.filter((metric) => Number.isFinite(metric.leadArmAngle));
  const finishBalanceMetrics = metrics.filter((metric) => metric.head && metric.hipCenter && metric.ankleCenter);
  const shoulderTurnMetrics = metrics.filter((metric) => metric.shoulderWidth > 0);
  const recordingQualityNotes = getRecordingQualityNotes(metrics, diagnostics, {
    headMovementMetrics,
    postureMetrics,
    hipMetrics,
    leadArmMetrics,
    finishBalanceMetrics,
  });
  const detectedIssues = [];

  const headWindows = getWindows(headMovementMetrics);
  const setupShoulderWidth = average(headWindows.setup.map((metric) => metric.shoulderWidth)) || 0.18;
  const setupHead = midpointOfPoints(headWindows.setup.map((metric) => metric.head));
  const maxHeadMove = max(
    headMovementMetrics.map((metric) => (metric.head && setupHead ? distance(metric.head, setupHead) / setupShoulderWidth : null)),
  );
  if (maxHeadMove > 0.45) {
    detectedIssues.push(
      makeIssue(
        'excessive_head_movement',
        severityFromThresholds(maxHeadMove, 0.45, 0.75, 1.05),
        clampConfidence((maxHeadMove - 0.3) / 0.85),
        `Detected head movement was about ${formatRatio(maxHeadMove)} shoulder widths from your setup position.`,
      ),
    );
  }

  const postureWindows = getWindows(postureMetrics);
  const postureSetupShoulderWidth = average(postureWindows.setup.map((metric) => metric.shoulderWidth)) || setupShoulderWidth;
  const setupShoulderY = average(postureWindows.setup.map((metric) => metric.shoulderCenter?.y));
  const setupHipY = average(postureWindows.setup.map((metric) => metric.hipCenter?.y));
  const maxShoulderRise = max(postureMetrics.map((metric) => (setupShoulderY && metric.shoulderCenter ? setupShoulderY - metric.shoulderCenter.y : null)));
  const maxHipRise = max(postureMetrics.map((metric) => (setupHipY && metric.hipCenter ? setupHipY - metric.hipCenter.y : null)));
  const postureRise = ((maxShoulderRise || 0) + (maxHipRise || 0) * 0.7) / postureSetupShoulderWidth;
  if (postureRise > 0.22) {
    detectedIssues.push(
      makeIssue(
        'posture_loss',
        severityFromThresholds(postureRise, 0.22, 0.35, 0.58),
        clampConfidence((postureRise - 0.16) / 0.5),
        `Your shoulder and hip height rose by about ${formatRatio(postureRise)} shoulder widths compared with setup.`,
      ),
    );
  }

  const leadArmWindows = getWindows(leadArmMetrics);
  const minLeadArmAngle = min(leadArmWindows.backswing.map((metric) => metric.leadArmAngle));
  if (Number.isFinite(minLeadArmAngle) && minLeadArmAngle < 140) {
    detectedIssues.push(
      makeIssue(
        'lead_arm_collapse',
        severityFromThresholds(140 - minLeadArmAngle, 0, 18, 40),
        clampConfidence((145 - minLeadArmAngle) / 55),
        `The smallest visible lead-arm angle was about ${Math.round(minLeadArmAngle)}° near the backswing.`,
      ),
    );
  }

  const hipWindows = getWindows(hipMetrics);
  const setupHip = midpointOfPoints(hipWindows.setup.map((metric) => metric.hipCenter));
  const hipScale = average(hipWindows.setup.map((metric) => metric.stanceWidth || metric.hipWidth || metric.shoulderWidth)) || setupShoulderWidth * 1.6;
  const maxHipSway = max(
    hipMetrics.map((metric) => (metric.hipCenter && setupHip ? Math.abs(metric.hipCenter.x - setupHip.x) / hipScale : null)),
  );
  if (maxHipSway > 0.22) {
    detectedIssues.push(
      makeIssue(
        'hip_sway',
        severityFromThresholds(maxHipSway, 0.22, 0.32, 0.5),
        clampConfidence((maxHipSway - 0.16) / 0.42),
        `Your hip center shifted sideways about ${formatRatio(maxHipSway)} stance widths from setup.`,
      ),
    );
  }

  const finishWindows = getWindows(finishBalanceMetrics);
  const finishSetupScale = average(finishWindows.setup.map((metric) => metric.stanceWidth || metric.hipWidth || metric.shoulderWidth)) || hipScale;
  const finishDrift = average(
    finishWindows.finish.map((metric) => {
      if (!metric.head || !metric.hipCenter || !metric.ankleCenter) return null;
      const headToAnkles = Math.abs(metric.head.x - metric.ankleCenter.x) / finishSetupScale;
      const hipsToAnkles = Math.abs(metric.hipCenter.x - metric.ankleCenter.x) / finishSetupScale;
      return headToAnkles * 0.6 + hipsToAnkles * 0.4;
    }),
  );
  if (finishDrift > 0.3) {
    detectedIssues.push(
      makeIssue(
        'poor_finish_balance',
        severityFromThresholds(finishDrift, 0.3, 0.38, 0.58),
        clampConfidence((finishDrift - 0.22) / 0.46),
        `At the finish, your head and hips drifted about ${formatRatio(finishDrift)} stance widths away from your foot center.`,
      ),
    );
  }

  const shoulderWindows = getWindows(shoulderTurnMetrics);
  const shoulderTurnSetupWidth = average(shoulderWindows.setup.map((metric) => metric.shoulderWidth)) || setupShoulderWidth;
  const shoulderTurnRatio = getShoulderTurnRatio(shoulderWindows.backswing, shoulderTurnSetupWidth);
  if (Number.isFinite(shoulderTurnRatio) && shoulderTurnRatio > 0.82) {
    detectedIssues.push(
      makeIssue(
        'weak_shoulder_turn',
        severityFromThresholds(shoulderTurnRatio, 0.82, 0.88, 0.95),
        clampConfidence((shoulderTurnRatio - 0.76) / 0.24),
        `Your visible shoulder line changed only slightly in the backswing, staying near ${Math.round(shoulderTurnRatio * 100)}% of its setup width.`,
      ),
    );
  }

  const topIssues = rankIssues(removeDuplicateIssues(detectedIssues)).slice(0, 3);
  const finalDiagnostics = {
    ...diagnostics,
    usableFrames: shoulderHipMetrics.length,
    analyzableFrameCounts: {
      headMovement: headMovementMetrics.length,
      posture: postureMetrics.length,
      hipSway: hipMetrics.length,
      leadArm: leadArmMetrics.length,
      finishBalance: finishBalanceMetrics.length,
    },
    maxHeadMove,
    postureRise,
    minLeadArmAngle,
    maxHipSway,
    finishDrift,
    shoulderTurnRatio,
    reason: 'passed-with-usable-pose-data',
  };
  logAnalysisStats(finalDiagnostics);

  return {
    issues: topIssues,
    recordingQualityNotes,
    summary: topIssues.length
      ? 'Here are the top swing patterns detected from your visible body movement.'
      : 'No major beginner swing issue was detected from the visible movement in this recording.',
    diagnostics: finalDiagnostics,
    fullFailure: false,
  };
}

function getFullFailureReason(diagnostics) {
  if (diagnostics.framesWithAnyPose < FULL_FAILURE_MIN_ANY_POSE_FRAMES) return 'fewer-than-8-pose-frames';
  if (diagnostics.framesWithCoreLandmarks < FULL_FAILURE_MIN_CORE_FRAMES) return 'fewer-than-5-core-frames';
  if (diagnostics.usableFramePercentage < FULL_FAILURE_MIN_USABLE_RATIO) return 'less-than-10-percent-usable-pose-frames';
  return '';
}

function getWindows(items) {
  const setupSize = Math.max(1, Math.round(items.length * 0.18));
  return {
    setup: items.slice(0, setupSize),
    backswing: items.slice(Math.round(items.length * 0.25), Math.round(items.length * 0.62)),
    finish: items.slice(Math.max(0, Math.round(items.length * 0.78))),
  };
}

function getRecordingQualityNotes(metrics, diagnostics, analyzableGroups) {
  const notes = [];
  const averageVisibility = average(metrics.map((metric) => metric.visibleRequiredRatio)) || 0;
  const inFrameRatio = average(metrics.map((metric) => (isComfortablyInFrame(metric.bounds) ? 1 : 0))) || 0;
  const tooCloseRatio = average(metrics.map((metric) => (looksTooClose(metric.bounds) ? 1 : 0))) || 0;
  const shakeScore = getCameraShakeScore(metrics.filter((metric) => metric.shoulderCenter || metric.hipCenter || metric.ankleCenter));
  const skippedSomeAnalyses = Object.values(analyzableGroups).some((frames) => frames.length < 5);

  if (skippedSomeAnalyses || averageVisibility < 0.55 || inFrameRatio < 0.45) {
    notes.push(makeRecordingNote('body_not_fully_visible'));
  }

  if (metrics.length && tooCloseRatio > 0.35) {
    notes.push(makeRecordingNote('wrong_distance'));
  }

  if (shakeScore > 0.22) {
    notes.push(makeRecordingNote('camera_too_shaky'));
  }

  if (diagnostics.usableFramePercentage < 0.2) {
    notes.push(makeRecordingNote('too_few_usable_frames'));
  }

  return removeDuplicateNotes(notes);
}

function makeRecordingNote(code) {
  return {
    code,
    message: RECORDING_QUALITY_WARNINGS[code],
  };
}

function isComfortablyInFrame(bounds) {
  if (!bounds) return false;
  return bounds.minX >= -0.05 && bounds.maxX <= 1.05 && bounds.minY >= -0.05 && bounds.maxY <= 1.05;
}

function looksTooClose(bounds) {
  if (!bounds) return false;
  const touchesHorizontalEdge = bounds.minX < 0.04 || bounds.maxX > 0.96;
  const touchesVerticalEdge = bounds.minY < 0.04 || bounds.maxY > 0.96;
  const fillsFrame = bounds.maxX - bounds.minX > 0.86 || bounds.maxY - bounds.minY > 0.9;
  return fillsFrame || touchesHorizontalEdge || touchesVerticalEdge;
}

function getCameraShakeScore(metrics) {
  if (metrics.length < 6) return 0;
  const shoulderWidths = metrics.map((metric) => metric.shoulderWidth).filter((value) => value > 0);
  const shoulderWidthMean = average(shoulderWidths) || 0;
  const shoulderWidthJitter = shoulderWidthMean ? standardDeviation(shoulderWidths) / shoulderWidthMean : 0;
  const ankleCenters = metrics.map((metric) => metric.ankleCenter).filter(Boolean);
  const ankleJumps = ankleCenters.slice(1).map((point, index) => distance(point, ankleCenters[index]));
  const averageAnkleJump = average(ankleJumps) || 0;

  return Math.max(shoulderWidthJitter, averageAnkleJump);
}

function getMissingLandmarkSummary(poseTimeline) {
  const missingCounts = QUALITY_LANDMARKS.map(({ name, index }) => ({
    name,
    missingFrames: poseTimeline.filter((frame) => !point(frame, index)).length,
  }));

  return missingCounts
    .filter(({ missingFrames }) => missingFrames > 0)
    .sort((a, b) => b.missingFrames - a.missingFrames)
    .slice(0, 5);
}

function logAnalysisStats(diagnostics) {
  console.info('[SwingFix] Pose analysis stats', {
    totalFramesSampled: diagnostics.totalFramesSampled,
    framesWherePoseDetectionRan: diagnostics.framesWherePoseDetectionRan,
    framesWithAnyPose: diagnostics.framesWithAnyPose,
    framesWithCoreLandmarks: diagnostics.framesWithCoreLandmarks,
    usableFramePercentage: `${Math.round(diagnostics.usableFramePercentage * 100)}%`,
    mostOftenMissingLandmarks: diagnostics.mostOftenMissingLandmarks,
    finalReason: diagnostics.reason,
  });
}

function severityFromThresholds(value, lowThreshold, mediumThreshold, highThreshold) {
  if (value >= highThreshold) return 'high';
  if (value >= mediumThreshold) return 'medium';
  if (value >= lowThreshold) return 'low';
  return 'low';
}

function getShoulderTurnRatio(backswingWindow, setupShoulderWidth) {
  const minBackswingShoulderWidth = min(backswingWindow.map((metric) => metric.shoulderWidth));
  if (!setupShoulderWidth || !minBackswingShoulderWidth) return null;
  return minBackswingShoulderWidth / setupShoulderWidth;
}

function rankIssues(issues) {
  return issues
    .filter(Boolean)
    .sort((a, b) => {
      const severityDifference = (SEVERITY_SCORE[b.severity] || 0) - (SEVERITY_SCORE[a.severity] || 0);
      if (severityDifference) return severityDifference;
      return b.confidence - a.confidence;
    });
}

function removeDuplicateIssues(issues) {
  const bestById = new Map();

  for (const issue of issues.filter(Boolean)) {
    const current = bestById.get(issue.issueId);
    if (!current || rankIssues([issue, current])[0] === issue) {
      bestById.set(issue.issueId, issue);
    }
  }

  return [...bestById.values()];
}

function removeDuplicateNotes(notes) {
  return [...new Map(notes.map((note) => [note.code, note])).values()];
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

function formatRatio(value) {
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

function clampConfidence(value) {
  return Math.max(0.35, Math.min(0.96, value));
}
