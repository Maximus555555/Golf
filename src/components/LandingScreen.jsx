export default function LandingScreen({ onStart }) {
  return (
    <section className="screen landing-screen">
      <div className="hero-card">
        <span className="pill">No login · No backend · 6 seconds</span>
        <h2>Record a short golf swing.</h2>
        <p>Get beginner swing feedback based on visible body movement.</p>
        <ul className="instruction-list">
          <li>Place the phone sideways if possible.</li>
          <li>Capture your full body from head to shoes.</li>
          <li>Record from face-on or down-the-line.</li>
        </ul>
        <button className="primary-button" type="button" onClick={onStart}>
          Start Camera
        </button>
      </div>

      <div className="coach-note">
        SwingFix gives beginner feedback based on visible body movement. It is not a replacement for a golf coach.
      </div>
    </section>
  );
}
