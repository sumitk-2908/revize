# Environment Variables

Do not commit `.env`, `.env.*`, `*.env`, service-role keys, private signing keys, or R2 credentials. The repository `.gitignore` excludes environment files.

## Frontend: `frontend/.env.local`

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL used by browser, server, proxy, and E2E setup clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public Supabase anon key; database permissions remain enforced by RLS |
| `NEXT_PUBLIC_API_URL` | Yes | Base URL of the FastAPI service, for example `http://localhost:8000` |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | Yes | Public R2 base URL for uploaded files and thumbnails; must match the backend's `R2_PUBLIC_URL`. Read at build time to derive the CSP and image allow-lists, so the build fails if it is absent |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical metadata base URL; the app has a hosted fallback in code |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Sitemap and robots base URL; defaults to `http://localhost:3000` |
| `PLAYWRIGHT_TEST_BASE_URL` | E2E only | Overrides the Playwright target URL |
| `SUPABASE_SERVICE_ROLE_KEY` | E2E/local admin setup only | Optional privileged key used by the Playwright global setup; never expose it to the browser or commit it |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Frontend Sentry DSN, if configured by the Sentry integration |
| `SENTRY_AUTH_TOKEN` | Optional | Sentry build/source-map integration token, if required by the deployment |

## Backend: `backend/.env`

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Yes | Supabase project URL used by FastAPI, auth validation, and database client |
| `SUPABASE_KEY` | Yes | Server-side Supabase key used by FastAPI; use an appropriately protected server key |
| `DATABASE_URL` | Yes by settings model | Database connection setting required by `Settings`, even though current runtime database calls use the Supabase client |
| `SECRET_KEY` | Yes by settings model | Application secret required by backend settings; generate a strong private value |
| `APP_NAME` | Optional | FastAPI application name; defaults to `Academic Portal API` |
| `APP_ENV` | Optional | Environment label; defaults to `development` |
| `DEBUG` | Optional | Enables detailed backend error details when true; keep false in production |
| `ALGORITHM` | Optional | Token algorithm setting; defaults to `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Optional | Access-token setting; defaults to `60` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | Optional | Refresh-token setting; defaults to `30` |
| `CORS_ORIGINS` | Optional | Allowed frontend origins; the checked-in default includes localhost and detected Vercel URLs |
| `SENTRY_DSN` | Optional | FastAPI Sentry DSN |
| `R2_ACCOUNT_ID` | Upload/delete required | Cloudflare account ID used to construct the R2 S3 endpoint |
| `R2_ACCESS_KEY_ID` | Upload/delete required | R2 API access key |
| `R2_SECRET_ACCESS_KEY` | Upload/delete required | R2 API secret |
| `R2_BUCKET_NAME` | Upload/delete required | R2 bucket name |
| `R2_PUBLIC_URL` | Upload/delete required | Public base URL for stored files and thumbnails, without a trailing slash |

`SUPABASE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are not interchangeable names in the current code. Configure the variable expected by the component you are running, and keep privileged keys server-side.

## Related documentation

- [Local development](LOCAL_DEV.md)
- [Deployment](DEPLOYMENT.md)
- [Security and Operations](SECURITY.md)
