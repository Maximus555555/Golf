import FeedbackCard from './FeedbackCard.jsx';

export default function ResultsScreen({ analysis, replayUrl, onRecordAgain }) {
  const issues = analysis?.issues ?? [];
  const recordingQualityNotes = analysis?.recordingQualityNotes ?? [];
  const diagnostics = analysis?.diagnostics ?? {};
  const showDebugPanel = import.meta.env.DEV && diagnostics.totalFramesSampled !== undefined;

  return (
    <section className="screen results-screen">
      <div className="results-header-card">
        <p className="eyebrow">Swing results</p>
        <h2>{issues.length ? 'Your top swing notes' : 'No major swing issue detected'}</h2>
        <p>{analysis?.summary}</p>
        {analysis?.fullFailure && (
          <p className="inline-warning">
            We could not read enough body landmarks from this recording. Try brighter light, a steady camera, and a full-body view.
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
              <dt>Core frames found</dt>
              <dd>{diagnostics.framesWithCoreLandmarks}</dd>
            </div>
            <div>
              <dt>Usable percentage</dt>
              <dd>{Math.round((diagnostics.usableFramePercentage || 0) * 100)}%</dd>
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
