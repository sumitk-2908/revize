# Deployment

> **Deployment certainty:** Statements marked **Detected** are supported directly by repository configuration or source. Statements marked **Likely** are deployment recommendations inferred from existing URLs and integration points, not guaranteed infrastructure.

## Supabase — Detected

Supabase is directly represented by the migrations, local configuration, Auth clients, RLS policies, Realtime usage, and seed data. For a hosted project:

1. Create a Supabase project.
2. Apply the files under `supabase/migrations/` using the Supabase CLI or your migration workflow.
3. Configure Auth providers and redirect URLs for the frontend, including email/password and Google OAuth if used.
4. Configure TOTP MFA for administrator accounts.
5. Set the hosted Supabase URL and anon/server keys in the corresponding frontend and backend environments.
6. Review RLS and admin policies before exposing the project publicly.

## Cloudflare R2 — Detected

FastAPI uses the S3-compatible R2 API for uploaded files and thumbnails. Create a bucket and a scoped R2 API token, configure a public/custom file URL, and set all five `R2_*` variables. The backend enforces a per-type upload limit (75 MB at the highest) and avoids deleting URLs that are outside the configured R2 public domain, which protects legacy Supabase Storage URLs.

## FastAPI host — Likely Render-compatible

The backend contains comments referencing Render and CORS/CSP allowlists containing Render URLs. This is a deployment signal, not a repository-provided deployment manifest. A compatible host should:

1. Install `backend/requirements.txt`.
2. Expose the required backend variables.
3. Run `uvicorn app.main:app --host 0.0.0.0 --port $PORT` or the host's equivalent start command.
4. Permit the deployed frontend origin in `CORS_ORIGINS`.
5. Verify `/health` after deployment.

## Next.js host — Likely Vercel-compatible

The frontend contains detected Vercel production/preview URLs and is compatible with a standard Next.js deployment. Configure the frontend environment variables in the hosting provider, run `npm run build`, and verify that the deployed API URL, Supabase redirect URLs, CSP origins, sitemap, PWA assets, and OAuth callbacks match the deployment domains.

The GitHub Actions workflow currently validates frontend lint/build and backend Python compilation; it does not itself deploy the application, run Pytest, or run Playwright.

## Related documentation

- [Environment variables](ENV_VARS.md)
- [Security and Operations](SECURITY.md)
- [Testing](TESTING.md)
