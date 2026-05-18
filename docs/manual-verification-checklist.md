# Manual verification checklist

1. Run `npm run build`.
2. Run `GITHUB_PAGES=true npm run build`.
3. Confirm `.github/workflows/deploy-pages.yml` exists and builds `dist`.
4. Verify app loads correctly from `/Golf/`.
5. Verify camera opens on iPhone Safari.
6. Verify a face-on right-handed recording still analyzes.
7. Verify a face-on left-handed recording uses the right lead arm.
8. Verify mirrored selfie toggle persists after refresh.
9. Verify hip sway shows mirror reminder only when relevant.
10. Verify down-the-line recordings are not automatically rejected.
11. Verify down-the-line skips hip sway but can still return posture/lead-arm feedback.
12. Verify fallback pose detection warning appears when fallback was used.
13. Verify results wording clearly states feedback is estimated.
14. Verify no OpenAI API, backend, YouTube, scraping, database, or paid API was added.
