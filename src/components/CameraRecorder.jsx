import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_RECORDING_MS = 6000;
const PRE_RECORDING_COUNTDOWN_STEPS = ['Ready', 'Set', 'Go!'];
const COUNTDOWN_STEP_MS = 1000;

function supportedMimeType() {
  if (!window.MediaRecorder) return '';
  const types = ['video/mp4', 'video/webm;codecs=h264', 'video/webm'];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export default function CameraRecorder({ heightCalibration, captureSetup, onCaptureSetupChange, onBack, onRecordingComplete }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const preRecordingCountdownRef = useRef(null);
  const preRecordingStartRef = useRef(null);
  const recordingStartedAtRef = useRef(null);
  const isMountedRef = useRef(false);
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MAX_RECORDING_MS / 1000);
  const [recordingSupported, setRecordingSupported] = useState(true);
  const [recordingPhasePrompt, setRecordingPhasePrompt] = useState('');
  const [cameraOptions, setCameraOptions] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => window.localStorage.getItem('swingfix-camera-device-id') || '');
  const [cameraSwitchError, setCameraSwitchError] = useState('');

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const enumerateCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter((d) => d.kind === "videoinput");
    setCameraOptions(videos.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` })));
  }, []);

  const startCamera = useCallback(async (deviceId) => {
    setCameraStatus('loading');
    setError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('error');
      setError('This browser does not support camera access. Open SwingFix in Safari or Chrome on a secure HTTPS site.');
      return;
    }

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }

      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRecordingSupported(Boolean(window.MediaRecorder));
      setCameraStatus('ready');
      await enumerateCameras();
    } catch (cameraError) {
      if (!isMountedRef.current) return;
      setCameraStatus('error');
      if (cameraError?.name === 'NotAllowedError' || cameraError?.name === 'SecurityError') {
        setError('Camera permission was denied. Allow camera access in Safari settings, then try again.');
      } else if (cameraError?.name === 'NotFoundError') {
        setError('No camera was found on this device.');
      } else {
        setError('The camera could not be started. Check permissions and make sure this page is opened over HTTPS.');
      }
    }
  }, [enumerateCameras]);

  useEffect(() => {
    isMountedRef.current = true;
    stopStream();
    startCamera(selectedDeviceId);
    return () => {
      isMountedRef.current = false;
      window.clearTimeout(timerRef.current);
      window.clearInterval(countdownRef.current);
      window.clearInterval(preRecordingCountdownRef.current);
      stopStream();
    };
  }, [selectedDeviceId, startCamera, stopStream]);

  useEffect(() => {
    let animationFrame;
    const drawOverlay = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'rgba(179, 255, 211, 0.55)';
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([10 * dpr, 10 * dpr]);
        ctx.strokeRect(canvas.width * 0.18, canvas.height * 0.12, canvas.width * 0.64, canvas.height * 0.76);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
        ctx.font = `${12 * dpr}px system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText('Keep full body inside the guide', canvas.width / 2, canvas.height * 0.08);
      }
      animationFrame = requestAnimationFrame(drawOverlay);
    };
    drawOverlay();
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const stopRecording = useCallback(() => {
    window.clearTimeout(timerRef.current);
    window.clearInterval(countdownRef.current);
    window.clearInterval(preRecordingCountdownRef.current);
    setIsCountingDown(false);
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    } else {
      setRecordingPhasePrompt('');
    }
  }, [enumerateCameras, selectedDeviceId]);

  const beginRecording = useCallback(() => {
    if (!streamRef.current || !window.MediaRecorder) {
      setRecordingSupported(false);
      setError('Video recording is not supported in this browser. Try the latest iPhone Safari or Chrome.');
      return;
    }

    chunksRef.current = [];
    setError('');
    setSecondsLeft(MAX_RECORDING_MS / 1000);
    setRecordingPhasePrompt(heightCalibration?.enabled ? 'Stand still for calibration' : 'Get ready');
    const mimeType = supportedMimeType();
    let recorder;
    try {
      recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    } catch {
      setRecordingSupported(false);
      setError('Video recording could not start in this browser. Try the latest iPhone Safari or Chrome.');
      return;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data);
    };

    recorder.onerror = () => {
      window.clearTimeout(timerRef.current);
      window.clearInterval(countdownRef.current);
      window.clearInterval(preRecordingCountdownRef.current);
      setIsRecording(false);
      setRecordingPhasePrompt('');
      setError('Recording stopped unexpectedly. Please try recording again.');
    };

    recorder.onstop = () => {
      setIsRecording(false);
      setRecordingPhasePrompt('');
      const fallbackType = chunksRef.current.find((chunk) => chunk.type)?.type || '';
      const blob = new Blob(chunksRef.current, { type: mimeType || fallbackType });
      if (!blob.size) {
        setError('No video was captured. Please try again and keep the camera open until recording stops.');
        return;
      }
      stopStream();
      const actualDurationMs = recordingStartedAtRef.current ? Math.min(MAX_RECORDING_MS, Date.now() - recordingStartedAtRef.current) : MAX_RECORDING_MS;
      recordingStartedAtRef.current = null;
      onRecordingComplete({ blob, mimeType: blob.type, durationMs: actualDurationMs });
    };

    try {
      recorder.start(250);
    } catch {
      recorderRef.current = null;
      setError('Video recording could not start. Please restart the camera and try again.');
      return;
    }
    setIsRecording(true);
    timerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
    const recordingStartedAt = Date.now();
    recordingStartedAtRef.current = recordingStartedAt;
    countdownRef.current = window.setInterval(() => {
      const elapsedMs = Date.now() - recordingStartedAt;
      setSecondsLeft(Math.max(0, Math.ceil((MAX_RECORDING_MS - elapsedMs) / 1000)));
      if (heightCalibration?.enabled) {
        if (elapsedMs < 1800) setRecordingPhasePrompt('Stand still for calibration');
        else if (elapsedMs < 2500) setRecordingPhasePrompt('Get ready');
        else setRecordingPhasePrompt('Swing');
      } else if (elapsedMs < 750) {
        setRecordingPhasePrompt('Get ready');
      } else {
        setRecordingPhasePrompt('Swing');
      }
    }, 250);
  }, [heightCalibration?.enabled, onRecordingComplete, stopRecording, stopStream]);


  const handleCameraChange = useCallback((event) => {
    const nextId = event.target.value;
    setSelectedDeviceId(nextId);
    window.localStorage.setItem('swingfix-camera-device-id', nextId);
    setCameraSwitchError('');
  }, []);

  const startRecording = useCallback(() => {
    if (isCountingDown || isRecording) return;
    if (!streamRef.current || !window.MediaRecorder) {
      setRecordingSupported(false);
      setError('Video recording is not supported in this browser. Try the latest iPhone Safari or Chrome.');
      return;
    }

    window.clearInterval(preRecordingCountdownRef.current);
    setError('');
    setIsCountingDown(true);
    setRecordingPhasePrompt(PRE_RECORDING_COUNTDOWN_STEPS[0]);
    preRecordingStartRef.current = Date.now();

    preRecordingCountdownRef.current = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - preRecordingStartRef.current) / COUNTDOWN_STEP_MS);
      const countdownPrompt = PRE_RECORDING_COUNTDOWN_STEPS[Math.min(elapsedSeconds, PRE_RECORDING_COUNTDOWN_STEPS.length - 1)];
      setRecordingPhasePrompt(countdownPrompt);

      if (elapsedSeconds >= PRE_RECORDING_COUNTDOWN_STEPS.length) {
        window.clearInterval(preRecordingCountdownRef.current);
        setIsCountingDown(false);
        beginRecording();
      }
    }, 100);
  }, [beginRecording, isCountingDown, isRecording]);

  return (
    <section className="screen camera-screen">
      <div className="camera-card">
        <div className="video-frame">
          <video ref={videoRef} className="camera-preview" muted playsInline autoPlay />
          <canvas ref={canvasRef} className="pose-overlay" aria-hidden="true" />
          {isRecording && <div className="recording-badge">Recording · {secondsLeft}s</div>}
          {isCountingDown && <div className="recording-badge">Recording starts soon</div>}
          {(isRecording || isCountingDown) && recordingPhasePrompt && <div className="recording-phase-prompt">{recordingPhasePrompt}</div>}
        </div>

        {heightCalibration?.enabled && (
          <p className="calibration-camera-instruction">After Ready, Set, Go!, stand straight for height calibration, then swing.</p>
        )}
        
        <div className="setup-card"> 
          <p><strong>Record from the correct angle with your full body visible.</strong></p>
          <p>{captureSetup?.view === 'down-the-line'
            ? 'Place the phone behind your hands, looking toward the target, with your full body and club visible.'
            : 'Place the phone in front of you, with your full body and club visible.'}</p>
          <label>Camera
            {cameraOptions.length > 1 && (
              <select value={selectedDeviceId} onChange={handleCameraChange} className="camera-select">
                <option value="">Default</option>
                {cameraOptions.map((camera) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label}</option>)}
              </select>
            )}
          </label>
          <div className="setup-option-group" role="group" aria-label="Camera view">
            <p className="setup-option-title">Camera view</p>
            <div className="toggle-row">
              <button
                type="button"
                className={`setup-option-button ${captureSetup?.view === 'face-on' ? 'active' : ''}`}
                aria-pressed={captureSetup?.view === 'face-on'}
                onClick={() => onCaptureSetupChange({ ...captureSetup, view: 'face-on' })}
              >
                Face-on
              </button>
              <button
                type="button"
                className={`setup-option-button ${captureSetup?.view === 'down-the-line' ? 'active' : ''}`}
                aria-pressed={captureSetup?.view === 'down-the-line'}
                onClick={() => onCaptureSetupChange({ ...captureSetup, view: 'down-the-line' })}
              >
                Down-the-line
              </button>
            </div>
          </div>
          <div className="setup-option-group" role="group" aria-label="Handedness">
            <p className="setup-option-title">Handedness</p>
            <div className="toggle-row">
              <button
                type="button"
                className={`setup-option-button ${captureSetup?.handedness === 'right' ? 'active' : ''}`}
                aria-pressed={captureSetup?.handedness === 'right'}
                onClick={() => onCaptureSetupChange({ ...captureSetup, handedness: 'right' })}
              >
                Right-handed
              </button>
              <button
                type="button"
                className={`setup-option-button ${captureSetup?.handedness === 'left' ? 'active' : ''}`}
                aria-pressed={captureSetup?.handedness === 'left'}
                onClick={() => onCaptureSetupChange({ ...captureSetup, handedness: 'left' })}
              >
                Left-handed
              </button>
            </div>
          </div>
          <div className="setup-option-group">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(captureSetup?.isMirrored)}
                onChange={(event) => onCaptureSetupChange({ ...captureSetup, isMirrored: event.target.checked })}
              />
              <span>Mirrored selfie view</span>
            </label>
            <p className="setup-helper-text">Turn this on if the preview looks mirrored like a selfie camera.</p>
          </div>
          {cameraSwitchError && <p className="error-message">{cameraSwitchError}</p>}
        </div>

        {cameraStatus === 'loading' && <p className="status-message">Starting camera...</p>}
        {error && <p className="error-message">{error}</p>}
        {!recordingSupported && (
          <p className="error-message">This browser cannot record video with MediaRecorder. Camera preview may work, but swing capture is unavailable.</p>
        )}

        <div className="camera-actions">
          <button className="secondary-button" type="button" onClick={onBack} disabled={isRecording || isCountingDown}>
            Back
          </button>
          {!isRecording ? (
            <button
              className="primary-button"
              type="button"
              onClick={startRecording}
              disabled={cameraStatus !== 'ready' || !recordingSupported || isCountingDown}
            >
              {isCountingDown ? 'Get Ready...' : 'Record Swing'}
            </button>
          ) : (
            <button className="stop-button" type="button" onClick={stopRecording}>
              Stop Early
            </button>
          )}
        </div>
      </div>

      <div className="tips-card">
        <h2>Quick setup tips</h2>
        <p>Use bright light, keep the phone steady, and make one smooth swing inside the guide.</p>
        {heightCalibration?.enabled && (
          <p>For estimated measurements, start the video standing straight and still with your full body visible.</p>
        )}
      </div>
    </section>
  );
}
