import { useMemo, useState } from 'react';
import { normalizeHeightInput } from '../lib/heightCalibration.js';

export default function LandingScreen({ onStart }) {
  const [heightUnit, setHeightUnit] = useState('imperial');
  const [feet, setFeet] = useState('5');
  const [inches, setInches] = useState('10');
  const [centimeters, setCentimeters] = useState('178');
  const [heightError, setHeightError] = useState('');

  const previewCalibration = useMemo(
    () => normalizeHeightInput({ unit: heightUnit, feet, inches, centimeters }),
    [centimeters, feet, heightUnit, inches],
  );

  const handleUseCalibration = () => {
    const normalized = normalizeHeightInput({ unit: heightUnit, feet, inches, centimeters });
    if (!normalized.enabled) {
      setHeightError(normalized.error || 'Enter a usable height or skip calibration.');
      return;
    }
    setHeightError('');
    onStart(normalized);
  };

  const handleSkip = () => {
    setHeightError('');
    onStart({ enabled: false, preferredUnit: heightUnit === 'cm' ? 'cm' : 'in' });
  };

  return (
    <section className="screen landing-screen">
      <div className="hero-card">
        <span className="pill">No login · No backend · 6 seconds</span>
        <h2>Optional measurement calibration</h2>
        <p>Enter your height to help SwingFix estimate real-world movement, like how many inches your head or hips moved. This is optional.</p>

        <div className="height-calibration-panel" aria-label="Optional height calibration">
          <div className="unit-toggle" role="group" aria-label="Height units">
            <button className={heightUnit === 'imperial' ? 'unit-option selected' : 'unit-option'} type="button" onClick={() => setHeightUnit('imperial')}>
              Feet + inches
            </button>
            <button className={heightUnit === 'cm' ? 'unit-option selected' : 'unit-option'} type="button" onClick={() => setHeightUnit('cm')}>
              Centimeters
            </button>
          </div>

          {heightUnit === 'imperial' ? (
            <div className="height-fields two-column">
              <label>
                <span>Feet</span>
                <input inputMode="numeric" pattern="[0-9]*" type="number" min="3" max="8" value={feet} onChange={(event) => setFeet(event.target.value)} />
              </label>
              <label>
                <span>Inches</span>
                <input inputMode="decimal" type="number" min="0" max="11" step="0.5" value={inches} onChange={(event) => setInches(event.target.value)} />
              </label>
            </div>
          ) : (
            <div className="height-fields">
              <label>
                <span>Centimeters</span>
                <input inputMode="decimal" type="number" min="90" max="245" step="0.5" value={centimeters} onChange={(event) => setCentimeters(event.target.value)} />
              </label>
            </div>
          )}

          {previewCalibration.enabled && (
            <p className="calibration-instruction">
              Start the video by standing straight and still for 1–2 seconds with your full body visible. Then perform your swing.
            </p>
          )}
          {heightError && <p className="error-message">{heightError}</p>}

          <div className="calibration-actions">
            <button className="primary-button" type="button" onClick={handleUseCalibration}>
              Use height calibration
            </button>
            <button className="secondary-button" type="button" onClick={handleSkip}>
              Skip and record without height
            </button>
          </div>
        </div>

        <ul className="instruction-list">
          <li>Place the phone sideways if possible.</li>
          <li>Capture your full body from head to shoes.</li>
          <li>Record from face-on or down-the-line.</li>
        </ul>
      </div>

      <div className="coach-note">
        SwingFix gives beginner feedback based on visible body movement. Measurements are estimates and not a replacement for a golf coach.
      </div>
    </section>
  );
}
