# SwingFix MVP

A mobile-first React + Vite web app for recording a short golf swing in iPhone Safari and returning beginner-friendly swing feedback from browser-based pose analysis.

## What it does

- Starts the rear camera first with `navigator.mediaDevices.getUserMedia`, then falls back to the default camera.
- Records a short swing video with the MediaRecorder API, capped at 6 seconds.
- Runs browser-side pose detection with MediaPipe Pose Landmarker through `@mediapipe/tasks-vision`.
- Applies beginner heuristic checks for head movement, posture loss, lead arm collapse, hip sway, and finish balance.
- Shows at most 3 feedback cards with what happened, why it matters, how to fix it, and a practice drill.
- Includes a replay section and a record-again flow.
- Requires no login, backend, paid API, YouTube integration, subscriptions, or native iOS code.

## Local development

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Camera access requires HTTPS on real mobile devices; localhost is accepted by most desktop browsers for development.

## Build

```bash
npm run build
```

The production build is written to `dist/`.

## Netlify

This repo includes `netlify.toml` configured with:

- Build command: `npm run build`
- Publish directory: `dist`
- SPA fallback to `index.html`

## Future developer-provided reference swings

Reference comparison is intentionally not user-facing in this MVP. Future reference swings should be committed by a developer under:

```text
public/reference-swings/
```

Metadata can be added in:

```text
src/data/referenceSwings.json
```

The placeholder modules in `src/lib/referenceSwingLoader.js`, `src/lib/referenceSwingAnalyzer.js`, and `src/lib/swingComparisonEngine.js` are prepared for future repo-local reference video analysis and comparison.
