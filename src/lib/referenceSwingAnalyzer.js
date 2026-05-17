import { analyzeVideoBlob } from './poseDetector.js';

const referenceTimelineCache = new Map();

export async function analyzeReferenceSwing(referenceSwing, videoBlob) {
  if (!referenceSwing?.id || !videoBlob) {
    return null;
  }

  if (referenceTimelineCache.has(referenceSwing.id)) {
    return referenceTimelineCache.get(referenceSwing.id);
  }

  const { timeline, stats } = await analyzeVideoBlob(videoBlob);
  const analyzedReference = {
    id: referenceSwing.id,
    metadata: referenceSwing,
    timeline,
    stats,
    normalizedTimeline: normalizeReferenceTimeline(timeline),
  };

  referenceTimelineCache.set(referenceSwing.id, analyzedReference);
  return analyzedReference;
}

export function normalizeReferenceTimeline(timeline = []) {
  // Placeholder for future phase alignment, handedness mirroring, and body-scale normalization.
  return timeline.map((frame) => ({ ...frame }));
}
