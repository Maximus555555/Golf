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
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
};

const MIN_VISIBILITY = 0.45;
const FULL_FAILURE_MIN_ANY_POSE_FRAMES = 8;
const FULL_FAILURE_MIN_USABLE_RATIO = 0.1;
const MIN_CATEGORY_FRAMES = 5;
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
  { name: 'leftHeel', index: LANDMARK.leftHeel },
  { name: 'rightHeel', index: LANDMARK.rightHeel },
  { name: 'leftFootIndex', index: LANDMARK.leftFootIndex },
  { name: 'rightFootIndex', index: LANDMARK.rightFootIndex },
];

const RECORDING_QUALITY_WARNINGS = {
  body_not_fully_visible: 'Only part of your body was visible, so the app analyzed the clearest available movement.',
  feet_limited: 'Your feet were not fully visible, so finish-balance feedback may be limited.',
  arms_limited: 'Your arms were hard to track, so arm-position feedback may be limited.',
  hips_limited: 'Your hips were not clearly visible, so hip-sway feedback may be limited.',
  lower_body_limited: 'Your lower body was not fully visible, so finish-balance feedback may be limited.',
  camera_too_shaky: 'The camera appears to move during the swing. Place the phone on a stable surface for better feedback.',
  too_few_usable_frames: 'The app could not read enough visible body landmarks. Try recording again in brighter light with a steadier camera.',
  wrong_distance: 'The camera may be too close. Move the phone farther back so your whole body stays in frame.',
};

function point(frame, index) {
  const landmark = frame?.landmarks?.[index];
  if (!landmark || (landmark.visibility ?? 1) < MIN_VISIBILITY) return null;
  return landmark;
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
  const rightElbow = point(frame, LANDMARK.rightElbow);
  const leftWrist = point(frame, LANDMARK.leftWrist);
  const rightWrist = point(frame, LANDMARK.rightWrist);
  const leftFoot = firstPoint(frame, [LANDMARK.leftAnkle, LANDMARK.leftHeel, LANDMARK.leftFootIndex]);
  const rightFoot = firstPoint(frame, [LANDMARK.rightAnkle, LANDMARK.rightHeel, LANDMARK.rightFootIndex]);
  const visibleQualityCount = QUALITY_LANDMARKS.filter(({ index }) => point(frame, index)).length;
  const visiblePoints = QUALITY_LANDMARKS.map(({ index }) => point(frame, index)).filter(Boolean);

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
    leftElbow,
    rightElbow,
    leftWrist,
    rightWrist,
    leftFoot,
    rightFoot,
    shoulderCenter: midpoint(leftShoulder, rightShoulder),
    hipCenter: midpoint(leftHip, rightHip),
    kneeCenter: midpoint(leftKnee, rightKnee),
    ankleCenter: midpoint(leftAnkle, rightAnkle),
    footCenter: midpoint(leftFoot, rightFoot),
    shoulderWidth: distance(leftShoulder, rightShoulder),
    hipWidth: distance(leftHip, rightHip),
    stanceWidth: distance(leftFoot, rightFoot) || distance(leftAnkle, rightAnkle),
    leftArmAngle: angleDegrees(leftShoulder, leftElbow, leftWrist),
    rightArmAngle: angleDegrees(rightShoulder, rightElbow, rightWrist),
    visibleRequiredRatio: visibleQualityCount / QUALITY_LANDMARKS.length,
    hasAnyLandmark: visibleQualityCount > 0,
    bounds: boundingBox(visiblePoints),
  };
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
  const framesWithAnyPose = videoStats.framesWithAnyPose ?? metrics.filter((metric) => metric.hasAnyLandmark).length;
  const usableFramePercentage = totalFramesSampled ? framesWithAnyPose / totalFramesSampled : 0;
  const visibleLandmarkFrequency = videoStats.visibleLandmarkFrequency ?? getVisibleLandmarkFrequency(poseTimeline, totalFramesSampled);
  const diagnostics = {
    totalFramesSampled,
    framesWherePoseDetectionRan: videoStats.framesWherePoseDetectionRan ?? totalFramesSampled,
    framesWithAnyPose,
    usableFramePercentage,
    visibleLandmarkFrequency,
    mostOftenMissingLandmarks: videoStats.mostOftenMissingLandmarks ?? getMissingLandmarkSummary(poseTimeline),
  };
  const failureReason = getFullFailureReason(diagnostics);

  if (failureReason) {
    const failureDiagnostics = { ...diagnostics, skippedIssueCategories: getSkippedIssueCategories({}), reason: failureReason };
    logAnalysisStats(failureDiagnostics);
    return {
      issues: [],
      recordingQualityNotes: [makeRecordingNote('too_few_usable_frames')],
      summary: 'The recording quality was too limited for reliable swing feedback. Please record again before using the swing notes.',
      diagnostics: failureDiagnostics,
      fullFailure: true,
    };
  }

  const headMovementMetrics = metrics.filter((metric) => metric.head);
  const shoulderOnlyPostureMetrics = metrics.filter((metric) => metric.shoulderCenter && metric.shoulderWidth > 0);
  const hipOnlyPostureMetrics = metrics.filter((metric) => metric.hipCenter);
  const postureMetrics = metrics.filter((metric) => metric.shoulderCenter || metric.hipCenter);
  const hipMetrics = metrics.filter((metric) => metric.hipCenter);
  const leftLeadArmMetrics = metrics.filter((metric) => Number.isFinite(metric.leftArmAngle));
  const rightLeadArmMetrics = metrics.filter((metric) => Number.isFinite(metric.rightArmAngle));
  const leadArmSide = rightLeadArmMetrics.length > leftLeadArmMetrics.length ? 'right' : 'left';
  const leadArmMetrics = leadArmSide === 'right' ? rightLeadArmMetrics : leftLeadArmMetrics;
  const finishBalanceMetrics = metrics.filter((metric) => metric.hipCenter && metric.kneeCenter && (metric.footCenter || metric.ankleCenter));
  const shoulderTurnMetrics = shoulderOnlyPostureMetrics;
  const analyzability = {
    headMovement: makeAnalyzability(headMovementMetrics, 'No reliable head or face landmark was visible often enough.'),
    posture: makeAnalyzability(postureMetrics, 'Shoulders or hips were not visible often enough.'),
    hipSway: makeAnalyzability(hipMetrics, 'Hips were not clearly visible often enough.'),
    shoulderTurn: makeAnalyzability(shoulderTurnMetrics, 'Both shoulders were not visible often enough.'),
    leadArm: makeAnalyzability(leadArmMetrics, 'A shoulder, elbow, and wrist on the same arm were not visible often enough.'),
    finishBalance: makeAnalyzability(finishBalanceMetrics, 'Hips, knees, and ankles or feet were not visible often enough.'),
  };
  const skippedIssueCategories = getSkippedIssueCategories(analyzability);
  const recordingQualityNotes = getRecordingQualityNotes(metrics, diagnostics, analyzability);
  const detectedIssues = [];

  let maxHeadMove = null;
  if (analyzability.headMovement.analyzable) {
    const headWindows = getWindows(headMovementMetrics);
    const setupHead = midpointOfPoints(headWindows.setup.map((metric) => metric.head));
    const headScale = getMovementScale(headMovementMetrics);
    maxHeadMove = max(headMovementMetrics.map((metric) => (metric.head && setupHead ? distance(metric.head, setupHead) / headScale : null)));
    if (maxHeadMove > 0.45) {
      detectedIssues.push(
        makeIssue(
          'excessive_head_movement',
          severityFromThresholds(maxHeadMove, 0.45, 0.75, 1.05),
          clampConfidence((maxHeadMove - 0.3) / 0.85),
          `Detected head movement was about ${formatRatio(maxHeadMove)} body-width units from your setup position.`,
        ),
      );
    }
  }

  let postureRise = null;
  if (analyzability.posture.analyzable) {
    const postureWindows = getWindows(postureMetrics);
    const postureScale = getMovementScale(postureMetrics);
    const setupShoulderY = average(postureWindows.setup.map((metric) => metric.shoulderCenter?.y));
    const setupHipY = average(postureWindows.setup.map((metric) => metric.hipCenter?.y));
    const maxShoulderRise = max(postureMetrics.map((metric) => (Number.isFinite(setupShoulderY) && metric.shoulderCenter ? setupShoulderY - metric.shoulderCenter.y : null)));
    const maxHipRise = max(postureMetrics.map((metric) => (Number.isFinite(setupHipY) && metric.hipCenter ? setupHipY - metric.hipCenter.y : null)));
    if (shoulderOnlyPostureMetrics.length >= MIN_CATEGORY_FRAMES && hipOnlyPostureMetrics.length >= MIN_CATEGORY_FRAMES) {
      postureRise = ((maxShoulderRise || 0) + (maxHipRise || 0) * 0.7) / postureScale;
    } else if (shoulderOnlyPostureMetrics.length >= MIN_CATEGORY_FRAMES) {
      postureRise = (maxShoulderRise || 0) / postureScale;
    } else if (hipOnlyPostureMetrics.length >= MIN_CATEGORY_FRAMES) {
      postureRise = (maxHipRise || 0) / postureScale;
    }
    if (postureRise > 0.22) {
      const partialPosture = shoulderOnlyPostureMetrics.length < MIN_CATEGORY_FRAMES || hipOnlyPostureMetrics.length < MIN_CATEGORY_FRAMES;
      detectedIssues.push(
        makeIssue(
          'posture_loss',
          severityFromThresholds(postureRise, 0.22, 0.35, 0.58),
          clampConfidence(((postureRise - 0.16) / 0.5) * (partialPosture ? 0.75 : 1)),
          partialPosture
            ? `Your visible shoulder or hip height rose by about ${formatRatio(postureRise)} body-width units compared with setup.`
            : `Your shoulder and hip height rose by about ${formatRatio(postureRise)} body-width units compared with setup.`,
        ),
      );
    }
  }

  let minLeadArmAngle = null;
  if (analyzability.leadArm.analyzable) {
    const leadArmWindows = getWindows(leadArmMetrics);
    minLeadArmAngle = min(leadArmWindows.backswing.map((metric) => (leadArmSide === 'right' ? metric.rightArmAngle : metric.leftArmAngle)));
    if (Number.isFinite(minLeadArmAngle) && minLeadArmAngle < 140) {
      detectedIssues.push(
        makeIssue(
          'lead_arm_collapse',
          severityFromThresholds(140 - minLeadArmAngle, 0, 18, 40),
          clampConfidence((145 - minLeadArmAngle) / 55),
          `The smallest visible ${leadArmSide}-arm angle was about ${Math.round(minLeadArmAngle)}° near the backswing.`,
        ),
      );
    }
  }

  let maxHipSway = null;
  if (analyzability.hipSway.analyzable) {
    const hipWindows = getWindows(hipMetrics);
    const setupHip = midpointOfPoints(hipWindows.setup.map((metric) => metric.hipCenter));
    const hipScale = getMovementScale(hipMetrics);
    maxHipSway = max(hipMetrics.map((metric) => (metric.hipCenter && setupHip ? Math.abs(metric.hipCenter.x - setupHip.x) / hipScale : null)));
    if (maxHipSway > 0.22) {
      detectedIssues.push(
        makeIssue(
          'hip_sway',
          severityFromThresholds(maxHipSway, 0.22, 0.32, 0.5),
          clampConfidence((maxHipSway - 0.16) / 0.42),
          `Your hip center shifted sideways about ${formatRatio(maxHipSway)} body-width units from setup.`,
        ),
      );
    }
  }

  let finishDrift = null;
  if (analyzability.finishBalance.analyzable) {
    const finishWindows = getWindows(finishBalanceMetrics);
    const finishSetupScale = getMovementScale(finishBalanceMetrics);
    finishDrift = average(
      finishWindows.finish.map((metric) => {
        const lowerCenter = metric.footCenter || metric.ankleCenter;
        if (!metric.hipCenter || !metric.kneeCenter || !lowerCenter) return null;
        const hipsToFeet = Math.abs(metric.hipCenter.x - lowerCenter.x) / finishSetupScale;
        const kneesToFeet = Math.abs(metric.kneeCenter.x - lowerCenter.x) / finishSetupScale;
        return hipsToFeet * 0.65 + kneesToFeet * 0.35;
      }),
    );
    if (finishDrift > 0.3) {
      detectedIssues.push(
        makeIssue(
          'poor_finish_balance',
          severityFromThresholds(finishDrift, 0.3, 0.38, 0.58),
          clampConfidence((finishDrift - 0.22) / 0.46),
          `At the finish, your hips and knees drifted about ${formatRatio(finishDrift)} stance-width units away from your foot center.`,
        ),
      );
    }
  }

  let shoulderTurnRatio = null;
  if (analyzability.shoulderTurn.analyzable) {
    const shoulderWindows = getWindows(shoulderTurnMetrics);
    const shoulderTurnSetupWidth = average(shoulderWindows.setup.map((metric) => metric.shoulderWidth)) || getMovementScale(shoulderTurnMetrics);
    shoulderTurnRatio = getShoulderTurnRatio(shoulderWindows.backswing, shoulderTurnSetupWidth);
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
  }

  const topIssues = rankIssues(removeDuplicateIssues(detectedIssues)).slice(0, 3);
  const analyzedIssueCategories = getAnalyzedIssueCategories(analyzability);
  const finalDiagnostics = {
    ...diagnostics,
    analyzableFrameCounts: {
      headMovement: headMovementMetrics.length,
      posture: postureMetrics.length,
      hipSway: hipMetrics.length,
      shoulderTurn: shoulderTurnMetrics.length,
      leadArm: leadArmMetrics.length,
      finishBalance: finishBalanceMetrics.length,
    },
    analyzability,
    analyzedIssueCategories,
    skippedIssueCategories,
    maxHeadMove,
    postureRise,
    minLeadArmAngle,
    maxHipSway,
    finishDrift,
    shoulderTurnRatio,
    reason: 'passed-with-visible-pose-data',
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


function makeAnalyzability(frames, skippedReason) {
  return {
    analyzable: frames.length >= MIN_CATEGORY_FRAMES,
    frames: frames.length,
    skippedReason: frames.length >= MIN_CATEGORY_FRAMES ? '' : skippedReason,
  };
}

function getSkippedIssueCategories(analyzability) {
  return Object.entries(analyzability)
    .filter(([, value]) => !value?.analyzable)
    .map(([category, value]) => ({ category, reason: value?.skippedReason || 'Not enough visible landmarks for this category.' }));
}

function getAnalyzedIssueCategories(analyzability) {
  const labels = {
    headMovement: 'head movement',
    posture: 'posture',
    hipSway: 'hip sway',
    shoulderTurn: 'shoulder turn',
    leadArm: 'lead-arm position',
    finishBalance: 'finish balance',
  };

  return Object.entries(analyzability)
    .filter(([, value]) => value?.analyzable)
    .map(([category]) => ({ category, label: labels[category] || category }));
}

function getMovementScale(metrics) {
  return (
    average(metrics.map((metric) => metric.shoulderWidth).filter((value) => value > 0)) ||
    average(metrics.map((metric) => metric.hipWidth).filter((value) => value > 0)) ||
    average(metrics.map((metric) => metric.stanceWidth).filter((value) => value > 0)) ||
    getAverageBoundsWidth(metrics) ||
    0.18
  );
}

function getAverageBoundsWidth(metrics) {
  return average(metrics.map((metric) => (metric.bounds ? metric.bounds.maxX - metric.bounds.minX : null)).filter((value) => value > 0));
}

function getRecordingQualityNotes(metrics, diagnostics, analyzability) {
  const notes = [];
  const averageVisibility = average(metrics.map((metric) => metric.visibleRequiredRatio)) || 0;
  const inFrameRatio = average(metrics.map((metric) => (isComfortablyInFrame(metric.bounds) ? 1 : 0))) || 0;
  const tooCloseRatio = average(metrics.map((metric) => (looksTooClose(metric.bounds) ? 1 : 0))) || 0;
  const shakeScore = getCameraShakeScore(metrics.filter((metric) => metric.shoulderCenter || metric.hipCenter || metric.ankleCenter || metric.footCenter));
  const skippedSomeAnalyses = Object.values(analyzability).some((value) => !value.analyzable);

  if (skippedSomeAnalyses || averageVisibility < 0.55 || inFrameRatio < 0.45) {
    notes.push(makeRecordingNote('body_not_fully_visible'));
  }

  if (!analyzability.hipSway?.analyzable) {
    notes.push(makeRecordingNote('hips_limited'));
  }

  if (!analyzability.leadArm?.analyzable) {
    notes.push(makeRecordingNote('arms_limited'));
  }

  if (!analyzability.finishBalance?.analyzable) {
    notes.push(makeRecordingNote('feet_limited'));
    notes.push(makeRecordingNote('lower_body_limited'));
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
  const lowerCenters = metrics.map((metric) => metric.footCenter || metric.ankleCenter).filter(Boolean);
  const lowerBodyJumps = lowerCenters.slice(1).map((point, index) => distance(point, lowerCenters[index]));
  const averageLowerBodyJump = average(lowerBodyJumps) || 0;

  return Math.max(shoulderWidthJitter, averageLowerBodyJump);
}

function getVisibleLandmarkFrequency(poseTimeline, totalFramesSampled = poseTimeline.length) {
  const denominator = totalFramesSampled || poseTimeline.length || 1;
  return QUALITY_LANDMARKS.map(({ name, index }) => {
    const visibleFrames = poseTimeline.filter((frame) => point(frame, index)).length;
    return {
      name,
      visibleFrames,
      visibleRatio: visibleFrames / denominator,
    };
  });
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
    framesWithAnyLandmarks: diagnostics.framesWithAnyPose,
    usableFramePercentage: `${Math.round(diagnostics.usableFramePercentage * 100)}%`,
    visibleLandmarkFrequencySummary: diagnostics.visibleLandmarkFrequency,
    headMovementAnalyzable: diagnostics.analyzability?.headMovement?.analyzable ? 'yes' : 'no',
    postureAnalyzable: diagnostics.analyzability?.posture?.analyzable ? 'yes' : 'no',
    hipSwayAnalyzable: diagnostics.analyzability?.hipSway?.analyzable ? 'yes' : 'no',
    shoulderTurnAnalyzable: diagnostics.analyzability?.shoulderTurn?.analyzable ? 'yes' : 'no',
    leadArmAnalyzable: diagnostics.analyzability?.leadArm?.analyzable ? 'yes' : 'no',
    finishBalanceAnalyzable: diagnostics.analyzability?.finishBalance?.analyzable ? 'yes' : 'no',
    skippedIssueCategories: diagnostics.skippedIssueCategories,
    mostOftenMissingLandmarks: diagnostics.mostOftenMissingLandmarks,
    finalPassFailReason: diagnostics.reason,
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
