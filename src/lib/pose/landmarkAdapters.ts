export type LandmarkName =
  | 'nose'
  | 'leftEar'
  | 'rightEar'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftElbow'
  | 'rightElbow'
  | 'leftWrist'
  | 'rightWrist'
  | 'leftHip'
  | 'rightHip';

export type LandmarkModel = 'mediapipe' | 'coco';

export type PoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  score?: number;
  presence?: number;
};

export type PoseFrame = {
  landmarks?: PoseLandmark[];
  worldLandmarks?: PoseLandmark[];
  poseWorldLandmarks?: PoseLandmark[];
  model?: LandmarkModel;
  landmarkModel?: LandmarkModel;
  timestampMs?: number;
  phase?: string;
  event?: string;
  name?: string;
};

export const MEDIAPIPE_LANDMARKS: Record<LandmarkName, number> = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
};

export const COCO_LANDMARKS: Record<LandmarkName, number> = {
  nose: 0,
  leftEar: 3,
  rightEar: 4,
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
};

const MIN_VISIBILITY = 0.45;

export function inferLandmarkModel(frame?: PoseFrame): LandmarkModel {
  if (frame?.model === 'coco' || frame?.landmarkModel === 'coco') return 'coco';
  if (frame?.model === 'mediapipe' || frame?.landmarkModel === 'mediapipe') return 'mediapipe';

  const landmarks = frame?.landmarks;
  if (!landmarks) return 'mediapipe';
  if (landmarks.length >= 25) return 'mediapipe';
  return 'coco';
}

export function landmarkIndex(name: LandmarkName, model: LandmarkModel = 'mediapipe') {
  return model === 'coco' ? COCO_LANDMARKS[name] : MEDIAPIPE_LANDMARKS[name];
}

export function isUsableLandmark(landmark?: PoseLandmark | null): landmark is PoseLandmark {
  if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) return false;
  const quality = landmark.visibility ?? landmark.score ?? landmark.presence ?? 1;
  return quality >= MIN_VISIBILITY;
}

export function getLandmark(frame: PoseFrame | undefined, name: LandmarkName, model = inferLandmarkModel(frame)) {
  const landmark = frame?.landmarks?.[landmarkIndex(name, model)];
  return isUsableLandmark(landmark) ? landmark : null;
}

export function getWorldLandmark(frame: PoseFrame | undefined, name: LandmarkName, model = inferLandmarkModel(frame)) {
  const world = frame?.worldLandmarks ?? frame?.poseWorldLandmarks;
  const landmark = world?.[landmarkIndex(name, model)];
  return isUsableLandmark(landmark) && Number.isFinite(landmark.z) ? landmark : null;
}

export function getLandmarkAccessor(frame: PoseFrame | undefined) {
  const model = inferLandmarkModel(frame);
  return {
    model,
    get: (name: LandmarkName) => getLandmark(frame, name, model),
    getWorld: (name: LandmarkName) => getWorldLandmark(frame, name, model),
  };
}
