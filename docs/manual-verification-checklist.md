# Manual verification checklist

1. Run `npm run build`.
2. Run `GITHUB_PAGES=true npm run build`.
3. Confirm `.github/workflows/deploy-pages.yml` exists.
4. Verify a face-on right-handed recording still analyzes.
5. Verify a face-on left-handed recording uses the right lead arm.
6. Verify the mirrored selfie toggle changes hip sway direction behavior.
7. Verify down-the-line recordings are not automatically rejected.
8. Verify down-the-line skips hip sway but can still return posture/lead-arm feedback.
9. Verify active setup buttons remain readable.
10. Verify poor recordings show recording guidance instead of fake swing flaws.
11. Verify results wording clearly states feedback is estimated.
