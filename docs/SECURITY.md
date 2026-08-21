# Security and Operations

- Supabase RLS is the database-level boundary for user-owned data and public/approved resource access.
- FastAPI validates Supabase bearer tokens through the Supabase Auth user endpoint.
- Administrative actions require both an entry in the `admins` table and an AAL2 JWT from TOTP MFA.
- Uploads validate the extension against a server-side allow-list, then magic bytes, size, and a per-type structural check before storage. Files are stored with a pinned content type, so an uploaded `.md` containing markup is served as `text/plain` and can never execute on the storage origin.
- Upload size is capped per type: 2 MB for text, 10 MB for images, 50 MB for PDFs, and 75 MB for Office files. The request body is read in bounded chunks, so an oversized upload is rejected without being buffered in full.
- SlowAPI applies IP-based rate limits, including 20 requests/minute for health checks and 5 requests/minute for upload/resubmission operations.
- CORS restricts frontend origins, and the Next.js configuration includes a CSP and restrictive security headers.
- Sentry is optional and only initialized when a DSN is configured.
- Keep R2 secrets, Supabase server keys, Sentry auth tokens, and backend signing secrets outside client-exposed variables.

## Related documentation

- [Environment variables](ENV_VARS.md)
- [Deployment](DEPLOYMENT.md)
- [Architecture](ARCHITECTURE.md)
