import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSwing } from '../src/lib/swingAnalyzer.js';

const landmarkIndexes = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  leftWrist: 15,
  leftHip: 23,
  rightHip: 24,
  leftAnkle: 27,
  rightAnkle: 28,
};

function landmark(x, y) {
  return { x, y, z: 0, visibility: 0.99 };
}

function makeFrame(overrides = {}) {
  const landmarks = Array.from({ length: 33 }, () => landmark(0.5, 0.5));
  const defaults = {
    [landmarkIndexes.nose]: landmark(0.5, 0.16),
    [landmarkIndexes.leftShoulder]: landmark(0.38, 0.34),
    [landmarkIndexes.rightShoulder]: landmark(0.62, 0.34),
    [landmarkIndexes.leftElbow]: landmark(0.34, 0.46),
    [landmarkIndexes.leftWrist]: landmark(0.3, 0.58),
    [landmarkIndexes.leftHip]: landmark(0.42, 0.58),
    [landmarkIndexes.rightHip]: landmark(0.58, 0.58),
    [landmarkIndexes.leftAnkle]: landmark(0.4, 0.9),
    [landmarkIndexes.rightAnkle]: landmark(0.6, 0.9),
  };

  Object.entries({ ...defaults, ...overrides }).forEach(([index, value]) => {
    landmarks[Number(index)] = value;
  });

  return { landmarks };
}

test('analyzeSwing reports a full failure when no pose frames are available', () => {
  const result = analyzeSwing([], {
    totalFramesSampled: 20,
    framesWherePoseDetectionRan: 20,
    framesWithAnyPose: 0,
    framesWithCoreLandmarks: 0,
  });

  assert.equal(result.fullFailure, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.recordingQualityNotes[0].code, 'too_few_usable_frames');
});

test('analyzeSwing preserves usable recordings and ranks detected swing issues', () => {
  const timeline = Array.from({ length: 20 }, (_, index) => {
    const progress = index / 19;
    return makeFrame({
      [landmarkIndexes.nose]: landmark(0.5 + progress * 0.2, 0.16),
      [landmarkIndexes.leftHip]: landmark(0.42 + progress * 0.12, 0.58),
      [landmarkIndexes.rightHip]: landmark(0.58 + progress * 0.12, 0.58),
    });
  });

  const result = analyzeSwing(timeline, {
    totalFramesSampled: 20,
    framesWherePoseDetectionRan: 20,
    framesWithAnyPose: 20,
    framesWithCoreLandmarks: 20,
  });

  assert.equal(result.fullFailure, false);
  assert.ok(result.issues.length > 0);
  assert.ok(result.issues.length <= 3);
  assert.ok(result.diagnostics.analyzableFrameCounts.headMovement >= 20);
});
