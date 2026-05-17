export default function AnalysisScreen({ progress, message }) {
  const percent = Math.round((progress || 0) * 100);

  return (
    <section className="screen analysis-screen" aria-live="polite">
      <div className="loading-card">
        <div className="spinner" aria-hidden="true" />
        <h2>Analyzing your swing</h2>
        <p>{message}</p>
        <div className="progress-track" aria-label={`Analysis ${percent}% complete`}>
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <span>{percent}%</span>
      </div>
    </section>
  );
}
