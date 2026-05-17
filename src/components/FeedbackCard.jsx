export default function FeedbackCard({ feedback, index }) {
  return (
    <article className={`feedback-card severity-${feedback.severity}`}>
      <div className="feedback-card__header">
        <span className="feedback-number">{index + 1}</span>
        <div>
          <p className="severity-label">{feedback.severity} priority</p>
          <h3>{feedback.title}</h3>
        </div>
      </div>
      <dl>
        <div>
          <dt>What happened</dt>
          <dd>{feedback.whatHappened}</dd>
        </div>
        <div>
          <dt>Why it matters</dt>
          <dd>{feedback.whyItMatters}</dd>
        </div>
        <div>
          <dt>How to fix it</dt>
          <dd>{feedback.howToFix}</dd>
        </div>
        <div>
          <dt>Practice drill</dt>
          <dd>{feedback.drill}</dd>
        </div>
      </dl>
    </article>
  );
}
