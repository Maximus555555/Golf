import FeedbackCard from './FeedbackCard.jsx';

export default function ResultsScreen({ analysis, replayUrl, onRecordAgain }) {
  const issues = analysis?.issues ?? [];
  const recordingQualityNotes = analysis?.recordingQualityNotes ?? [];
  const diagnostics = analysis?.diagnostics ?? {};
  const measurements = analysis?.measurements ?? [];
  const calibration = analysis?.calibration;
  const analyzedIssueCategories = diagnostics.analyzedIssueCategories ?? [];
  const showDebugPanel = import.meta.env.DEV && diagnostics.totalFramesSampled !== undefined;

  return (
    <section className="screen results-screen">
      <div className="results-header-card">
        <p className="eyebrow">Swing results</p>
        <h2>{issues.length ? 'Your top swing notes' : 'No major swing issue detected'}</h2>
        <p>{analysis?.summary}</p>
        {analysis?.fullFailure && (
          <p className="inline-warning">
            We could not read enough body landmarks from this recording. Try brighter light, a steady camera, and keeping more of your body in view.
          </p>
        )}
        {analysis?.error && <p className="debug-error">Debug detail: {analysis.error}</p>}
      </div>

      {replayUrl && (
        <div className="replay-card">
          <h3>Replay your swing</h3>
          <video src={replayUrl} controls playsInline className="replay-video" />
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
              <dt>Pose frames found</dt>
              <dd>{diagnostics.framesWithAnyPose}</dd>
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
              <dt>Head movement</dt>
              <dd>raw {diagnostics.rawMaxHeadMove?.toFixed?.(2) ?? 'n/a'} / used {diagnostics.percentileHeadMove?.toFixed?.(2) ?? 'n/a'}</dd>
            </div>
            <div>
              <dt>Posture rise</dt>
              <dd>raw {diagnostics.rawMaxPostureRise?.toFixed?.(2) ?? 'n/a'} / used {diagnostics.percentilePostureRise?.toFixed?.(2) ?? 'n/a'}</dd>
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
