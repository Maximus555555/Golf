import { SEVERITY_SCORE, getCoachingResponse } from '../data/coachingResponses.js';
import { convertNormalizedDistanceToRealWorld, estimateCalibrationScale } from './heightCalibration.js';
import {
  classifySwingFrames,
  getCalibrationFrames,
  getFinishFrames,
  getSetupFrames,
  getSwingAnalysisFrames,
  getSwingMotionFrames,
} from './swingPhaseDetector.js';

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
const MIN_STABLE_BODY_SCALE = 0.18;
const OUTLIER_WIDTH_CHANGE_LIMIT = 0.5;
const MOVEMENT_PERCENTILE = 90;
const ARM_COLLAPSE_PERCENTILE = 10;
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
  unstable_tracking_points: 'Some body-tracking points jumped during the video, so the app ignored unstable frames.',
  unstable_movement_scale: 'Body size changed during tracking, so the app used a safer estimate for movement scale.',
  phase_detection_uncertain: 'The app had trouble separating setup from the swing, so feedback may be less reliable.',
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

function median(values) {
  const usable = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

function percentile(values, percentileRank) {
  const usable = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!usable.length) return null;
  if (usable.length === 1) return usable[0];
  const index = (Math.max(0, Math.min(100, percentileRank)) / 100) * (usable.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return usable[lower];
  return usable[lower] + (usable[upper] - usable[lower]) * (index - lower);
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
    visiblePoints,
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

export function analyzeSwing(poseTimeline = [], videoStats = {}, calibrationSetup = { enabled: false }) {
  const phaseDetection = classifySwingFrames(poseTimeline, videoStats, calibrationSetup);
  const metrics = phaseDetection.frames.map((frame, index) => ({ ...frameMetrics(frame), frameIndex: index, timestampMs: frame.timestampMs, phase: frame.phase }));
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
  const calibration = buildCalibrationResult(calibrationSetup, phaseDetection, poseTimeline, videoStats);
  const failureReason = getFullFailureReason(diagnostics);

  if (failureReason) {
    const failureDiagnostics = { ...diagnostics, phaseDetection: getPhaseDiagnostics(phaseDetection), skippedIssueCategories: getSkippedIssueCategories({}), reason: failureReason };
    logAnalysisStats(failureDiagnostics);
    return {
      issues: [],
      recordingQualityNotes: addCalibrationQualityNotes([makeRecordingNote('too_few_usable_frames')], calibration),
      measurements: createSwingMeasurements({}, null, calibration, calibrationSetup),
      calibration,
      summary: 'The recording quality was too limited for reliable swing feedback. Please record again before using the swing notes.',
      diagnostics: failureDiagnostics,
      fullFailure: true,
    };
  }

  const swingAnalysisFrameIndexes = new Set(getSwingAnalysisFrames(phaseDetection.frames).map((frame) => frame.frameIndex));
  const setupFrameIndexes = new Set(getSetupFrames(phaseDetection.frames).map((frame) => frame.frameIndex));
  const swingMotionFrameIndexes = new Set(getSwingMotionFrames(phaseDetection.frames).map((frame) => frame.frameIndex));
  const finishFrameIndexes = new Set(getFinishFrames(phaseDetection.frames).map((frame) => frame.frameIndex));
  const swingAnalysisMetrics = metrics.filter((metric) => swingAnalysisFrameIndexes.has(metric.frameIndex));
  const stableBodyScale = getStableBodyScale(swingAnalysisMetrics.length ? swingAnalysisMetrics : metrics);
  const calculationDiagnostics = {
    stableBodyScale: stableBodyScale.scale,
    stableBodyScaleSource: stableBodyScale.source,
    scaleUnstable: stableBodyScale.scaleUnstable,
    clampedOrDiscarded: stableBodyScale.clampedToMinimum ? ['body-scale-clamped-to-safe-minimum'] : [],
  };
  const outlierReport = getOutlierReport(swingAnalysisMetrics.length ? swingAnalysisMetrics : metrics, stableBodyScale);
  const stableMetrics = filterOutlierMetrics(swingAnalysisMetrics.length ? swingAnalysisMetrics : metrics, outlierReport);
  const setupMetrics = stableMetrics.filter((metric) => setupFrameIndexes.has(metric.frameIndex));
  const swingMotionMetrics = stableMetrics.filter((metric) => swingMotionFrameIndexes.has(metric.frameIndex));
  const finishPhaseMetrics = stableMetrics.filter((metric) => finishFrameIndexes.has(metric.frameIndex));
  const motionAndFinishMetrics = [...swingMotionMetrics, ...finishPhaseMetrics];
  const headMovementMetrics = motionAndFinishMetrics.filter((metric) => metric.head);
  const shoulderOnlyPostureMetrics = stableMetrics.filter((metric) => metric.shoulderCenter && metric.shoulderWidth > 0);
  const postureMetrics = motionAndFinishMetrics.filter((metric) => metric.shoulderCenter || metric.hipCenter || metric.head);
  const hipMetrics = motionAndFinishMetrics.filter((metric) => metric.hipCenter);
  const leftLeadArmMetrics = swingMotionMetrics.filter((metric) => Number.isFinite(metric.leftArmAngle));
  const rightLeadArmMetrics = swingMotionMetrics.filter((metric) => Number.isFinite(metric.rightArmAngle));
  const leadArmSide = rightLeadArmMetrics.length > leftLeadArmMetrics.length ? 'right' : 'left';
  const leadArmMetrics = leadArmSide === 'right' ? rightLeadArmMetrics : leftLeadArmMetrics;
  const finishBalanceMetrics = (finishPhaseMetrics.length ? finishPhaseMetrics : motionAndFinishMetrics).filter((metric) => metric.hipCenter && metric.kneeCenter && (metric.footCenter || metric.ankleCenter));
  const shoulderTurnMetrics = swingMotionMetrics.filter((metric) => metric.shoulderCenter && metric.shoulderWidth > 0);
  const analyzability = {
    headMovement: makeAnalyzability(headMovementMetrics, 'No reliable head or face landmark was visible often enough.'),
    posture: makeAnalyzability(postureMetrics, 'Shoulders or hips were not visible often enough.'),
    hipSway: makeAnalyzability(hipMetrics, 'Hips were not clearly visible often enough.'),
    shoulderTurn: makeAnalyzability(shoulderTurnMetrics, 'Both shoulders were not visible often enough.'),
    leadArm: makeAnalyzability(leadArmMetrics, 'A shoulder, elbow, and wrist on the same arm were not visible often enough.'),
    finishBalance: makeAnalyzability(finishBalanceMetrics, 'Hips, knees, and ankles or feet were not visible often enough.'),
  };
  const skippedIssueCategories = getSkippedIssueCategories(analyzability);
  const recordingQualityNotes = addCalibrationQualityNotes(
    phaseDetection.uncertain
      ? [...getRecordingQualityNotes(metrics, diagnostics, analyzability, outlierReport, stableBodyScale), makeRecordingNote('phase_detection_uncertain')]
      : getRecordingQualityNotes(metrics, diagnostics, analyzability, outlierReport, stableBodyScale),
    calibration,
  );
  const detectedIssues = [];

  let maxHeadMove = null;
  let percentileHeadMove = null;
  if (analyzability.headMovement.analyzable) {
    const setupHead = midpointOfPoints(setupMetrics.map((metric) => metric.head).filter(Boolean));
    const headScale = stableBodyScale.scale;
    const headMovementValues = headMovementMetrics.map((metric) => (metric.head && setupHead ? distance(metric.head, setupHead) / headScale : null));
    const sanitizedHeadMove = getSanitizedRatio(headMovementValues, MOVEMENT_PERCENTILE, 0.8, 1.2, 'head-movement', calculationDiagnostics);
    maxHeadMove = sanitizedHeadMove.rawMax;
    percentileHeadMove = sanitizedHeadMove.used;
    if (Number.isFinite(percentileHeadMove) && percentileHeadMove > 0.12) {
      const level = movementLevel(percentileHeadMove, 0.12, 0.22, 0.35);
      detectedIssues.push(
        makeIssue(
          'excessive_head_movement',
          severityFromThresholds(percentileHeadMove, 0.12, 0.22, 0.35),
          clampConfidence((percentileHeadMove - 0.08) / 0.35),
          `Estimated head movement: ${level}. Your head moved noticeably from its setup position.`,
        ),
      );
    }
  }

  let rawMaxPostureRise = null;
  let postureRise = null;
  let postureDiagnostics = { reason: 'not-run' };
  if (analyzability.posture.analyzable) {
    const postureResult = analyzePostureChange(setupMetrics, postureMetrics, stableBodyScale.scale, calculationDiagnostics);
    postureDiagnostics = postureResult.diagnostics;
    rawMaxPostureRise = postureResult.rawMaxChange;
    postureRise = postureResult.score;
    if (Number.isFinite(postureRise) && postureRise >= 0.08) {
      const level = movementLevel(postureRise, 0.08, 0.15, 0.25);
      detectedIssues.push(
        makeIssue(
          'posture_loss',
          severityFromThresholds(postureRise, 0.08, 0.15, 0.25),
          clampConfidence((postureRise - 0.05) / 0.28),
          `Estimated posture change: ${level}. ${getPostureFeedbackSentence(postureDiagnostics.changeType)}`,
        ),
      );
    }
  } else {
    postureDiagnostics = { reason: analyzability.posture.skippedReason };
  }

  let minLeadArmAngle = null;
  let percentileLeadArmAngle = null;
  if (analyzability.leadArm.analyzable) {
    const leadArmWindows = getWindows(leadArmMetrics);
    const leadArmAngles = leadArmWindows.backswing.map((metric) => (leadArmSide === 'right' ? metric.rightArmAngle : metric.leftArmAngle));
    const sanitizedLeadArmAngle = getSanitizedLeadArmAngle(leadArmAngles, calculationDiagnostics);
    minLeadArmAngle = sanitizedLeadArmAngle.rawMin;
    percentileLeadArmAngle = sanitizedLeadArmAngle.used;
    if (Number.isFinite(percentileLeadArmAngle) && percentileLeadArmAngle < 155) {
      detectedIssues.push(
        makeIssue(
          'lead_arm_collapse',
          severityFromThresholds(180 - percentileLeadArmAngle, 25, 40, 60),
          clampConfidence((155 - percentileLeadArmAngle) / 50),
          `Estimated lead arm angle: about ${Math.round(percentileLeadArmAngle)}°. Your lead arm appeared to bend near the top of the backswing.`,
        ),
      );
    }
  }

  let maxHipSway = null;
  let percentileHipSway = null;
  if (analyzability.hipSway.analyzable) {
    const hipWindows = getWindows(hipMetrics);
    const setupHip = midpointOfPoints(hipWindows.setup.map((metric) => metric.hipCenter));
    const hipScale = stableBodyScale.scale;
    const hipSwayValues = hipMetrics.map((metric) => (metric.hipCenter && setupHip ? Math.abs(metric.hipCenter.x - setupHip.x) / hipScale : null));
    const sanitizedHipSway = getSanitizedRatio(hipSwayValues, MOVEMENT_PERCENTILE, 0.8, 1.2, 'hip-sway', calculationDiagnostics);
    maxHipSway = sanitizedHipSway.rawMax;
    percentileHipSway = sanitizedHipSway.used;
    if (Number.isFinite(percentileHipSway) && percentileHipSway > 0.12) {
      const level = movementLevel(percentileHipSway, 0.12, 0.22, 0.35);
      detectedIssues.push(
        makeIssue(
          'hip_sway',
          severityFromThresholds(percentileHipSway, 0.12, 0.22, 0.35),
          clampConfidence((percentileHipSway - 0.08) / 0.35),
          `Estimated hip sway: ${level}. Your hip center shifted sideways from setup.`,
        ),
      );
    }
  }

  let finishDrift = null;
  if (analyzability.finishBalance.analyzable) {
    const finishWindows = getWindows(finishBalanceMetrics);
    const finishSetupScale = stableBodyScale.scale;
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
    const shoulderTurnSetupWidth = median(shoulderWindows.setup.map((metric) => metric.shoulderWidth)) || stableBodyScale.scale;
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
  const movementMeasurements = {
    headMovement: { ratio: percentileHeadMove, normalizedDistance: multiplyFinite(percentileHeadMove, stableBodyScale.scale), analyzability: analyzability.headMovement },
    postureRise: { ratio: postureRise, normalizedDistance: multiplyFinite(postureRise, stableBodyScale.scale), analyzability: analyzability.posture },
    hipSway: { ratio: percentileHipSway, normalizedDistance: multiplyFinite(percentileHipSway, stableBodyScale.scale), analyzability: analyzability.hipSway },
  };
  const measurements = createSwingMeasurements(movementMeasurements, stableBodyScale, calibration, calibrationSetup);

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
    stableBodyScale,
    outlierFramesRemoved: outlierReport.removedFrameCount,
    outlierReasons: Object.fromEntries([...outlierReport.reasonsByIndex.entries()]),
    analyzability,
    analyzedIssueCategories,
    skippedIssueCategories,
    rawMaxHeadMove: maxHeadMove,
    percentileHeadMove,
    rawMaxPostureRise,
    percentilePostureRise: postureRise,
    postureChangeScore: postureRise,
    postureDiagnostics,
    rawMinLeadArmAngle: minLeadArmAngle,
    percentileLeadArmAngle,
    rawMaxHipSway: maxHipSway,
    percentileHipSway,
    finishDrift,
    shoulderTurnRatio,
    phaseDetection: getPhaseDiagnostics(phaseDetection),
    clampedOrDiscarded: calculationDiagnostics.clampedOrDiscarded,
    reason: 'passed-with-visible-pose-data',
  };
  logAnalysisStats(finalDiagnostics);

  return {
    issues: topIssues,
    recordingQualityNotes,
    calibration,
    measurements,
    summary: topIssues.length
      ? 'Here are the top swing patterns detected from your visible body movement.'
      : 'No major beginner swing issue was detected from the visible movement in this recording.',
    diagnostics: finalDiagnostics,
    fullFailure: false,
  };
}

function buildCalibrationResult(calibrationSetup, phaseDetection, poseTimeline, videoStats) {
  if (!calibrationSetup?.enabled) {
    return {
      enabled: false,
      status: 'skipped',
      inputHeightCm: null,
      scaleCmPerNormalizedUnit: null,
      message: 'Height calibration was skipped; body-relative measurements are shown.',
    };
  }

  const calibrationFrames = getCalibrationFrames(phaseDetection.frames);
  return estimateCalibrationScale({
    inputHeightCm: calibrationSetup.inputHeightCm,
    poseTimeline: calibrationFrames,
    videoDimensions: videoStats.videoDimensions ?? null,
  });
}

function createSwingMeasurements(movementMeasurements, stableBodyScale, calibration, calibrationSetup = {}) {
  const preferredUnit = calibrationSetup.preferredUnit || 'in';
  const realWorldAllowed = calibration?.enabled && ['good', 'fair'].includes(calibration.status);
  const limitedCalibration = calibration?.enabled && calibration.status === 'limited';
  const entries = [
    { id: 'head_movement', label: 'Estimated head movement', metric: movementMeasurements.headMovement },
    { id: 'posture_rise', label: 'Estimated posture change', metric: movementMeasurements.postureRise },
    { id: 'hip_sway', label: 'Estimated hip sway', metric: movementMeasurements.hipSway },
  ];

  return entries.map((entry) => {
    const reliability = getMeasurementReliability(entry.metric, calibration);
    const bodyRelativeValue = formatBodyRelative(entry.metric?.ratio);
    return {
      id: entry.id,
      label: entry.label,
      value: realWorldAllowed
        ? formatRealWorldMeasurement(entry.metric?.normalizedDistance, calibration, preferredUnit)
        : limitedCalibration
          ? formatLimitedRealWorldRange(entry.metric?.normalizedDistance, calibration, preferredUnit)
          : bodyRelativeValue,
      bodyRelativeValue,
      reliability,
    };
  });
}

function getMeasurementReliability(metric, calibration) {
  if (!metric?.analyzability?.analyzable || !Number.isFinite(metric?.ratio)) return 'Poor';
  if (calibration?.status === 'good') return 'Good';
  if (calibration?.status === 'fair' || calibration?.status === 'limited') return 'Fair';
  return 'Fair';
}

function formatBodyRelative(ratio) {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1.2) return 'Not enough reliable data';
  return `${ratio.toFixed(2)} body-widths`;
}

function formatRealWorldMeasurement(normalizedDistance, calibration, preferredUnit) {
  const converted = convertNormalizedDistanceToRealWorld(normalizedDistance, calibration, preferredUnit);
  return converted ? converted.label : 'Not enough reliable data';
}

function formatLimitedRealWorldRange(normalizedDistance, calibration, preferredUnit) {
  const converted = convertNormalizedDistanceToRealWorld(normalizedDistance, calibration, preferredUnit);
  if (!converted) return 'Not enough reliable data';
  const value = converted.value;
  const unitLabel = preferredUnit === 'cm' ? 'cm' : 'inches';
  const lowThreshold = preferredUnit === 'cm' ? 7.5 : 3;
  const highThreshold = preferredUnit === 'cm' ? 15 : 6;
  if (value < lowThreshold) return `less than ${Math.round(lowThreshold)} ${unitLabel}`;
  if (value > highThreshold) return `more than ${Math.round(highThreshold)} ${unitLabel}`;
  const roundedLow = Math.max(0, Math.round((value * 0.75) / 2) * 2);
  const roundedHigh = Math.max(roundedLow + 2, Math.round((value * 1.25) / 2) * 2);
  return `about ${roundedLow}–${roundedHigh} ${unitLabel}`;
}

function multiplyFinite(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) ? a * b : null;
}


function analyzePostureChange(setupMetrics, swingMetrics, postureScale, calculationDiagnostics) {
  const setupBaseline = getPostureBaseline(setupMetrics);
  if (!setupBaseline || !Number.isFinite(postureScale) || postureScale <= 0) {
    return { score: null, rawMaxChange: null, diagnostics: { reason: 'not enough setup posture landmarks' } };
  }

  const samples = swingMetrics.map((metric) => getPostureChangeSample(metric, setupBaseline, postureScale)).filter(Boolean);
  if (samples.length < MIN_CATEGORY_FRAMES) {
    return { score: null, rawMaxChange: null, diagnostics: { reason: 'not enough swing posture landmarks', setupBaseline } };
  }

  const confirmedSamples = samples.filter((sample, index) => {
    const nearby = samples.slice(Math.max(0, index - 1), Math.min(samples.length, index + 2));
    return nearby.filter((candidate) => candidate.score >= sample.score * 0.75).length >= 2;
  });
  const scoredSamples = confirmedSamples.length >= 3 ? confirmedSamples : samples;
  const rawMaxChange = max(samples.map((sample) => sample.score));
  const percentileChange = percentile(scoredSamples.map((sample) => sample.score), 90);
  const score = Number.isFinite(percentileChange) ? Math.min(0.9, percentileChange) : null;
  if (Number.isFinite(score) && score > 0.7 && !hasConsecutiveValues(samples.map((sample) => sample.score), (value) => value > 0.7, 3)) {
    calculationDiagnostics.clampedOrDiscarded.push('posture-change-discarded-tracking-spike');
    return { score: null, rawMaxChange, diagnostics: { reason: 'posture change looked like a tracking spike', setupBaseline, rawMaxChange } };
  }

  const changeType = getPostureChangeType(scoredSamples, setupBaseline);
  return {
    score,
    rawMaxChange,
    diagnostics: {
      reason: Number.isFinite(score) ? 'analyzed' : 'not enough robust posture samples',
      setupBaseline,
      rawMaxChange,
      percentileChange: score,
      shoulderVerticalChange90: percentile(scoredSamples.map((sample) => sample.shoulderVerticalAbs), 90),
      hipVerticalChange90: percentile(scoredSamples.map((sample) => sample.hipVerticalAbs), 90),
      torsoLengthChange90: percentile(scoredSamples.map((sample) => sample.torsoLengthChange), 90),
      torsoAngleChange90: percentile(scoredSamples.map((sample) => sample.torsoAngleChange), 90),
      headToHipChange90: percentile(scoredSamples.map((sample) => sample.headToHipChange), 90),
      changeType,
    },
  };
}

function getPostureBaseline(setupMetrics) {
  const baseline = {
    shoulderY: median(setupMetrics.map((metric) => metric.shoulderCenter?.y)),
    hipY: median(setupMetrics.map((metric) => metric.hipCenter?.y)),
    torsoLength: median(setupMetrics.map((metric) => distance(metric.shoulderCenter, metric.hipCenter)).filter((value) => value > 0)),
    torsoAngle: median(setupMetrics.map(getTorsoAngle).filter(Number.isFinite)),
    headToHipDistance: median(setupMetrics.map((metric) => Math.abs((metric.head?.y ?? NaN) - (metric.hipCenter?.y ?? NaN))).filter(Number.isFinite)),
    shoulderHipSeparation: median(setupMetrics.map((metric) => Math.abs((metric.shoulderCenter?.x ?? NaN) - (metric.hipCenter?.x ?? NaN))).filter(Number.isFinite)),
  };
  const visibleSignals = [baseline.shoulderY, baseline.hipY, baseline.torsoLength, baseline.torsoAngle, baseline.headToHipDistance].filter(Number.isFinite).length;
  return visibleSignals >= 2 ? baseline : null;
}

function getPostureChangeSample(metric, setup, scale) {
  const shoulderDelta = Number.isFinite(setup.shoulderY) && metric.shoulderCenter ? (metric.shoulderCenter.y - setup.shoulderY) / scale : null;
  const hipDelta = Number.isFinite(setup.hipY) && metric.hipCenter ? (metric.hipCenter.y - setup.hipY) / scale : null;
  const torsoLength = distance(metric.shoulderCenter, metric.hipCenter);
  const torsoLengthChange = Number.isFinite(setup.torsoLength) && torsoLength > 0 ? Math.abs(torsoLength - setup.torsoLength) / scale : null;
  const torsoAngle = getTorsoAngle(metric);
  const torsoAngleChange = Number.isFinite(setup.torsoAngle) && Number.isFinite(torsoAngle) ? Math.abs(torsoAngle - setup.torsoAngle) / 90 : null;
  const headToHipDistance = metric.head && metric.hipCenter ? Math.abs(metric.head.y - metric.hipCenter.y) : null;
  const headToHipChange = Number.isFinite(setup.headToHipDistance) && Number.isFinite(headToHipDistance) ? Math.abs(headToHipDistance - setup.headToHipDistance) / scale : null;
  const separation = metric.shoulderCenter && metric.hipCenter ? Math.abs(metric.shoulderCenter.x - metric.hipCenter.x) : null;
  const separationChange = Number.isFinite(setup.shoulderHipSeparation) && Number.isFinite(separation) ? Math.abs(separation - setup.shoulderHipSeparation) / scale : null;

  const components = [
    Math.abs(shoulderDelta ?? NaN) * 0.95,
    Math.abs(hipDelta ?? NaN) * 0.65,
    (torsoLengthChange ?? NaN) * 0.9,
    (torsoAngleChange ?? NaN) * 0.75,
    (headToHipChange ?? NaN) * 0.8,
    (separationChange ?? NaN) * 0.45,
  ].filter(Number.isFinite);
  if (components.length < 2) return null;
  return {
    score: components.reduce((sum, value) => sum + value, 0) / Math.max(1.8, components.length * 0.75),
    shoulderDelta,
    hipDelta,
    shoulderVerticalAbs: Math.abs(shoulderDelta ?? NaN),
    hipVerticalAbs: Math.abs(hipDelta ?? NaN),
    torsoLengthChange,
    torsoAngleChange,
    headToHipChange,
    separationChange,
  };
}

function getTorsoAngle(metric) {
  if (!metric?.shoulderCenter || !metric?.hipCenter) return null;
  return (Math.atan2(metric.shoulderCenter.y - metric.hipCenter.y, metric.shoulderCenter.x - metric.hipCenter.x) * 180) / Math.PI;
}

function getPostureChangeType(samples) {
  const shoulderDelta90 = percentile(samples.map((sample) => sample.shoulderDelta).filter(Number.isFinite), 90);
  const shoulderDrop10 = percentile(samples.map((sample) => sample.shoulderDelta).filter(Number.isFinite), 10);
  const torsoAngle90 = percentile(samples.map((sample) => sample.torsoAngleChange), 90) || 0;
  const torsoLength90 = percentile(samples.map((sample) => sample.torsoLengthChange), 90) || 0;
  const headHip90 = percentile(samples.map((sample) => sample.headToHipChange), 90) || 0;

  if (torsoAngle90 >= 0.15 || torsoLength90 >= 0.18 || headHip90 >= 0.18) return 'torso-angle';
  if (Number.isFinite(shoulderDelta90) && shoulderDelta90 >= 0.1) return 'drop';
  if (Number.isFinite(shoulderDrop10) && shoulderDrop10 <= -0.1) return 'rise';
  return 'general';
}

function getPostureFeedbackSentence(changeType) {
  if (changeType === 'rise') return 'Your upper body rose compared with setup.';
  if (changeType === 'drop') return 'Your upper body dropped or collapsed compared with setup.';
  if (changeType === 'torso-angle') return 'Your torso angle changed significantly during the swing.';
  return 'Your posture changed significantly during the swing.';
}

function getPhaseDiagnostics(phaseDetection) {
  return {
    totalFrames: phaseDetection.frames?.length ?? 0,
    calibrationFrameRange: phaseDetection.ranges?.calibration,
    ignoredPreRecordFrameRange: phaseDetection.ranges?.preRecordNoise,
    transitionFrameRange: phaseDetection.ranges?.transition,
    setupFrameRange: phaseDetection.ranges?.setup,
    swingFrameRange: phaseDetection.ranges?.swing,
    finishFrameRange: phaseDetection.ranges?.finish,
    swingStartFrame: phaseDetection.swingStartFrame,
    swingStartTimeMs: phaseDetection.swingStartTimeMs,
    swingEndFrame: phaseDetection.swingEndFrame,
    swingEndTimeMs: phaseDetection.swingEndTimeMs,
    calibrationFramesExcluded: phaseDetection.calibrationFramesExcluded,
    uncertain: phaseDetection.uncertain,
  };
}

function addCalibrationQualityNotes(notes, calibration) {
  if (!calibration?.enabled) return notes;
  if (calibration.status === 'failed') {
    return [
      ...notes,
      {
        code: 'height_calibration_failed',
        message: 'Height calibration could not be completed because the app could not clearly read your standing position. Swing feedback was still generated from visible movement.',
      },
    ];
  }
  if (calibration.status === 'limited') {
    return [
      ...notes,
      { code: 'height_calibration_limited', message: 'Height calibration was limited, so measurements are approximate ranges.' },
    ];
  }
  return notes;
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

function getStableBodyScale(metrics) {
  const setupMetrics = getWindows(metrics).setup;
  const setupScale = getScaleFromCandidates(setupMetrics, 'setup');
  const fallbackScale = getScaleFromCandidates(metrics, 'all-frames');
  const selected = setupScale.value ? setupScale : fallbackScale;
  const unclampedScale = selected.value || MIN_STABLE_BODY_SCALE;
  const scale = Math.max(MIN_STABLE_BODY_SCALE, unclampedScale);
  const allFrameScale = fallbackScale.value || scale;
  const setupToAllDifference = selected.value && allFrameScale ? Math.abs(selected.value - allFrameScale) / Math.max(selected.value, allFrameScale) : 0;

  return {
    scale,
    unclampedScale,
    source: selected.source || 'minimum-safe-scale',
    usedSetupFrames: selected.frameSet === 'setup',
    clampedToMinimum: scale !== unclampedScale,
    scaleUnstable: setupToAllDifference > 0.35 || setupScale.unstable || fallbackScale.unstable || scale !== unclampedScale,
    setupMedianShoulderWidth: setupScale.shoulderMedian,
    setupMedianHipWidth: setupScale.hipMedian,
    setupMedianBodyBounds: setupScale.boundsMedian,
    allFrameMedianScale: allFrameScale,
  };
}

function getScaleFromCandidates(metrics, frameSet) {
  const shoulderValues = cleanScaleValues(metrics.map((metric) => metric.shoulderWidth));
  const hipValues = cleanScaleValues(metrics.map((metric) => metric.hipWidth));
  const boundsValues = cleanScaleValues(metrics.map((metric) => getBodyBoundsScale(metric.bounds)));
  const stanceValues = cleanScaleValues(metrics.map((metric) => metric.stanceWidth));
  const candidates = [
    { source: `${frameSet}-shoulder-width`, values: shoulderValues, value: median(shoulderValues) },
    { source: `${frameSet}-hip-width`, values: hipValues, value: median(hipValues) },
    { source: `${frameSet}-visible-body-bounds`, values: boundsValues, value: median(boundsValues) },
    { source: `${frameSet}-stance-width`, values: stanceValues, value: median(stanceValues) },
  ];
  const selected = candidates.find((candidate) => Number.isFinite(candidate.value));

  return {
    frameSet,
    source: selected?.source,
    value: selected?.value ?? null,
    shoulderMedian: median(shoulderValues),
    hipMedian: median(hipValues),
    boundsMedian: median(boundsValues),
    unstable: candidates.some((candidate) => isScaleSeriesUnstable(candidate.values)),
  };
}

function cleanScaleValues(values) {
  return values.filter((value) => Number.isFinite(value) && value >= 0.04 && value <= 0.9);
}

function getBodyBoundsScale(bounds) {
  if (!bounds) return null;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return Math.max(width, height * 0.35);
}

function isScaleSeriesUnstable(values) {
  if (values.length < 5) return false;
  const middle = median(values);
  if (!middle) return false;
  const spread = percentile(values, 90) - percentile(values, 10);
  return spread / middle > 0.45;
}

function getMovementScale(metrics) {
  return getStableBodyScale(metrics).scale;
}

function getAverageBoundsWidth(metrics) {
  return average(metrics.map((metric) => getBodyBoundsScale(metric.bounds)).filter((value) => value > 0));
}


function getOutlierReport(metrics, stableScaleDiagnostics) {
  const setupMetrics = getWindows(metrics).setup;
  const setupShoulderWidth = median(cleanScaleValues(setupMetrics.map((metric) => metric.shoulderWidth)));
  const setupHipWidth = median(cleanScaleValues(setupMetrics.map((metric) => metric.hipWidth)));
  const badIndexes = new Set();
  const reasonsByIndex = new Map();
  let previousHead = null;

  metrics.forEach((metric, index) => {
    const frameKey = Number.isFinite(metric.frameIndex) ? metric.frameIndex : index;
    const reasons = [];
    if (setupShoulderWidth && metric.shoulderWidth && Math.abs(metric.shoulderWidth - setupShoulderWidth) / setupShoulderWidth > OUTLIER_WIDTH_CHANGE_LIMIT) {
      reasons.push('shoulder-width-jump');
    }
    if (setupHipWidth && metric.hipWidth && Math.abs(metric.hipWidth - setupHipWidth) / setupHipWidth > OUTLIER_WIDTH_CHANGE_LIMIT) {
      reasons.push('hip-width-jump');
    }
    if (metric.head && previousHead) {
      const headJump = distance(metric.head, previousHead);
      if (headJump > Math.max(0.25, stableScaleDiagnostics.scale * 1.15)) {
        reasons.push('head-position-jump');
      }
    }
    if (metric.bounds && !areLandmarksWithinLooseBounds(metric.visiblePoints)) {
      reasons.push('landmark-outside-normalized-range');
    }
    if (metric.visibleRequiredRatio < 0.35) {
      reasons.push('low-key-landmark-visibility');
    }

    if (reasons.length) {
      badIndexes.add(frameKey);
      reasonsByIndex.set(frameKey, reasons);
    } else if (metric.head) {
      previousHead = metric.head;
    }
  });

  return {
    badIndexes,
    reasonsByIndex,
    removedFrameCount: badIndexes.size,
    setupShoulderWidth,
    setupHipWidth,
  };
}

function filterOutlierMetrics(metrics, outlierReport, requiredPredicate = () => true) {
  return metrics.filter((metric) => requiredPredicate(metric) && !outlierReport.badIndexes.has(metric.frameIndex));
}

function areLandmarksWithinLooseBounds(points = []) {
  return points.every((landmark) => landmark.x >= -0.2 && landmark.x <= 1.2 && landmark.y >= -0.2 && landmark.y <= 1.2);
}

function getSanitizedRatio(rawValues, percentileRank, cap, trackingErrorLimit, diagnosticsKey, calculationDiagnostics) {
  const rawMax = max(rawValues);
  let used = percentile(rawValues, percentileRank);
  const clampedOrDiscarded = [];

  if (Number.isFinite(used) && used > trackingErrorLimit && !hasConsecutiveValues(rawValues, (value) => value > trackingErrorLimit, 3)) {
    clampedOrDiscarded.push(`${diagnosticsKey}-discarded-tracking-spike`);
    used = null;
  }

  if (Number.isFinite(used) && used > cap) {
    clampedOrDiscarded.push(`${diagnosticsKey}-clamped-to-${cap}`);
    used = cap;
  }

  calculationDiagnostics.clampedOrDiscarded.push(...clampedOrDiscarded);
  return { rawMax, used };
}

function getSanitizedLeadArmAngle(rawAngles, calculationDiagnostics) {
  const rawMin = min(rawAngles);
  let used = percentile(rawAngles, ARM_COLLAPSE_PERCENTILE);

  if (Number.isFinite(used) && used < 60 && !hasConsecutiveValues(rawAngles, (value) => value < 60, 3)) {
    calculationDiagnostics.clampedOrDiscarded.push('lead-arm-angle-discarded-unconfirmed-tracking-spike');
    used = null;
  }

  if (Number.isFinite(used) && used < 45 && !hasConsecutiveValues(rawAngles, (value) => value < 45, 3)) {
    calculationDiagnostics.clampedOrDiscarded.push('lead-arm-angle-discarded-tracking-spike');
    used = null;
  }

  if (Number.isFinite(used) && used < 60) {
    calculationDiagnostics.clampedOrDiscarded.push('lead-arm-angle-clamped-to-60');
    used = 60;
  }
  if (Number.isFinite(used) && used > 180) {
    calculationDiagnostics.clampedOrDiscarded.push('lead-arm-angle-clamped-to-180');
    used = 180;
  }

  return { rawMin, used };
}

function hasConsecutiveValues(values, predicate, requiredRun) {
  let run = 0;
  for (const value of values) {
    if (Number.isFinite(value) && predicate(value)) {
      run += 1;
      if (run >= requiredRun) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

function movementLevel(value, lowThreshold, mediumThreshold, highThreshold) {
  if (value >= highThreshold) return 'high';
  if (value >= mediumThreshold) return 'moderate';
  if (value >= lowThreshold) return 'low';
  return 'low';
}

function getRecordingQualityNotes(metrics, diagnostics, analyzability, outlierReport, stableBodyScale) {
  const notes = [];
  const averageVisibility = average(metrics.map((metric) => metric.visibleRequiredRatio)) || 0;
  const inFrameRatio = average(metrics.map((metric) => (isComfortablyInFrame(metric.bounds) ? 1 : 0))) || 0;
  const tooCloseRatio = average(metrics.map((metric) => (looksTooClose(metric.bounds) ? 1 : 0))) || 0;
  const shakeScore = getCameraShakeScore(metrics.filter((metric) => metric.shoulderCenter || metric.hipCenter || metric.ankleCenter || metric.footCenter));
  const skippedSomeAnalyses = Object.values(analyzability).some((value) => !value.analyzable);

  if (outlierReport?.removedFrameCount > 0) {
    notes.push(makeRecordingNote('unstable_tracking_points'));
  }

  if (stableBodyScale?.scaleUnstable) {
    notes.push(makeRecordingNote('unstable_movement_scale'));
  }

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
    stableBodyScale: diagnostics.stableBodyScale?.scale,
    stableBodyScaleSource: diagnostics.stableBodyScale?.source,
    scaleUnstable: diagnostics.stableBodyScale?.scaleUnstable,
    outlierFramesRemoved: diagnostics.outlierFramesRemoved,
    rawMaxHeadMovement: diagnostics.rawMaxHeadMove,
    percentileHeadMovementUsed: diagnostics.percentileHeadMove,
    rawMaxPostureRise: diagnostics.rawMaxPostureRise,
    percentilePostureRiseUsed: diagnostics.percentilePostureRise,
    postureSetupBaseline: diagnostics.postureDiagnostics?.setupBaseline,
    postureMaxChange: diagnostics.postureDiagnostics?.rawMaxChange,
    posturePercentileChange: diagnostics.postureDiagnostics?.percentileChange,
    postureChangeType: diagnostics.postureDiagnostics?.changeType,
    postureNotAnalyzableReason: diagnostics.postureDiagnostics?.reason,
    rawMinimumArmAngle: diagnostics.rawMinLeadArmAngle,
    percentileArmAngleUsed: diagnostics.percentileLeadArmAngle,
    clampedOrDiscarded: diagnostics.clampedOrDiscarded,
    phaseDetection: diagnostics.phaseDetection,
    calibrationFramesExcludedFromSwingAnalysis: diagnostics.phaseDetection?.calibrationFramesExcluded,
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
