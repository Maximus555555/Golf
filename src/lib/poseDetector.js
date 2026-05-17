import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
const MAX_ANALYSIS_SECONDS = 6;
const SAMPLE_FPS = 8;

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
        minPoseDetectionConfidence: 0.45,
        minPosePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
      }).catch(async () =>
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
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
  if (!videoBlob) return [];

  const detector = await createPoseDetector();
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = URL.createObjectURL(videoBlob);

  try {
    await waitForMetadata(video);
    const duration = Math.min(video.duration || MAX_ANALYSIS_SECONDS, MAX_ANALYSIS_SECONDS);
    const frameInterval = 1 / SAMPLE_FPS;
    const timeline = [];

    for (let time = 0; time <= duration; time += frameInterval) {
      await seekVideo(video, Math.min(time, duration));
      const landmarks = await detector.detectForVideo(video, Math.round(time * 1000));
      if (landmarks) {
        timeline.push({ timestampMs: Math.round(time * 1000), landmarks });
      }
      onProgress?.(Math.min(1, time / duration));
    }

    onProgress?.(1);
    return timeline;
  } finally {
    URL.revokeObjectURL(video.src);
  }
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
  });
}

function seekVideo(video, time) {
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
    video.currentTime = time;
  });
}

// First-pass fallback note for maintainers: if MediaPipe cannot initialize in a
// browser, callers should continue with an empty landmark timeline so the app can
// show non-blocking beginner guidance instead of pretending an analysis happened.
