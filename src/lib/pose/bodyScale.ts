export type BodyScaleConfidence = 'high' | 'medium' | 'low';

const MIN_SHOULDER_VISIBILITY = 0.45;
const MIN_BODY_WIDTH = 0.12;

function median(values: number[]): number | null {
  const usable = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!usable.length) return null;
  const mid = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[mid] : (usable[mid - 1] + usable[mid]) / 2;
}

function shoulderWidth(frame: any): number | null {
  const left = frame?.landmarks?.[11];
  const right = frame?.landmarks?.[12];
  if (!left || !right) return null;
  if ((left.visibility ?? 1) < MIN_SHOULDER_VISIBILITY || (right.visibility ?? 1) < MIN_SHOULDER_VISIBILITY) return null;
  const width = Math.hypot(left.x - right.x, left.y - right.y);
  return Number.isFinite(width) ? width : null;
}

function windowWidths(poseTimeline: any[], center: number, radius: number): number[] {
  const start = Math.max(0, center - radius);
  const end = Math.min(poseTimeline.length - 1, center + radius);
  const vals: number[] = [];
  for (let i = start; i <= end; i += 1) {
    const w = shoulderWidth(poseTimeline[i]);
    if (w && w > 0.05 && w < 1.2) vals.push(w);
  }
  return vals;
}

export function getStableBodyScale(poseTimeline: any[] = [], addressIndex: number | null = null) {
  const notes: string[] = [];
  const anchor = Number.isFinite(addressIndex as number) ? (addressIndex as number) : Math.floor(poseTimeline.length * 0.2);
  let widths = windowWidths(poseTimeline, anchor, 8);
  let source = 'address';
  if (widths.length < 4) {
    widths = windowWidths(poseTimeline, Math.floor(poseTimeline.length * 0.3), 12);
    source = 'early-swing';
    notes.push('Address shoulder width was unstable; used early swing median.');
  }
  const med = median(widths) ?? MIN_BODY_WIDTH;
  const jitter = widths.length > 3 ? (Math.max(...widths) - Math.min(...widths)) / Math.max(med, 1e-3) : 1;
  let confidence: BodyScaleConfidence = 'high';
  if (widths.length < 5 || jitter > 0.55 || source !== 'address') confidence = 'medium';
  if (widths.length < 3 || !Number.isFinite(med) || jitter > 0.9) confidence = 'low';
  if (confidence === 'low') notes.push('Body-scale confidence is low.');

  return {
    bodyWidth: Math.max(MIN_BODY_WIDTH, med),
    confidence,
    notes,
  };
}
