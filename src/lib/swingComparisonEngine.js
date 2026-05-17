export function compareSwingToReferences(userTimeline = [], referenceAnalyses = [], options = {}) {
  if (!referenceAnalyses.length) {
    return {
      implemented: false,
      matches: [],
      notes: 'Reference comparison is intentionally disabled until developer-provided reference swings are added.',
    };
  }

  return {
    implemented: false,
    matches: [],
    notes: 'Future comparison will align swing phases, normalize body scale, then compare head movement, turns, posture, arm extension, and balance.',
    options,
    userFrameCount: userTimeline.length,
    referenceCount: referenceAnalyses.length,
  };
}

export function getSupportedComparisonDimensions() {
  return [
    'view-category',
    'handedness',
    'phase-alignment',
    'body-scale-normalization',
    'head-movement',
    'shoulder-hip-turn',
    'posture-change',
    'lead-arm-extension',
    'balance-finish',
  ];
}
