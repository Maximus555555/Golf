import { useEffect, useRef, useState } from 'react';
import FeedbackCard from './FeedbackCard.jsx';

export default function ResultsScreen({ analysis, replayUrl, onRecordAgain }) {
  const [selectedSpeed, setSelectedSpeed] = useState(1);
  const replayVideoRef = useRef(null);
  const issues = analysis?.issues ?? [];
  const recordingQualityNotes = analysis?.recordingQualityNotes ?? [];
  const diagnostics = analysis?.diagnostics ?? {};
  const measurements = analysis?.measurements ?? [];
  const calibration = analysis?.calibration;
  const analyzedIssueCategories = diagnostics.analyzedIssueCategories ?? [];
  const showDebugPanel = import.meta.env.DEV && diagnostics.totalFramesSampled !== undefined;
  const resultsTitle = analysis?.fullFailure
    ? 'Recording needs another try'
    : issues.length
      ? 'Your top swing notes'
      : 'No major swing issue detected';

  useEffect(() => {
    const replayVideo = replayVideoRef.current;
    if (!replayVideo) return;
    replayVideo.playbackRate = selectedSpeed;
  }, [selectedSpeed]);

  const handleReplayMetadataLoaded = () => {
    if (!replayVideoRef.current) return;
    replayVideoRef.current.playbackRate = selectedSpeed;
  };

  const handleReplayPlay = () => {
    if (!replayVideoRef.current) return;
    replayVideoRef.current.playbackRate = selectedSpeed;
  };

  return (
    <section className="screen results-screen">
      <div className="results-header-card">
        <p className="eyebrow">Swing results</p>
        <h2>{resultsTitle}</h2>
        <p>{analysis?.summary}</p>
        <p className="measurement-warning">
          SwingFix uses phone-video pose tracking, so feedback is an estimate. For best results, record from a stable, well-lit angle with your full body visible.
        </p>
        {analysis?.fullFailure && (
          <p className="inline-warning">
            We could not read enough body landmarks from this recording. Try brighter light, a steady camera, and keeping more of your body in view.
          </p>
        )}
        {!analysis?.fullFailure && diagnostics.framesWithRawLandmarks > 0 && (diagnostics.framesWithAnyVisiblePose || 0) < Math.max(8, Math.round((diagnostics.totalFramesSampled || 0) * 0.2)) && (
          <p className="inline-warning">
            Pose landmarks were found, but confidence was low. Move the phone closer, keep the full body visible, and avoid motion blur.
          </p>
        )}
        {!analysis?.fullFailure && (diagnostics.framesWithRawLandmarks || 0) === 0 && diagnostics.totalFramesSampled > 0 && (
          <p className="inline-warning">
            The pose model did not find a body in the sampled frames. Try recording from farther back with your whole body visible.
          </p>
        )}
        {showDebugPanel && analysis?.error && <p className="debug-error">Debug detail: {analysis.error}</p>}
      </div>

      {replayUrl && (
        <div className="replay-card">
          <h3>Replay your swing</h3>
          <video
            ref={replayVideoRef}
            src={replayUrl}
            controls
            playsInline
            className="replay-video"
            onLoadedMetadata={handleReplayMetadataLoaded}
            onPlay={handleReplayPlay}
          />
          <div className="replay-speed" aria-label="Replay speed controls">
            <p className="replay-speed__title">Replay speed</p>
            <div className="replay-speed__buttons" role="group" aria-label="Replay speed">
              {[1, 0.5, 0.25].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className={`speed-button${selectedSpeed === speed ? ' active' : ''}`}
                  onClick={() => setSelectedSpeed(speed)}
                  aria-pressed={selectedSpeed === speed}
                >
                  {speed}x
                </button>
              ))}
            </div>
            <p className="replay-speed__help">Use slow motion to review your setup, backswing, and finish.</p>
          </div>
        </div>
      )}


      <section className="results-section" aria-labelledby="estimated-measurements-heading">
        <div className="section-heading-row">
          <p className="eyebrow">Measured swing summary</p>
          <h3 id="estimated-measurements-heading">Estimated measurements</h3>
        </div>
        <div className="measurements-card">
          <p className="measurement-warning">
            These measurements are estimates based on camera view, visible body landmarks, and any opening standing calibration. They are not professional biomechanics measurements.
          </p>
          {calibration?.enabled && calibration.status !== 'skipped' && (
            <div className={`calibration-status ${calibration.status}`}>
              <span>Calibration quality: {capitalize(calibration.status)}</span>
              <small>{calibration.message}</small>
            </div>
          )}
          <div className="measurement-list">
            {measurements.length ? (
              measurements.map((measurement) => (
                <div className="measurement-row" key={measurement.id}>
                  <div>
                    <strong>{measurement.label}</strong>
                    {measurement.bodyRelativeValue && measurement.bodyRelativeValue !== measurement.value && (
                      <span>{measurement.bodyRelativeValue}</span>
                    )}
                  </div>
                  <div>
                    <b>{measurement.value}</b>
                    <span>Tracking confidence: {measurement.reliability}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-note">Not enough reliable data for estimated measurements.</p>
            )}
          </div>
        </div>
      </section>

      {showDebugPanel && (
        <aside className="analysis-debug-panel" aria-label="Analysis debug stats">
          <p className="eyebrow">Dev debug</p>
          <dl>
            <div>
              <dt>Frames sampled</dt>
              <dd>{diagnostics.totalFramesSampled}</dd>
            </div>
            <div>
              <dt>Video dimensions</dt>
              <dd>{diagnostics.videoDimensions?.width && diagnostics.videoDimensions?.height ? `${diagnostics.videoDimensions.width}×${diagnostics.videoDimensions.height}` : 'n/a'}</dd>
            </div>
            <div>
              <dt>Raw landmarks frames</dt>
              <dd>{diagnostics.framesWithRawLandmarks ?? 0}</dd>
            </div>
            <div>
              <dt>Person-like pose frames</dt>
              <dd>{diagnostics.framesWithAnyPersonLikePose ?? diagnostics.framesWithAnyPose ?? 0}</dd>
            </div>
            <div>
              <dt>Pose frames found</dt>
              <dd>{diagnostics.framesWithAnyVisiblePose ?? diagnostics.framesWithAnyPose}</dd>
            </div>
            <div>
              <dt>Fallback frames</dt>
              <dd>{diagnostics.framesUsingFallback ?? 0} ({Math.round((diagnostics.fallbackFrameRatio || 0) * 100)}%)</dd>
            </div>
            <div>
              <dt>Final reason</dt>
              <dd>{diagnostics.finalReason ?? diagnostics.reason ?? 'n/a'}</dd>
            </div>
            <div>
              <dt>Analyzable categories</dt>
              <dd>{Object.values(diagnostics.analyzability || {}).filter((category) => category.analyzable).length}</dd>
            </div>
            <div>
              <dt>Usable percentage</dt>
              <dd>{Math.round((diagnostics.usableFramePercentage || 0) * 100)}%</dd>
            </div>
            <div>
              <dt>Stable body scale</dt>
              <dd>{diagnostics.stableBodyScale?.scale?.toFixed?.(3) ?? 'n/a'}</dd>
            </div>
            <div>
              <dt>Scale source</dt>
              <dd>{diagnostics.stableBodyScale?.source ?? 'n/a'}</dd>
            </div>
            <div>
              <dt>Outlier frames removed</dt>
              <dd>{diagnostics.outlierFramesRemoved ?? 0}</dd>
            </div>
            <div>
              <dt>Calibration frames excluded</dt>
              <dd>{diagnostics.phaseDetection?.calibrationFramesExcluded ? 'yes' : 'no'}</dd>
            </div>
            <div>
              <dt>Swing start detected</dt>
              <dd>{formatFrameTime(diagnostics.phaseDetection?.swingStartFrame, diagnostics.phaseDetection?.swingStartTimeMs)}</dd>
            </div>
            <div>
              <dt>Setup frames used</dt>
              <dd>{formatRange(diagnostics.phaseDetection?.setupFrameRange)}</dd>
            </div>
            <div>
              <dt>Swing frames used</dt>
              <dd>{formatRange(diagnostics.phaseDetection?.swingFrameRange)}</dd>
            </div>
            <div>
              <dt>Head movement</dt>
              <dd>raw {diagnostics.rawMaxHeadMove?.toFixed?.(2) ?? 'n/a'} / used {diagnostics.percentileHeadMove?.toFixed?.(2) ?? 'n/a'}</dd>
            </div>
            <div>
              <dt>Posture change</dt>
              <dd>raw {diagnostics.rawMaxPostureRise?.toFixed?.(2) ?? 'n/a'} / score {diagnostics.postureChangeScore?.toFixed?.(2) ?? 'n/a'} / {diagnostics.postureDiagnostics?.changeType ?? diagnostics.postureDiagnostics?.reason ?? 'n/a'}</dd>
            </div>
            <div>
              <dt>Lead arm angle</dt>
              <dd>raw {diagnostics.rawMinLeadArmAngle?.toFixed?.(0) ?? 'n/a'}° / used {diagnostics.percentileLeadArmAngle?.toFixed?.(0) ?? 'n/a'}°</dd>
            </div>
            <div>
              <dt>Clamped/discarded</dt>
              <dd>{diagnostics.clampedOrDiscarded?.length ? diagnostics.clampedOrDiscarded.join(', ') : 'none'}</dd>
            </div>
          </dl>
        </aside>
      )}

      <section className="results-section" aria-labelledby="swing-feedback-heading">
        <div className="section-heading-row">
          <p className="eyebrow">Swing feedback</p>
          <h3 id="swing-feedback-heading">Top movement issues</h3>
        </div>
        {issues.length ? (
          <div className="feedback-list">
            {issues.map((issue, index) => (
              <FeedbackCard key={issue.id} feedback={issue} index={index} />
            ))}
          </div>
        ) : analyzedIssueCategories.length ? (
          <p className="empty-note">
            No major swing flaw was detected in the visible categories analyzed: {analyzedIssueCategories.map(({ label }) => label).join(', ')}.
          </p>
        ) : (
          <p className="empty-note">No swing flaws are shown unless the app can see enough body movement to support them.</p>
        )}
      </section>

      <section className="results-section" aria-labelledby="recording-quality-heading">
        <div className="section-heading-row">
          <p className="eyebrow">Recording quality notes</p>
          <h3 id="recording-quality-heading">Video setup</h3>
        </div>
        {recordingQualityNotes.length ? (
          <ul className="recording-quality-list">
            {recordingQualityNotes.map((note) => (
              <li key={note.code}>{note.message}</li>
            ))}
          </ul>
        ) : (
          <p className="empty-note">The video quality looked usable for basic movement feedback.</p>
        )}
      </section>

      <div className="coach-note">
        SwingFix gives beginner feedback based on visible body movement. It is not a replacement for a golf coach.
      </div>

      <button className="primary-button sticky-action" type="button" onClick={onRecordAgain}>
        Record Again
      </button>
    </section>
  );
}

function capitalize(value) {
  if (!value) return 'Skipped';
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatRange(range) {
  if (!range) return 'n/a';
  return `frames ${range.start}–${range.end} (${range.count})`;
}

function formatFrameTime(frame, timeMs) {
  if (frame === null || frame === undefined) return 'n/a';
  const timeLabel = Number.isFinite(timeMs) ? ` / ${(timeMs / 1000).toFixed(1)}s` : '';
  return `frame ${frame}${timeLabel}`;
}
