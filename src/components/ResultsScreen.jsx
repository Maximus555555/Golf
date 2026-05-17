import FeedbackCard from './FeedbackCard.jsx';

export default function ResultsScreen({ analysis, replayUrl, onRecordAgain }) {
  const issues = analysis?.issues ?? [];

  return (
    <section className="screen results-screen">
      <div className="results-header-card">
        <p className="eyebrow">Swing results</p>
        <h2>{issues.length ? 'Your top swing notes' : 'No major issue detected'}</h2>
        <p>{analysis?.summary}</p>
        {analysis?.error && (
          <p className="inline-warning">
            We could not read enough body landmarks from this recording. Try brighter light, a steady camera, and a full-body view.
          </p>
        )}
      </div>

      {replayUrl && (
        <div className="replay-card">
          <h3>Replay your swing</h3>
          <video src={replayUrl} controls playsInline className="replay-video" />
        </div>
      )}

      <div className="feedback-list">
        {issues.map((issue, index) => (
          <FeedbackCard key={issue.id} feedback={issue} index={index} />
        ))}
      </div>

      <div className="coach-note">
        SwingFix gives beginner feedback based on visible body movement. It is not a replacement for a golf coach.
      </div>

      <button className="primary-button sticky-action" type="button" onClick={onRecordAgain}>
        Record Again
      </button>
    </section>
  );
}
