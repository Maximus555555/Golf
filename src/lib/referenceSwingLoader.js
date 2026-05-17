import referenceSwingMetadata from '../data/referenceSwings.json';

export function listReferenceSwings(filters = {}) {
  return referenceSwingMetadata.filter((swing) => {
    return Object.entries(filters).every(([key, value]) => !value || swing[key] === value);
  });
}

export async function loadReferenceSwingVideo(referenceSwing) {
  if (!referenceSwing?.videoPath) {
    return null;
  }

  const response = await fetch(resolveReferenceSwingUrl(referenceSwing.videoPath));
  if (!response.ok) {
    throw new Error(`Reference swing video could not be loaded: ${referenceSwing.id}`);
  }

  return response.blob();
}

export function hasReferenceSwings() {
  return referenceSwingMetadata.length > 0;
}

function resolveReferenceSwingUrl(videoPath) {
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(videoPath) || videoPath.startsWith('data:') || videoPath.startsWith('blob:')) {
    return videoPath;
  }

  const base = import.meta.env.BASE_URL || './';
  return new URL(videoPath.replace(/^\//, ''), new URL(base, window.location.href)).toString();
}
