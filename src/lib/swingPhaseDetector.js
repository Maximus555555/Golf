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
};

const MIN_VISIBILITY = 0.45;
const CALIBRATION_MS = 1800;
const TRANSITION_MS = 500;
const NO_CALIBRATION_BUFFER_MS = 750;
const MIN_CONSECUTIVE_MOTION_FRAMES = 2;
const MOTION_LANDMARKS = [
  LANDMARK.leftWrist,
  LANDMARK.rightWrist,
  LANDMARK.leftElbow,
  LANDMARK.rightElbow,
  LANDMARK.leftShoulder,
  LANDMARK.rightShoulder,
  LANDMARK.leftHip,
  LANDMARK.rightHip,
  LANDMARK.nose,
  LANDMARK.leftEar,
  LANDMARK.rightEar,
];

export function classifySwingFrames(poseTimeline = [], videoStats = {}, calibrationSetup = {}) {
  const frames = poseTimeline.map((frame, index) => ({ ...frame, frameIndex: index, phase: 'pre_record_noise' }));
  const totalFrames = frames.length;
  const timing = getTimingInfo(frames, videoStats);
  const calibrationEnabled = Boolean(calibrationSetup?.enabled);
  const calibrationCutoff = calibrationEnabled ? boundaryIndexForElapsedMs(frames, timing, CALIBRATION_MS) : -1;
  const transitionCutoff = calibrationEnabled
    ? boundaryIndexForElapsedMs(frames, timing, CALIBRATION_MS + TRANSITION_MS)
    : boundaryIndexForElapsedMs(frames, timing, NO_CALIBRATION_BUFFER_MS);

  frames.forEach((frame, index) => {
    if (calibrationEnabled && index <= calibrationCutoff) frame.phase = 'calibration';
    else if (index <= transitionCutoff) frame.phase = 'pre_record_noise';
  });

  const firstAnalysisCandidate = Math.min(totalFrames, Math.max(0, transitionCutoff + 1));
  const movementScores = getMovementScores(frames, timing);
  const motionThreshold = getMotionThreshold(movementScores.slice(firstAnalysisCandidate));
  const swingStartFrame = findSwingStartFrame(movementScores, firstAnalysisCandidate, motionThreshold);
  const setupRange = getSetupRange(frames, movementScores, firstAnalysisCandidate, swingStartFrame);
  const swingEndFrame = findSwingEndFrame(movementScores, swingStartFrame, motionThreshold, totalFrames);
  const finishStartFrame = Number.isFinite(swingEndFrame)
    ? Math.min(totalFrames, Math.max(swingStartFrame + 1, swingEndFrame + 1))
    : totalFrames;

  frames.forEach((frame, index) => {
    if (frame.phase === 'calibration' || index <= transitionCutoff) return;
    if (index >= setupRange.start && index <= setupRange.end) frame.phase = 'setup';
    else if (index >= swingStartFrame && index < finishStartFrame) frame.phase = 'swing';
    else if (index >= finishStartFrame) frame.phase = 'finish';
    else frame.phase = 'setup';
  });

  const ranges = {
    preRecordNoise: getPhaseRange(frames, 'pre_record_noise'),
    calibration: getPhaseRange(frames, 'calibration'),
    transition: calibrationEnabled ? indexRange(calibrationCutoff + 1, transitionCutoff, totalFrames) : getPhaseRange(frames, 'pre_record_noise'),
    setup: getPhaseRange(frames, 'setup'),
    swing: getPhaseRange(frames, 'swing'),
    finish: getPhaseRange(frames, 'finish'),
  };
  const uncertain = !Number.isFinite(swingStartFrame) || getSwingMotionFrames(frames).length < 3 || getSetupFrames(frames).length < 2;

  return {
    frames,
    ranges,
    timing,
    calibrationEnabled,
    calibrationFramesExcluded: calibrationEnabled && getCalibrationFrames(frames).every((frame) => !['setup', 'swing', 'finish'].includes(frame.phase)),
    swingStartFrame: Number.isFinite(swingStartFrame) ? swingStartFrame : null,
    swingStartTimeMs: getFrameTimeMs(frames[swingStartFrame], timing),
    swingEndFrame: Number.isFinite(swingEndFrame) ? swingEndFrame : null,
    swingEndTimeMs: getFrameTimeMs(frames[swingEndFrame], timing),
    motionThreshold,
    movementScores,
    uncertain,
  };
}


export function detectSwingPhases(poseTimeline = [], options = {}) {
  const classified = classifySwingFrames(poseTimeline, options.videoStats || {}, options.calibrationSetup || {});
  const frames = classified.frames;
  const notes = [];
  const minStartIndex = boundaryIndexForElapsedMs(frames, classified.timing, 650) + 1;
  const movementScores = getMovementScores(frames, classified.timing);
  const threshold = getMotionThreshold(movementScores.slice(Math.max(0, minStartIndex)));
  const takeawayStartIndex = findSwingStartFrame(movementScores, Math.max(0, minStartIndex), threshold);

  const stableBeforeTakeaway = [];
  for (let i = Math.max(0, minStartIndex); i < takeawayStartIndex; i += 1) {
    const shoulderStable = hasPair(frames[i], LANDMARK.leftShoulder, LANDMARK.rightShoulder);
    const hipStable = hasPair(frames[i], LANDMARK.leftHip, LANDMARK.rightHip);
    if (shoulderStable && hipStable && (movementScores[i] || 0) < threshold) stableBeforeTakeaway.push(i);
  }
  const addressIndex = stableBeforeTakeaway.length ? stableBeforeTakeaway[stableBeforeTakeaway.length - 1] : Math.max(0, takeawayStartIndex - 1);

  const swingEnd = findSwingEndFrame(movementScores, takeawayStartIndex, threshold, frames.length);
  let topIndex = null;
  let bestScore = -Infinity;
  for (let i = takeawayStartIndex + 1; i < swingEnd - 2; i += 1) {
    const lw = visiblePoint(frames[i], LANDMARK.leftWrist); const rw = visiblePoint(frames[i], LANDMARK.rightWrist);
    const shoulderW = distance(visiblePoint(frames[i], LANDMARK.leftShoulder), visiblePoint(frames[i], LANDMARK.rightShoulder));
    const wristX = median([lw?.x, rw?.x]);
    const prev = median([visiblePoint(frames[i-1], LANDMARK.leftWrist)?.x, visiblePoint(frames[i-1], LANDMARK.rightWrist)?.x]);
    const next = median([visiblePoint(frames[i+1], LANDMARK.leftWrist)?.x, visiblePoint(frames[i+1], LANDMARK.rightWrist)?.x]);
    const reversal = Number.isFinite(prev)&&Number.isFinite(next)&&Number.isFinite(wristX) ? Math.sign(wristX-prev)!==Math.sign(next-wristX) : false;
    const score = (reversal ? 1.2 : 0) + (Number.isFinite(shoulderW) ? (1-Math.min(1, shoulderW/0.45)) : 0);
    if (score > bestScore) { bestScore = score; topIndex = i; }
  }
  if (!Number.isFinite(topIndex)) { topIndex = Math.floor((takeawayStartIndex + swingEnd) * 0.55); notes.push('Top index fallback used.'); }

  let impactIndex = null;
  const addressWristX = median([visiblePoint(frames[addressIndex], LANDMARK.leftWrist)?.x, visiblePoint(frames[addressIndex], LANDMARK.rightWrist)?.x]);
  let bestImpactDist = Infinity;
  for (let i = topIndex + 1; i <= swingEnd; i += 1) {
    const wx = median([visiblePoint(frames[i], LANDMARK.leftWrist)?.x, visiblePoint(frames[i], LANDMARK.rightWrist)?.x]);
    if (!Number.isFinite(wx) || !Number.isFinite(addressWristX)) continue;
    const d = Math.abs(wx - addressWristX);
    if (d < bestImpactDist) { bestImpactDist = d; impactIndex = i; }
  }
  if (!Number.isFinite(impactIndex)) { impactIndex = Math.floor((takeawayStartIndex + swingEnd) * 0.8); notes.push('Impact index fallback used.'); }

  const finishIndex = Math.min(frames.length - 1, Math.max(impactIndex + 1, swingEnd));
  const confidence = notes.length ? 'low' : 'high';
  notes.push(`Detected phase indices: address=${addressIndex ?? 'n/a'}, top=${topIndex ?? 'n/a'}, impact=${impactIndex ?? 'n/a'}`);
  return {
    addressIndex,
    takeawayStartIndex,
    topIndex,
    impactIndex,
    finishIndex,
    analysisStartIndex: addressIndex,
    analysisEndIndex: finishIndex,
    confidence,
    notes,
  };
}

function hasPair(frame, a, b) { return Boolean(visiblePoint(frame, a) && visiblePoint(frame, b)); }
function distance(a,b){ if(!a||!b) return null; return Math.hypot(a.x-b.x,a.y-b.y); }

export function getCalibrationFrames(phaseFrames = []) {
  return phaseFrames.filter((frame) => frame.phase === 'calibration');
}

export function getSwingAnalysisFrames(phaseFrames = []) {
  return phaseFrames.filter((frame) => ['setup', 'swing', 'finish'].includes(frame.phase));
}

export function getSetupFrames(phaseFrames = []) {
  return phaseFrames.filter((frame) => frame.phase === 'setup');
}

export function getSwingMotionFrames(phaseFrames = []) {
  return phaseFrames.filter((frame) => frame.phase === 'swing');
}

export function getFinishFrames(phaseFrames = []) {
  return phaseFrames.filter((frame) => frame.phase === 'finish');
}

function getTimingInfo(frames, videoStats) {
  const timestamps = frames.map((frame) => frame.timestampMs).filter(Number.isFinite);
  const hasTimestamps = timestamps.length >= Math.max(2, Math.ceil(frames.length * 0.6));
  const durationMs = hasTimestamps
    ? Math.max(...timestamps) - Math.min(...timestamps)
    : Number.isFinite(videoStats?.durationMs)
      ? videoStats.durationMs
      : Number.isFinite(videoStats?.durationSeconds)
        ? videoStats.durationSeconds * 1000
        : 6000;
  const firstTimestampMs = hasTimestamps ? Math.min(...timestamps) : 0;
  const frameIntervalMs = frames.length > 1 ? durationMs / (frames.length - 1) : durationMs;
  return { hasTimestamps, durationMs, firstTimestampMs, frameIntervalMs };
}

function boundaryIndexForElapsedMs(frames, timing, elapsedMs) {
  if (!frames.length) return -1;
  if (timing.hasTimestamps) {
    const cutoff = timing.firstTimestampMs + elapsedMs;
    const index = frames.findIndex((frame) => (frame.timestampMs ?? Infinity) > cutoff);
    return index === -1 ? frames.length - 1 : Math.max(-1, index - 1);
  }
  const ratio = timing.durationMs ? elapsedMs / timing.durationMs : 0;
  return Math.min(frames.length - 1, Math.max(-1, Math.floor(ratio * frames.length) - 1));
}

function getMovementScores(frames, timing) {
  return frames.map((frame, index) => {
    if (index === 0) return 0;
    const previous = frames[index - 1];
    const distances = MOTION_LANDMARKS.map((landmarkIndex) => landmarkDistance(previous, frame, landmarkIndex)).filter(Number.isFinite);
    const frameDeltaFactor = timing.frameIntervalMs > 0 ? Math.min(2, Math.max(0.5, 200 / timing.frameIntervalMs)) : 1;
    return (percentile(distances, 70) || 0) * frameDeltaFactor;
  });
}

function getMotionThreshold(scores) {
  const usable = scores.filter((score) => Number.isFinite(score));
  if (!usable.length) return 0.035;
  const baseline = percentile(usable, 35) || 0;
  const energetic = percentile(usable, 85) || baseline;
  return Math.max(0.025, Math.min(0.09, baseline * 2.8, energetic * 0.55 || 0.035));
}

function findSwingStartFrame(scores, firstCandidate, threshold) {
  for (let index = firstCandidate; index < scores.length; index += 1) {
    const window = scores.slice(index, index + MIN_CONSECUTIVE_MOTION_FRAMES);
    if (window.length >= MIN_CONSECUTIVE_MOTION_FRAMES && window.every((score) => score >= threshold)) return index;
  }
  return Math.min(scores.length - 1, firstCandidate);
}

function findSwingEndFrame(scores, swingStartFrame, threshold, totalFrames) {
  if (!Number.isFinite(swingStartFrame) || swingStartFrame >= totalFrames - 2) return totalFrames - 1;
  const quietThreshold = Math.max(0.018, threshold * 0.65);
  for (let index = swingStartFrame + 3; index < scores.length - 1; index += 1) {
    const quietWindow = scores.slice(index, index + 2);
    if (quietWindow.length === 2 && quietWindow.every((score) => score < quietThreshold)) return index - 1;
  }
  return Math.max(swingStartFrame, Math.round(totalFrames * 0.8));
}

function getSetupRange(frames, scores, firstAnalysisCandidate, swingStartFrame) {
  const lastBeforeSwing = Math.max(firstAnalysisCandidate, swingStartFrame - 1);
  const targetCount = Math.max(2, Math.min(8, Math.round(frames.length * 0.18)));
  const searchStart = Math.max(firstAnalysisCandidate, lastBeforeSwing - targetCount * 2);
  const candidates = [];
  for (let index = searchStart; index <= lastBeforeSwing; index += 1) {
    candidates.push({ index, score: scores[index] || 0 });
  }
  const stable = candidates.filter(({ score }) => score <= Math.max(0.04, percentile(candidates.map(({ score }) => score), 60) || 0.04));
  const selected = (stable.length >= 2 ? stable : candidates).slice(-targetCount).map(({ index }) => index);
  if (!selected.length) return { start: firstAnalysisCandidate, end: Math.max(firstAnalysisCandidate, swingStartFrame - 1) };
  return { start: Math.min(...selected), end: Math.max(...selected) };
}

function landmarkDistance(previousFrame, currentFrame, landmarkIndex) {
  const previous = visiblePoint(previousFrame, landmarkIndex);
  const current = visiblePoint(currentFrame, landmarkIndex);
  if (!previous || !current) return null;
  return Math.hypot(current.x - previous.x, current.y - previous.y);
}

function visiblePoint(frame, index) {
  const landmark = frame?.landmarks?.[index];
  if (!landmark || (landmark.visibility ?? 1) < MIN_VISIBILITY) return null;
  return landmark;
}

function median(values) {
  const usable = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const m = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[m] : (usable[m - 1] + usable[m]) / 2;
}

function percentile(values, percentileRank) {
  const usable = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  if (usable.length === 1) return usable[0];
  const index = (Math.max(0, Math.min(100, percentileRank)) / 100) * (usable.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return usable[lower];
  return usable[lower] + (usable[upper] - usable[lower]) * (index - lower);
}

function getPhaseRange(frames, phase) {
  const indexes = frames.filter((frame) => frame.phase === phase).map((frame) => frame.frameIndex);
  return indexes.length ? { start: Math.min(...indexes), end: Math.max(...indexes), count: indexes.length } : null;
}

function indexRange(start, end, totalFrames) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(totalFrames - 1, end);
  if (!totalFrames || safeEnd < safeStart) return null;
  return { start: safeStart, end: safeEnd, count: safeEnd - safeStart + 1 };
}

function getFrameTimeMs(frame, timing) {
  if (!frame) return null;
  if (Number.isFinite(frame.timestampMs)) return frame.timestampMs;
  return Math.round((frame.frameIndex || 0) * timing.frameIntervalMs);
}
