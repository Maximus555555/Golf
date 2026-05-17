import { useCallback, useEffect, useState } from 'react';
import LandingScreen from './components/LandingScreen.jsx';
import CameraRecorder from './components/CameraRecorder.jsx';
import AnalysisScreen from './components/AnalysisScreen.jsx';
import ResultsScreen from './components/ResultsScreen.jsx';
import { analyzeVideoBlob } from './lib/poseDetector.js';
import { analyzeSwing } from './lib/swingAnalyzer.js';

const SCREEN = {
  landing: 'landing',
  camera: 'camera',
  analyzing: 'analyzing',
  results: 'results',
};

export default function App() {
  const [screen, setScreen] = useState(SCREEN.landing);
  const [recording, setRecording] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisMessage, setAnalysisMessage] = useState('Preparing your swing analysis...');

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

  const handleStartCamera = useCallback(() => {
    setScreen(SCREEN.camera);
  }, []);

  const handleRecordingComplete = useCallback(async (recordedSwing) => {
    setRecording(recordedSwing);
    setScreen(SCREEN.analyzing);
    setAnalysisProgress(0);
    setAnalysisMessage('Finding body landmarks in your swing...');

    try {
      const { timeline: poseTimeline, stats: poseStats } = await analyzeVideoBlob(recordedSwing.blob, {
        onProgress: (progress) => setAnalysisProgress(progress),
      });
      setAnalysisMessage('Checking beginner swing patterns...');
      const swingFeedback = analyzeSwing(poseTimeline, poseStats);
      setAnalysis({ ...swingFeedback, poseFrameCount: poseTimeline.length, error: null });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Pose analysis was unavailable for this recording.';
      const fallbackFeedback = analyzeSwing([], { finalReason: errorMessage });
      setAnalysis({
        ...fallbackFeedback,
        poseFrameCount: 0,
        error: errorMessage,
        fullFailure: true,
      });
    } finally {
      setScreen(SCREEN.results);
    }
  }, []);

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
        <CameraRecorder onBack={() => setScreen(SCREEN.landing)} onRecordingComplete={handleRecordingComplete} />
      )}

      {screen === SCREEN.analyzing && <AnalysisScreen progress={analysisProgress} message={analysisMessage} />}

      {screen === SCREEN.results && (
        <ResultsScreen analysis={analysis} replayUrl={replayUrl} onRecordAgain={handleRecordAgain} />
      )}
    </main>
  );
}
