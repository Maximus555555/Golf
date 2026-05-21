import { useCallback, useEffect, useState } from 'react';
import LandingScreen from './components/LandingScreen.jsx';
import CameraRecorder from './components/CameraRecorder.jsx';
import AnalysisScreen from './components/AnalysisScreen.jsx';
import ResultsScreen from './components/ResultsScreen.jsx';
import { analyzeVideoBlob } from './lib/poseDetector.js';
import { analyzeSwing } from './lib/swingAnalyzer.js';
import { safeGetBooleanLocalStorage, safeGetLocalStorage, safeSetLocalStorage } from './lib/storage.js';

const SCREEN = {
  landing: 'landing',
  camera: 'camera',
  analyzing: 'analyzing',
  results: 'results',
};



function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

export default function App() {
  const [screen, setScreen] = useState(SCREEN.landing);
  const [recording, setRecording] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisMessage, setAnalysisMessage] = useState('Preparing your swing analysis...');
  const [heightCalibration, setHeightCalibration] = useState({ enabled: false, preferredUnit: 'in' });
  const [captureSetup, setCaptureSetup] = useState(() => ({
    view: safeGetLocalStorage('swingfix-view', 'face-on'),
    handedness: safeGetLocalStorage('swingfix-handedness', 'right'),
    isMirrored: safeGetBooleanLocalStorage('swingfix-is-mirrored', false),
    mirrorSettingConfirmed: safeGetBooleanLocalStorage('swingfix-mirror-confirmed', false),
  }));

  const [replayUrl, setReplayUrl] = useState(null);

  useEffect(() => {
    if (!recording?.blob) {
      setReplayUrl(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(recording.blob);
    setReplayUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [recording]);

  const handleStartCamera = useCallback((calibrationSetup) => {
    setHeightCalibration(calibrationSetup || { enabled: false, preferredUnit: 'in' });
    setScreen(SCREEN.camera);
  }, []);

  useEffect(() => {
    safeSetLocalStorage('swingfix-view', captureSetup.view);
    safeSetLocalStorage('swingfix-handedness', captureSetup.handedness);
    safeSetLocalStorage('swingfix-is-mirrored', String(Boolean(captureSetup.isMirrored)));
    safeSetLocalStorage('swingfix-mirror-confirmed', String(Boolean(captureSetup.mirrorSettingConfirmed)));
  }, [captureSetup]);

  const handleRecordingComplete = useCallback(async (recordedSwing) => {
    if (!recordedSwing?.blob) {
      setAnalysis({
        ...analyzeSwing([], { finalReason: 'missing-video-blob' }, { ...heightCalibration, ...captureSetup }),
        poseFrameCount: 0,
        error: 'No recorded video was found. Please record your swing again.',
        fullFailure: true,
      });
      setScreen(SCREEN.results);
      return;
    }

    setRecording(recordedSwing);
    setScreen(SCREEN.analyzing);
    setAnalysisProgress(0);
    setAnalysisMessage('Finding body landmarks in your swing...');

    try {
      const {
        timeline: poseTimeline,
        stats: poseStats,
        error: poseError,
      } = await withTimeout(
        analyzeVideoBlob(recordedSwing.blob, {
          onProgress: (progress) => setAnalysisProgress(progress),
        }),
        30000,
        'Pose analysis timed out. Try recording a shorter, clearer video.',
      );
      setAnalysisMessage('Checking beginner swing patterns...');
      const swingFeedback = analyzeSwing(poseTimeline, poseStats, { ...heightCalibration, ...captureSetup });
      setAnalysis({
        ...swingFeedback,
        poseFrameCount: poseTimeline.length,
        error: poseError instanceof Error ? poseError.message : poseError ? String(poseError) : null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Pose analysis was unavailable for this recording.';
      const fallbackFeedback = analyzeSwing([], { finalReason: errorMessage }, { ...heightCalibration, ...captureSetup });
      setAnalysis({
        ...fallbackFeedback,
        poseFrameCount: 0,
        error: errorMessage,
        fullFailure: true,
      });
    } finally {
      setScreen(SCREEN.results);
    }
  }, [captureSetup, heightCalibration]);

  const handleRecordAgain = useCallback(() => {
    setRecording(null);
    setAnalysis(null);
    setAnalysisProgress(0);
    setScreen(SCREEN.camera);
  }, []);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Mobile golf swing feedback</p>
          <h1>SwingFix MVP</h1>
        </div>
      </header>

      {screen === SCREEN.landing && <LandingScreen onStart={handleStartCamera} />}

      {screen === SCREEN.camera && (
        <CameraRecorder
          heightCalibration={heightCalibration}
          captureSetup={captureSetup}
          onCaptureSetupChange={setCaptureSetup}
          onBack={() => setScreen(SCREEN.landing)}
          onRecordingComplete={handleRecordingComplete}
        />
      )}

      {screen === SCREEN.analyzing && <AnalysisScreen progress={analysisProgress} message={analysisMessage} />}

      {screen === SCREEN.results && (
        <ResultsScreen analysis={analysis} replayUrl={replayUrl} onRecordAgain={handleRecordAgain} />
      )}
    </main>
  );
}
