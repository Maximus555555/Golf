import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
const MAX_ANALYSIS_SECONDS = 6;
const TARGET_SAMPLE_FPS = 15;
const MIN_SAMPLED_FRAMES = 45;
const MAX_SAMPLED_FRAMES = 120;
const MIN_VISIBILITY = 0.45;
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

export async function createPoseDetector() {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE).then((vision) =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: DEFAULT_POSE_CONFIDENCE,
        minPosePresenceConfidence: DEFAULT_POSE_CONFIDENCE,
        minTrackingConfidence: DEFAULT_POSE_CONFIDENCE,
      }).catch(async () =>
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: DEFAULT_POSE_CONFIDENCE,
          minPosePresenceConfidence: DEFAULT_POSE_CONFIDENCE,
          minTrackingConfidence: DEFAULT_POSE_CONFIDENCE,
        }),
      ),
    );
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

  const detector = await createPoseDetector();
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = URL.createObjectURL(videoBlob);

  try {
    await waitForMetadata(video);
    await waitForCanPlay(video);
    const duration = Math.min(getFiniteDuration(video.duration), MAX_ANALYSIS_SECONDS);
    const sampleTimes = createSampleTimes(duration);
    const timeline = [];
    const missingLandmarkCounts = new Map(DEBUG_LANDMARKS.map(({ name }) => [name, 0]));
    let framesWherePoseDetectionRan = 0;
    let framesWithAnyPose = 0;
    const recordingQualityNotes = [];

    for (const [index, time] of sampleTimes.entries()) {
      await seekVideo(video, time);
      framesWherePoseDetectionRan += 1;
      const timestampMs = Math.round(time * 1000);
      let landmarks = await detector.detectForVideo(video, timestampMs);
      if (!landmarks?.length) {
        const fallbackDetector = await createPoseDetectorWithConfidence(FALLBACK_POSE_CONFIDENCE);
        landmarks = await fallbackDetector.detectForVideo(video, timestampMs);
        if (landmarks?.length) recordingQualityNotes.push('Pose tracking confidence was reduced to detect the body; results may be less reliable.');
      }

      if (landmarks?.length && hasAnyVisibleLandmark(landmarks)) {
        framesWithAnyPose += 1;
        recordMissingLandmarks(landmarks, missingLandmarkCounts);
        timeline.push({ timestampMs, landmarks });
      } else {
        DEBUG_LANDMARKS.forEach(({ name }) => missingLandmarkCounts.set(name, (missingLandmarkCounts.get(name) || 0) + 1));
      }

      onProgress?.((index + 1) / sampleTimes.length);
    }

    const stats = {
      totalFramesSampled: sampleTimes.length,
      framesWherePoseDetectionRan,
      framesWithAnyPose,
      usableFramePercentage: sampleTimes.length ? framesWithAnyPose / sampleTimes.length : 0,
      visibleLandmarkFrequency: getVisibleLandmarkFrequency(missingLandmarkCounts, sampleTimes.length),
      mostOftenMissingLandmarks: getMostMissingLandmarks(missingLandmarkCounts),
      videoDimensions: { width: video.videoWidth || null, height: video.videoHeight || null },
      finalReason: 'pose-detection-complete',
      recordingQualityNotes: [...new Set(recordingQualityNotes)],
    };
    logPoseDetectionStats(stats);
    onProgress?.(1);
    return { timeline, stats };
  } catch (error) {
    console.warn('[SwingFix] Pose analysis failed before swing checks', {
      finalReason: error instanceof Error ? error.message : 'unknown-pose-processing-error',
    });
    throw error;
  } finally {
    URL.revokeObjectURL(video.src);
  }
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
  return Boolean(landmark) && (landmark.visibility ?? 1) >= MIN_VISIBILITY;
}

function hasAnyVisibleLandmark(landmarks) {
  return DEBUG_LANDMARKS.some(({ index }) => isVisible(landmarks[index]));
}

function recordMissingLandmarks(landmarks, missingLandmarkCounts) {
  DEBUG_LANDMARKS.forEach(({ name, index }) => {
    if (!isVisible(landmarks[index])) {
      missingLandmarkCounts.set(name, (missingLandmarkCounts.get(name) || 0) + 1);
    }
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
  });
}

function createEmptyStats(finalReason) {
  return {
    totalFramesSampled: 0,
    framesWherePoseDetectionRan: 0,
    framesWithAnyPose: 0,
    usableFramePercentage: 0,
    visibleLandmarkFrequency: [],
    mostOftenMissingLandmarks: [],
    videoDimensions: null,
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

// First-pass fallback note for maintainers: if MediaPipe cannot initialize in a
// browser, callers should continue with an empty landmark timeline so the app can
// show non-blocking beginner guidance instead of pretending an analysis happened.
