# GitHub Pages setup

## Basic setup

1. Open your GitHub repository settings.
2. Go to **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push your changes to the `main` branch.
5. Wait for the **Deploy to GitHub Pages** workflow to finish.
6. Open your Pages URL (for this repo: `https://Maximus555555.github.io/Golf/`).

## External resources used

GitHub Pages hosting is static. Camera access works over HTTPS, and analysis runs in the browser. The app still needs access to MediaPipe model/runtime files unless those files are self-hosted.

- SwingFix does **not** use paid APIs.
- SwingFix does **not** send video to OpenAI or a backend server.
- By default, SwingFix downloads MediaPipe WASM/runtime and pose model files from external URLs.
- To self-host these assets, place MediaPipe files in `/public/mediapipe/` and set:
  - `VITE_MEDIAPIPE_WASM_BASE=/Golf/mediapipe/wasm` (or `/mediapipe/wasm` outside GitHub Pages base path)
  - `VITE_MEDIAPIPE_MODEL_URL=/Golf/mediapipe/pose_landmarker_lite.task`

## GitHub Pages smoke-check checklist

1. Repo Settings → Pages → Source = GitHub Actions.
2. Push to `main`.
3. Open the **Actions** tab.
4. Confirm **Deploy to GitHub Pages** completed successfully.
5. Open `https://Maximus555555.github.io/Golf/`.
6. Confirm the page loads without a blank screen.
7. Confirm camera permission prompt appears on iPhone Safari.
8. Record a short test swing.
9. Confirm the results screen appears.
10. Confirm browser console has no missing asset errors.

GitHub Pages is public. Do not deploy raw reference videos, secrets, API keys, or private files.
