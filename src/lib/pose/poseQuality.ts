const MIN_VIS = 0.45;
const REQUIRED = [0, 11, 12, 23, 24];

function lm(frame: any, idx: number) {
  const p = frame?.landmarks?.[idx];
  if (!p || (p.visibility ?? 1) < MIN_VIS) return null;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < -0.4 || p.x > 1.4 || p.y < -0.4 || p.y > 1.4) return null;
  return p;
}

export function scorePoseFrame(frame: any) {
  const shoulders = lm(frame, 11) && lm(frame, 12);
  const hips = lm(frame, 23) && lm(frame, 24);
  const requiredVisible = REQUIRED.filter((idx) => lm(frame, idx)).length;
  const score = requiredVisible / REQUIRED.length;
  return { score, reliable: Boolean(shoulders && hips && score >= 0.6) };
}

export function getLandmarkVisibilityStats(poseTimeline: any[] = []) {
  const total = poseTimeline.length || 1;
  const counts = new Map<number, number>();
  poseTimeline.forEach((f) => {
    (f?.landmarks || []).forEach((_: any, idx: number) => {
      if (lm(f, idx)) counts.set(idx, (counts.get(idx) || 0) + 1);
    });
  });
  return Object.fromEntries(Array.from(counts.entries()).map(([k, v]) => [k, v / total]));
}

export function rejectOutlierFrames(poseTimeline: any[] = [], stableBodyScale = 0.2) {
  const rejected = new Set<number>();
  for (let i = 1; i < poseTimeline.length; i += 1) {
    const prev = poseTimeline[i - 1];
    const curr = poseTimeline[i];
    const pN = lm(prev, 0);
    const cN = lm(curr, 0);
    if (pN && cN && Math.abs(cN.x - pN.x) > stableBodyScale * 1.2) rejected.add(i);
    const pLW = lm(prev, 15); const cLW = lm(curr, 15);
    if (pLW && cLW && Math.hypot(cLW.x - pLW.x, cLW.y - pLW.y) > stableBodyScale * 1.8) rejected.add(i);
  }
  return rejected;
}

export function filterReliableFrames(poseTimeline: any[] = []) {
  const reliable = poseTimeline
    .map((frame, index) => ({ frame, index, quality: scorePoseFrame(frame) }))
    .filter((it) => it.quality.reliable);
  return { reliable, rejected: poseTimeline.length - reliable.length };
}
