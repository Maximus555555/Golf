const LANDMARK = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
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
const CALIBRATION_WINDOW_MS = 2000;
const MIN_DIRECT_FRAMES = 5;
const MIN_FALLBACK_FRAMES = 4;
const HEAD_TO_HIP_BODY_RATIO = 0.53;
const SHOULDER_TO_HIP_BODY_RATIO = 0.29;

export function normalizeHeightInput(input = {}) {
  const unit = input.unit === 'cm' ? 'cm' : 'imperial';
  const feet = parseNumber(input.feet);
  const inches = parseNumber(input.inches);
  const centimeters = parseNumber(input.centimeters);

  if (unit === 'cm') {
    if (!Number.isFinite(centimeters) || centimeters < 90 || centimeters > 245) {
      return { enabled: false, error: 'Enter a height between 90 and 245 centimeters.' };
    }
    return {
      enabled: true,
      inputHeightCm: roundTo(centimeters, 1),
      preferredUnit: 'cm',
      displayHeight: `${roundTo(centimeters, 1)} cm`,
    };
  }

  const totalInches = (Number.isFinite(feet) ? feet : 0) * 12 + (Number.isFinite(inches) ? inches : 0);
  if (!Number.isFinite(totalInches) || totalInches < 36 || totalInches > 96) {
    return { enabled: false, error: 'Enter a height between 3 ft and 8 ft.' };
  }

  return {
    enabled: true,
    inputHeightCm: roundTo(totalInches * 2.54, 1),
    preferredUnit: 'in',
    displayHeight: `${Math.floor(totalInches / 12)} ft ${Math.round(totalInches % 12)} in`,
  };
}

export function estimateCalibrationScale({ inputHeightCm, poseTimeline = [], videoDimensions = null } = {}) {
  if (!Number.isFinite(inputHeightCm) || inputHeightCm <= 0) {
    return failedCalibration('Height calibration was skipped or the entered height was not usable.', inputHeightCm);
  }

  const calibrationFrames = poseTimeline.filter((frame) => (frame.timestampMs ?? 0) <= CALIBRATION_WINDOW_MS);
  if (calibrationFrames.length < MIN_FALLBACK_FRAMES) {
    return failedCalibration('Not enough standing-pose frames were visible at the start of the video.', inputHeightCm);
  }

  const directSamples = calibrationFrames.map(getDirectBodyHeightSample).filter(Boolean);
  const filteredDirect = filterOutliers(directSamples, 'height');
  const fallbackSamples = calibrationFrames.map(getFallbackBodyHeightSample).filter(Boolean);
  const filteredFallback = filterOutliers(fallbackSamples, 'height');
  const directConfidence = getCalibrationConfidence(filteredDirect, calibrationFrames.length, 'direct');

  if (directConfidence === 'good' || directConfidence === 'fair') {
    const visibleHeight = median(filteredDirect.map((sample) => sample.height));
    return {
      enabled: true,
      status: directConfidence,
      inputHeightCm,
      scaleCmPerNormalizedUnit: inputHeightCm / visibleHeight,
      visibleBodyHeightNormalized: visibleHeight,
      sampleCount: filteredDirect.length,
      method: 'head-to-feet',
      videoDimensions,
      message: 'Height calibration used the opening standing pose.',
    };
  }

  if (filteredFallback.length >= MIN_FALLBACK_FRAMES) {
    const fallbackHeight = median(filteredFallback.map((sample) => sample.height));
    const fallbackConfidence = getCalibrationConfidence(filteredFallback, calibrationFrames.length, 'fallback');
    if (fallbackConfidence === 'limited') {
      return {
        enabled: true,
        status: 'limited',
        inputHeightCm,
        scaleCmPerNormalizedUnit: inputHeightCm / fallbackHeight,
        visibleBodyHeightNormalized: fallbackHeight,
        sampleCount: filteredFallback.length,
        method: 'body-proportion-fallback',
        videoDimensions,
        message: 'Height calibration was limited because the feet were not clearly visible.',
      };
    }
  }

  return failedCalibration('Height calibration could not be completed because the app could not clearly read your standing position.', inputHeightCm);
}

export function convertNormalizedDistanceToRealWorld(distance, calibration, preferredUnit = 'in') {
  if (!Number.isFinite(distance) || distance < 0 || !calibration || !Number.isFinite(calibration.scaleCmPerNormalizedUnit)) return null;
  const centimeters = distance * calibration.scaleCmPerNormalizedUnit;
  if (!Number.isFinite(centimeters) || centimeters < 0 || centimeters > 90) return null;
  if (preferredUnit === 'cm') return { value: centimeters, unit: 'cm', label: `${roundTo(centimeters, 1)} cm` };
  const inches = centimeters / 2.54;
  return { value: inches, unit: 'in', label: `${roundTo(inches, 1)} inches` };
}

export function getCalibrationConfidence(samples = [], totalFrames = samples.length, method = 'direct') {
  if (method === 'fallback') {
    const stableFallback = isStable(samples.map((sample) => sample.height), 0.18);
    const stillFallback = getStillness(samples) <= 0.16;
    return samples.length >= MIN_FALLBACK_FRAMES && stableFallback && stillFallback ? 'limited' : 'failed';
  }

  if (samples.length < MIN_DIRECT_FRAMES) return 'failed';
  const coverage = totalFrames ? samples.length / totalFrames : 0;
  const stableHeight = isStable(samples.map((sample) => sample.height), 0.08);
  const mostlyStill = getStillness(samples) <= 0.08;
  const upright = samples.filter((sample) => sample.upright).length / samples.length >= 0.7;

  if (coverage >= 0.68 && stableHeight && mostlyStill && upright) return 'good';
  if (coverage >= 0.45 && isStable(samples.map((sample) => sample.height), 0.14) && getStillness(samples) <= 0.13 && upright) return 'fair';
  return 'failed';
}

function failedCalibration(message, inputHeightCm = null) {
  return {
    enabled: true,
    status: 'failed',
    inputHeightCm: Number.isFinite(inputHeightCm) ? inputHeightCm : null,
    scaleCmPerNormalizedUnit: null,
    message,
  };
}

function getDirectBodyHeightSample(frame) {
  const head = firstVisible(frame, [LANDMARK.nose, LANDMARK.leftEar, LANDMARK.rightEar]);
  const foot = lowestVisible(frame, [LANDMARK.leftAnkle, LANDMARK.rightAnkle, LANDMARK.leftHeel, LANDMARK.rightHeel, LANDMARK.leftFootIndex, LANDMARK.rightFootIndex]);
  const shoulderCenter = midpoint(visible(frame, LANDMARK.leftShoulder), visible(frame, LANDMARK.rightShoulder));
  const hipCenter = midpoint(visible(frame, LANDMARK.leftHip), visible(frame, LANDMARK.rightHip));
  const kneeCenter = midpoint(visible(frame, LANDMARK.leftKnee), visible(frame, LANDMARK.rightKnee));
  if (!head || !foot) return null;
  const height = Math.abs(foot.y - head.y);
  if (!Number.isFinite(height) || height < 0.2 || height > 1.25) return null;
  return {
    height,
    head,
    lower: foot,
    center: hipCenter || shoulderCenter || kneeCenter || head,
    upright: isMostlyUpright(head, foot, shoulderCenter, hipCenter),
  };
}

function getFallbackBodyHeightSample(frame) {
  const head = firstVisible(frame, [LANDMARK.nose, LANDMARK.leftEar, LANDMARK.rightEar]);
  const shoulderCenter = midpoint(visible(frame, LANDMARK.leftShoulder), visible(frame, LANDMARK.rightShoulder));
  const hipCenter = midpoint(visible(frame, LANDMARK.leftHip), visible(frame, LANDMARK.rightHip));
  if (!head || (!hipCenter && !shoulderCenter)) return null;

  const estimates = [];
  if (hipCenter) estimates.push(Math.abs(hipCenter.y - head.y) / HEAD_TO_HIP_BODY_RATIO);
  if (shoulderCenter && hipCenter) estimates.push(Math.abs(hipCenter.y - shoulderCenter.y) / SHOULDER_TO_HIP_BODY_RATIO);
  const estimatedHeight = median(estimates);

  if (!Number.isFinite(estimatedHeight) || estimatedHeight < 0.2 || estimatedHeight > 1.4) return null;
  return {
    height: estimatedHeight,
    head,
    lower: hipCenter || shoulderCenter,
    center: hipCenter || shoulderCenter,
    upright: true,
  };
}

function visible(frame, index) {
  const landmark = frame?.landmarks?.[index];
  return landmark && (landmark.visibility ?? 1) >= MIN_VISIBILITY ? landmark : null;
}

function firstVisible(frame, indexes) {
  for (const index of indexes) {
    const landmark = visible(frame, index);
    if (landmark) return landmark;
  }
  return null;
}

function lowestVisible(frame, indexes) {
  return indexes.map((index) => visible(frame, index)).filter(Boolean).sort((a, b) => b.y - a.y)[0] ?? null;
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function isMostlyUpright(head, foot, shoulderCenter, hipCenter) {
  const verticalHeight = Math.abs(foot.y - head.y);
  const horizontalLean = Math.abs((foot.x ?? 0) - (head.x ?? 0));
  const torsoLean = shoulderCenter && hipCenter ? Math.abs(shoulderCenter.x - hipCenter.x) : 0;
  return verticalHeight > 0 && horizontalLean / verticalHeight < 0.38 && torsoLean / verticalHeight < 0.22;
}

function filterOutliers(samples, key) {
  if (samples.length < 4) return samples;
  const values = samples.map((sample) => sample[key]);
  const center = median(values);
  const deviations = values.map((value) => Math.abs(value - center));
  const medianDeviation = median(deviations) || 0.0001;
  return samples.filter((sample) => Math.abs(sample[key] - center) / medianDeviation <= 3.5);
}

function getStillness(samples) {
  if (samples.length < 2) return 0;
  const xs = samples.map((sample) => sample.center?.x).filter(Number.isFinite);
  const ys = samples.map((sample) => sample.center?.y).filter(Number.isFinite);
  return Math.hypot(range(xs), range(ys));
}

function isStable(values, maxCoefficientOfVariation) {
  const usable = values.filter(Number.isFinite);
  if (usable.length < 2) return false;
  const center = median(usable);
  if (!center) return false;
  return standardDeviation(usable) / center <= maxCoefficientOfVariation;
}

function median(values) {
  const usable = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

function standardDeviation(values) {
  const usable = values.filter(Number.isFinite);
  if (usable.length < 2) return 0;
  const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;
  const variance = usable.reduce((sum, value) => sum + (value - mean) ** 2, 0) / usable.length;
  return Math.sqrt(variance);
}

function range(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? Math.max(...usable) - Math.min(...usable) : 0;
}

function parseNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
