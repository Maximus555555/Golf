import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const WASM_BASE = import.meta.env.VITE_MEDIAPIPE_WASM_BASE || 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
const MODEL_URL = import.meta.env.VITE_MEDIAPIPE_MODEL_URL || 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
const MAX_ANALYSIS_SECONDS = 6;
const TARGET_SAMPLE_FPS = 15;
const MIN_SAMPLED_FRAMES = 45;
const MAX_SAMPLED_FRAMES = 120;
const MIN_ANY_PERSON_VISIBILITY = 0.2;
const MIN_RELIABLE_LANDMARK_VISIBILITY = 0.45;
const DEFAULT_POSE_CONFIDENCE = 0.5;
const FALLBACK_POSE_CONFIDENCE = 0.4;
const CONFIDENCE_RETRY_FAILURE_RATIO = 0.55;

const DEBUG_LANDMARKS = [
  { name: 'nose', index: 0 },
  { name: 'leftShoulder', index: 11 },
  { name: 'rightShoulder', index: 12 },
  { name: 'leftElbow', index: 13 },
  { name: 'rightElbow', index: 14 },
  { name: 'leftWrist', index: 15 },
  { name: 'rightWrist', index: 16 },
  { name: 'leftHip', index: 23 },
  { name: 'rightHip', index: 24 },
  { name: 'leftKnee', index: 25 },
  { name: 'rightKnee', index: 26 },
  { name: 'leftAnkle', index: 27 },
  { name: 'rightAnkle', index: 28 },
  { name: 'leftHeel', index: 29 },
  { name: 'rightHeel', index: 30 },
  { name: 'leftFootIndex', index: 31 },
  { name: 'rightFootIndex', index: 32 },
];

let landmarkerPromise;
let fallbackLandmarkerPromise;

export async function createPoseDetector() {
  if (!landmarkerPromise) {
    landmarkerPromise = createPrimaryPoseDetector().catch((error) => {
      landmarkerPromise = null;
      throw error;
    });
  }

  const landmarker = await landmarkerPromise;
  return {
    async detectForVideo(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs);
      return result.landmarks?.[0] ?? null;
    },
  };
}

export async function analyzeVideoBlob(videoBlob, { onProgress } = {}) {
  if (!videoBlob) return { timeline: [], stats: createEmptyStats('missing-video-blob') };
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = URL.createObjectURL(videoBlob);

  try {
    const detector = await createPoseDetector();
    await waitForMetadata(video);
    await waitForCanPlay(video);
    const duration = Math.min(getFiniteDuration(video.duration), MAX_ANALYSIS_SECONDS);
    const sampleTimes = createSampleTimes(duration);
    const frameCanvas = document.createElement('canvas');
    const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
    const timeline = [];
    const missingLandmarkCounts = new Map(DEBUG_LANDMARKS.map(({ name }) => [name, 0]));
    let framesWherePoseDetectionRan = 0;
    let framesWithAnyPose = 0;
    let framesWithRawLandmarks = 0;
    let framesWithAnyPersonLikePose = 0;
    const recordingQualityNotes = [];
    let fallbackDetector = null;
    let framesUsingFallback = 0;
    let firstDetectionError = null;

    for (const [index, time] of sampleTimes.entries()) {
      await seekVideo(video, time);
      await waitForVideoFrame(video);
      framesWherePoseDetectionRan += 1;
      const timestampMs = Math.round(time * 1000);
      const frameSource = drawVideoFrameToCanvas(video, frameCanvas, frameCtx) || video;
      let landmarks = null;
      let frameHadRawLandmarks = false;
      let frameHadPersonLikePose = false;
      let frameUsedFallback = false;
      try {
        landmarks = await detector.detectForVideo(frameSource, timestampMs);
      } catch (error) {
        if (!firstDetectionError) firstDetectionError = error instanceof Error ? error.message : String(error);
      }
      frameHadRawLandmarks = Boolean(landmarks?.length);
      frameHadPersonLikePose = hasAnyPersonLikePose(landmarks);
      const shouldRetryFallback = !landmarks?.length || !hasAnyVisibleLandmark(landmarks) || !hasAnyPersonLikePose(landmarks);
      if (shouldRetryFallback) {
        if (!fallbackDetector) fallbackDetector = await createFallbackPoseDetector();
        const fallbackLandmarks = await fallbackDetector.detectForVideo(frameSource, timestampMs);
        if (fallbackLandmarks?.length) {
          frameUsedFallback = true;
          landmarks = fallbackLandmarks;
        }
        frameHadRawLandmarks = frameHadRawLandmarks || Boolean(landmarks?.length);
        frameHadPersonLikePose = frameHadPersonLikePose || hasAnyPersonLikePose(landmarks);
      }
      if (frameHadRawLandmarks) framesWithRawLandmarks += 1;
      if (frameHadPersonLikePose) framesWithAnyPersonLikePose += 1;
      if (frameUsedFallback) framesUsingFallback += 1;

      if (landmarks?.length && hasAnyVisibleLandmark(landmarks)) {
        framesWithAnyPose += 1;
        recordMissingLandmarks(landmarks, missingLandmarkCounts);
        timeline.push({ timestampMs, landmarks });
      } else {
        DEBUG_LANDMARKS.forEach(({ name }) => missingLandmarkCounts.set(name, (missingLandmarkCounts.get(name) || 0) + 1));
      }

      onProgress?.((index + 1) / sampleTimes.length);
    }


    const fallbackFrameRatio = framesWherePoseDetectionRan ? framesUsingFallback / framesWherePoseDetectionRan : 0;
    if (framesUsingFallback > 0) {
      recordingQualityNotes.push('Pose tracking confidence was reduced to detect the body; results may be less reliable.');
      if (fallbackFrameRatio >= CONFIDENCE_RETRY_FAILURE_RATIO) {
        recordingQualityNotes.push('Pose tracking needed lower confidence for many frames, so results may be less reliable.');
      }
    }

    const stats = {
      modelLoaded: true,
      wasmBase: WASM_BASE,
      modelUrl: MODEL_URL,
      totalFramesSampled: sampleTimes.length,
      framesWherePoseDetectionRan,
      framesWithRawLandmarks,
      framesWithAnyPersonLikePose,
      framesWithAnyVisiblePose: framesWithAnyPose,
      framesWithAnyPose,
      usableFramePercentage: sampleTimes.length ? framesWithAnyPose / sampleTimes.length : 0,
      visibleLandmarkFrequency: getVisibleLandmarkFrequency(missingLandmarkCounts, sampleTimes.length),
      mostOftenMissingLandmarks: getMostMissingLandmarks(missingLandmarkCounts),
      videoDimensions: { width: video.videoWidth || null, height: video.videoHeight || null },
      durationUsed: duration,
      sampleTimesCount: sampleTimes.length,
      firstDetectionError,
      finalReason: 'pose-detection-complete',
      fallbackFrameRatio,
      framesUsingFallback,
      recordingQualityNotes: [...new Set(recordingQualityNotes)],
    };
    logPoseDetectionStats(stats);
    onProgress?.(1);
    return { timeline, stats };
  } catch (error) {
    console.warn('[SwingFix] Pose analysis failed before swing checks', {
      finalReason: error instanceof Error ? error.message : 'unknown-pose-processing-error',
    });
    return {
      timeline: [],
      stats: {
        ...createEmptyStats('pose-analysis-error'),
        modelLoaded: false,
        wasmBase: WASM_BASE,
        modelUrl: MODEL_URL,
        firstDetectionError: error instanceof Error ? error.message : String(error),
        finalReason: 'pose-analysis-error',
      },
      error,
    };
  } finally {
    URL.revokeObjectURL(video.src);
  }
}

async function createPrimaryPoseDetector() {
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    const landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: DEFAULT_POSE_CONFIDENCE,
      minPosePresenceConfidence: DEFAULT_POSE_CONFIDENCE,
      minTrackingConfidence: DEFAULT_POSE_CONFIDENCE,
    }).catch(() => PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: DEFAULT_POSE_CONFIDENCE,
      minPosePresenceConfidence: DEFAULT_POSE_CONFIDENCE,
      minTrackingConfidence: DEFAULT_POSE_CONFIDENCE,
    }));
    return {
      async detectForVideo(source, timestampMs) {
        const result = landmarker.detectForVideo(source, timestampMs);
        return result.landmarks?.[0] ?? null;
      },
    };
  } catch {
    throw new Error('MediaPipe pose model could not load. Check internet access or external MediaPipe asset URLs.');
  }
}



async function createFallbackPoseDetector() {
  // Fallback detector intentionally uses CPU because it is a lower-confidence retry path and avoids repeated GPU initialization issues on mobile browsers.
  if (!fallbackLandmarkerPromise) {
    fallbackLandmarkerPromise = createPoseDetectorWithConfidence(FALLBACK_POSE_CONFIDENCE);
  }
  return fallbackLandmarkerPromise;
}

async function createPoseDetectorWithConfidence(confidence) {
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
  const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: confidence,
    minPosePresenceConfidence: confidence,
    minTrackingConfidence: confidence,
  });
  return {
    detectForVideo(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs);
      return result.landmarks?.[0] ?? null;
    },
  };
}
function createSampleTimes(duration) {
  const safeDuration = duration || MAX_ANALYSIS_SECONDS;
  const targetCount = Math.round(safeDuration * TARGET_SAMPLE_FPS);
  const frameCount = Math.max(MIN_SAMPLED_FRAMES, Math.min(MAX_SAMPLED_FRAMES, targetCount));
  if (frameCount <= 1) return [0];
  const step = safeDuration / (frameCount - 1);
  const times = [];
  for (let i = 0; i < frameCount; i += 1) times.push(Math.min(safeDuration, i * step));
  return times;
}

export function __createSampleTimesForTests(duration) {
  return createSampleTimes(duration);
}

function getFiniteDuration(duration) {
  return Number.isFinite(duration) && duration > 0 ? duration : MAX_ANALYSIS_SECONDS;
}

function isVisible(landmark) {
  return Boolean(landmark) && (landmark.visibility ?? 1) >= MIN_ANY_PERSON_VISIBILITY;
}

function isReliable(landmark) {
  return Boolean(landmark) && (landmark.visibility ?? 1) >= MIN_RELIABLE_LANDMARK_VISIBILITY;
}

function hasAnyVisibleLandmark(landmarks) {
  return DEBUG_LANDMARKS.some(({ index }) => isVisible(landmarks[index]));
}

function recordMissingLandmarks(landmarks, missingLandmarkCounts) {
  DEBUG_LANDMARKS.forEach(({ name, index }) => {
    if (!isReliable(landmarks[index])) {
      missingLandmarkCounts.set(name, (missingLandmarkCounts.get(name) || 0) + 1);
    }
  });
}
function hasAnyPersonLikePose(landmarks) {
  return DEBUG_LANDMARKS.some(({ index }) => {
    const lm = landmarks?.[index];
    return lm && Number.isFinite(lm.x) && Number.isFinite(lm.y);
  });
}

function getMostMissingLandmarks(missingLandmarkCounts) {
  return [...missingLandmarkCounts.entries()]
    .map(([name, missingFrames]) => ({ name, missingFrames }))
    .filter(({ missingFrames }) => missingFrames > 0)
    .sort((a, b) => b.missingFrames - a.missingFrames)
    .slice(0, 5);
}

function getVisibleLandmarkFrequency(missingLandmarkCounts, totalFramesSampled) {
  const denominator = totalFramesSampled || 1;
  return DEBUG_LANDMARKS.map(({ name }) => {
    const missingFrames = missingLandmarkCounts.get(name) || 0;
    const visibleFrames = Math.max(0, denominator - missingFrames);
    return { name, visibleFrames, visibleRatio: visibleFrames / denominator };
  });
}

function logPoseDetectionStats(stats) {
  console.info('[SwingFix] Video pose detection stats', {
    totalFramesSampled: stats.totalFramesSampled,
    framesWherePoseDetectionRan: stats.framesWherePoseDetectionRan,
    framesWithAnyLandmarks: stats.framesWithAnyPose,
    usableFramePercentage: `${Math.round(stats.usableFramePercentage * 100)}%`,
    visibleLandmarkFrequencySummary: stats.visibleLandmarkFrequency,
    mostOftenMissingLandmarks: stats.mostOftenMissingLandmarks,
    finalReason: stats.finalReason,
    framesUsingFallback: stats.framesUsingFallback,
    fallbackFrameRatio: stats.fallbackFrameRatio,
  });
}

function createEmptyStats(finalReason) {
  return {
    modelLoaded: false,
    wasmBase: WASM_BASE,
    modelUrl: MODEL_URL,
    totalFramesSampled: 0,
    sampleTimesCount: 0,
    durationUsed: 0,
    framesWherePoseDetectionRan: 0,
    framesWithRawLandmarks: 0,
    framesWithAnyPersonLikePose: 0,
    framesWithAnyVisiblePose: 0,
    framesWithAnyPose: 0,
    usableFramePercentage: 0,
    visibleLandmarkFrequency: [],
    mostOftenMissingLandmarks: [],
    videoDimensions: null,
    framesUsingFallback: 0,
    fallbackFrameRatio: 0,
    firstDetectionError: null,
    finalReason,
  };
}

function waitForMetadata(video) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleLoaded);
      video.removeEventListener('error', handleError);
    };
    const handleLoaded = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('The recorded video could not be loaded for analysis.'));
    };
    video.addEventListener('loadedmetadata', handleLoaded, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.load();
  });
}

function waitForCanPlay(video) {
  if (video.readyState >= 2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadeddata', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
    const handleCanPlay = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('The recorded video could not be decoded for analysis.'));
    };
    video.addEventListener('canplay', handleCanPlay, { once: true });
    video.addEventListener('loadeddata', handleCanPlay, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

function seekVideo(video, time) {
  const clampedTime = Math.max(0, Math.min(time, getFiniteDuration(video.duration)));
  if (Math.abs(video.currentTime - clampedTime) < 0.01 && video.readyState >= 2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
    };
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('A recorded frame could not be analyzed.'));
    };
    video.addEventListener('seeked', handleSeeked, { once: true });
    video.addEventListener('error', handleError, { once: true });
    video.currentTime = clampedTime;
  });
}

async function waitForVideoFrame(video) {
  if ('requestVideoFrameCallback' in video) {
    await Promise.race([
      new Promise((resolve) => video.requestVideoFrameCallback(() => resolve())),
      new Promise((resolve) => window.setTimeout(resolve, 120)),
    ]);
    return;
  }

  await new Promise((resolve) => window.setTimeout(resolve, 80));
}

function drawVideoFrameToCanvas(video, canvas, ctx) {
  try {
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 360;
    if (!width || !height || !ctx) return null;
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(video, 0, 0, width, height);
    return canvas;
  } catch {
    return null;
  }
}

// First-pass fallback note for maintainers: if MediaPipe cannot initialize in a
// browser, callers should continue with an empty landmark timeline so the app can
// show non-blocking beginner guidance instead of pretending an analysis happened.
