import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_RECORDING_MS = 6000;

function supportedMimeType() {
  if (!window.MediaRecorder) return '';
  const types = ['video/mp4', 'video/webm;codecs=h264', 'video/webm'];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export default function CameraRecorder({ onBack, onRecordingComplete }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const countdownRef = useRef(null);
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(6);
  const [recordingSupported, setRecordingSupported] = useState(true);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
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
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRecordingSupported(Boolean(window.MediaRecorder));
      setCameraStatus('ready');
    } catch (cameraError) {
      setCameraStatus('error');
      if (cameraError?.name === 'NotAllowedError' || cameraError?.name === 'SecurityError') {
        setError('Camera permission was denied. Allow camera access in Safari settings, then try again.');
      } else if (cameraError?.name === 'NotFoundError') {
        setError('No camera was found on this device.');
      } else {
        setError('The camera could not be started. Check permissions and make sure this page is opened over HTTPS.');
      }
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      window.clearTimeout(timerRef.current);
      window.clearInterval(countdownRef.current);
      stopStream();
    };
  }, [startCamera, stopStream]);

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
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current || !window.MediaRecorder) {
      setRecordingSupported(false);
      setError('Video recording is not supported in this browser. Try the latest iPhone Safari or Chrome.');
      return;
    }

    chunksRef.current = [];
    setError('');
    setSecondsLeft(6);
    const mimeType = supportedMimeType();
    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunksRef.current.push(event.data);
    };

    recorder.onerror = () => {
      setIsRecording(false);
      setError('Recording stopped unexpectedly. Please try recording again.');
    };

    recorder.onstop = () => {
      setIsRecording(false);
      const fallbackType = chunksRef.current.find((chunk) => chunk.type)?.type || '';
      const blob = new Blob(chunksRef.current, { type: mimeType || fallbackType });
      if (!blob.size) {
        setError('No video was captured. Please try again and keep the camera open until recording stops.');
        return;
      }
      stopStream();
      onRecordingComplete({ blob, mimeType: blob.type, durationMs: MAX_RECORDING_MS });
    };

    recorder.start(250);
    setIsRecording(true);
    timerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
    countdownRef.current = window.setInterval(() => {
      setSecondsLeft((value) => Math.max(0, value - 1));
    }, 1000);
  }, [onRecordingComplete, stopRecording, stopStream]);

  return (
    <section className="screen camera-screen">
      <div className="camera-card">
        <div className="video-frame">
          <video ref={videoRef} className="camera-preview" muted playsInline autoPlay />
          <canvas ref={canvasRef} className="pose-overlay" aria-hidden="true" />
          {isRecording && <div className="recording-badge">Recording · {secondsLeft}s</div>}
        </div>

        {cameraStatus === 'loading' && <p className="status-message">Starting camera...</p>}
        {error && <p className="error-message">{error}</p>}
        {!recordingSupported && (
          <p className="error-message">This browser cannot record video with MediaRecorder. Camera preview may work, but swing capture is unavailable.</p>
        )}

        <div className="camera-actions">
          <button className="secondary-button" type="button" onClick={onBack} disabled={isRecording}>
            Back
          </button>
          {!isRecording ? (
            <button
              className="primary-button"
              type="button"
              onClick={startRecording}
              disabled={cameraStatus !== 'ready' || !recordingSupported}
            >
              Record Swing
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
      </div>
    </section>
  );
}
