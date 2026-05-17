import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
const MAX_ANALYSIS_SECONDS = 6;
const TARGET_SAMPLE_FPS = 5;
const MIN_SAMPLED_FRAMES = 20;
const MAX_SAMPLED_FRAMES = 40;
const MIN_VISIBILITY = 0.45;

const LANDMARK = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
};

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
        minPoseDetectionConfidence: 0.35,
        minPosePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      }).catch(async () =>
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.35,
          minPosePresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
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
    let framesWithCoreLandmarks = 0;

    for (const [index, time] of sampleTimes.entries()) {
      await seekVideo(video, time);
      framesWherePoseDetectionRan += 1;
      const timestampMs = Math.round(time * 1000);
      const landmarks = await detector.detectForVideo(video, timestampMs);

      if (landmarks?.length) {
        framesWithAnyPose += 1;
        if (hasCoreLandmarks(landmarks)) framesWithCoreLandmarks += 1;
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
      framesWithCoreLandmarks,
      usableFramePercentage: sampleTimes.length ? framesWithAnyPose / sampleTimes.length : 0,
      mostOftenMissingLandmarks: getMostMissingLandmarks(missingLandmarkCounts),
      finalReason: 'pose-detection-complete',
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

function createSampleTimes(duration) {
  const safeDuration = duration || MAX_ANALYSIS_SECONDS;
  const frameCount = Math.max(MIN_SAMPLED_FRAMES, Math.min(MAX_SAMPLED_FRAMES, Math.round(safeDuration * TARGET_SAMPLE_FPS)));
  if (frameCount <= 1) return [0];
  return Array.from({ length: frameCount }, (_, index) => {
    const progress = index / (frameCount - 1);
    return Math.min(safeDuration, progress * safeDuration);
  });
}

function getFiniteDuration(duration) {
  return Number.isFinite(duration) && duration > 0 ? duration : MAX_ANALYSIS_SECONDS;
}

function isVisible(landmark) {
  return Boolean(landmark) && (landmark.visibility ?? 1) >= MIN_VISIBILITY;
}

function hasCoreLandmarks(landmarks) {
  const hasHead = [LANDMARK.nose, LANDMARK.leftEar, LANDMARK.rightEar].some((index) => isVisible(landmarks[index]));
  const coreGroupsVisible = [
    hasHead,
    isVisible(landmarks[LANDMARK.leftShoulder]),
    isVisible(landmarks[LANDMARK.rightShoulder]),
    isVisible(landmarks[LANDMARK.leftHip]),
    isVisible(landmarks[LANDMARK.rightHip]),
  ].filter(Boolean).length;

  return coreGroupsVisible >= 4;
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

function logPoseDetectionStats(stats) {
  console.info('[SwingFix] Video pose detection stats', {
    totalFramesSampled: stats.totalFramesSampled,
    framesWherePoseDetectionRan: stats.framesWherePoseDetectionRan,
    framesWithAnyPose: stats.framesWithAnyPose,
    framesWithCoreLandmarks: stats.framesWithCoreLandmarks,
    usableFramePercentage: `${Math.round(stats.usableFramePercentage * 100)}%`,
    mostOftenMissingLandmarks: stats.mostOftenMissingLandmarks,
    finalReason: stats.finalReason,
  });
}

function createEmptyStats(finalReason) {
  return {
    totalFramesSampled: 0,
    framesWherePoseDetectionRan: 0,
    framesWithAnyPose: 0,
    framesWithCoreLandmarks: 0,
    usableFramePercentage: 0,
    mostOftenMissingLandmarks: [],
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
