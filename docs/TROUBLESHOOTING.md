# Troubleshooting

## The backend exits with a missing Supabase variable

Set `SUPABASE_URL` and `SUPABASE_KEY` before importing the API. Also provide `DATABASE_URL` and `SECRET_KEY`, which are required by the Pydantic settings model.

## Uploads fail while browsing works

Browsing can use Supabase directly, while uploads require FastAPI and R2. Confirm `NEXT_PUBLIC_API_URL`, all five `R2_*` variables, the bucket public URL, and backend CORS configuration. Check the FastAPI console and `/health` response.

## The frontend cannot call the API

Confirm the API is running on port 8000, `NEXT_PUBLIC_API_URL` has no incorrect path suffix, and the frontend origin is present in backend `CORS_ORIGINS`. Restart Next.js after changing `.env.local`.

## Admin pages redirect to the home page

The signed-in user must exist in the Supabase `admins` table. The internal admin routes additionally require a current AAL2 session; complete TOTP setup and verification through `/portal-admin`.

## Playwright tests skip user setup

Ensure `frontend/.env.local` contains `NEXT_PUBLIC_SUPABASE_URL` and either `SUPABASE_SERVICE_ROLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The global setup logs a warning and skips seeding when credentials are absent.

## PWA changes do not appear in development

The PWA plugin is disabled in development and enabled for production builds. Use `npm run build` followed by `npm run start` to validate the production service worker and offline fallback.

## FAQ

### Is every uploaded document public immediately?

No. Student uploads are forced to `pending` and require administrator moderation before public discovery.

### Does the application store uploaded files in Supabase Storage?

The current backend uses Cloudflare R2 for new file and thumbnail uploads. Legacy database URLs outside the configured R2 public URL are intentionally protected from deletion.

### Is an OpenAI key required?

No application code inspected for Academic Portal requires OpenAI. The Supabase Studio configuration contains a stock optional Studio setting only.

### Can I run the frontend without the FastAPI service?

You can inspect many public and Supabase-backed views, but uploads, backend search, resubmission, moderation, deletion, and account deletion require the API service.

### Is there a Docker Compose file for the whole project?

No project-level Docker or Compose configuration was detected. Docker is still required by the Supabase CLI for its local service stack.

## Related documentation

- [Local development](LOCAL_DEV.md)
- [Environment variables](ENV_VARS.md)
- [Testing](TESTING.md)
