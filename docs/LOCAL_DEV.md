# Local Development

The repository has three independently started services: local Supabase, FastAPI, and Next.js.

## Prerequisites

- Node.js 20 or a compatible current Node.js release. Node.js 20 is used by CI.
- npm, included with Node.js.
- Python 3.11 or newer. Python 3.11 is used by CI.
- Git.
- Supabase CLI for local PostgreSQL, Auth, Realtime, Storage, Studio, and Inbucket services.
- Docker Desktop, required by the Supabase CLI for the local service stack.
- A Cloudflare R2 bucket for real file uploads. Local database development can use seeded data without configuring R2 until upload testing is needed.

## 1. Start Supabase locally

From the repository root:

```bash
supabase start
supabase db reset
```

The checked-in configuration uses these local service ports:

| Service | URL/port |
| --- | --- |
| Supabase API | `http://127.0.0.1:54321` |
| PostgreSQL | `127.0.0.1:54322` |
| Supabase Studio | `http://127.0.0.1:54323` |
| Inbucket email UI | `http://127.0.0.1:54324` |

`supabase db reset` applies migrations and the local seed. The seed file contains local development accounts; do not reuse those credentials in any hosted environment.

## 2. Configure and run the backend

Create `backend/.env` or another environment file loaded by the process. Use the variables in [Environment Variables](ENV_VARS.md), then create a virtual environment:

```bash
cd backend
python -m venv .venv
```

Windows Command Prompt:

```bat
.venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

macOS/Linux:

```bash
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

The API is then available at `http://localhost:8000`. Interactive documentation is available at `/api/docs`, ReDoc at `/api/redoc`, and the OpenAPI document at `/api/openapi.json`.

## 3. Configure and run the frontend

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. Set `NEXT_PUBLIC_API_URL=http://localhost:8000` so client upload, search, moderation, resubmission, and account routes can reach FastAPI.

The Playwright configuration reads `frontend/.env.local` and defaults its base URL to `http://localhost:3000`. The Playwright `webServer` block is currently commented out, so start the frontend manually before running E2E tests.

## Commands and scripts

Run frontend commands from `frontend/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Create a production build using the webpack builder required by the PWA setup |
| `npm run start` | Serve a previously built production application |
| `npm run lint` | Run ESLint |
| `npm run analyze` | Build with bundle analysis enabled via `ANALYZE=true` |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:e2e:ui` | Open Playwright UI mode |
| `npm run test:e2e:report` | View the generated Playwright HTML report |

Run backend commands from the repository root unless noted:

```bash
python -m pytest backend/tests -q
python -m compileall backend/app
```

For a production-compatible local API process:

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

The health endpoint checks connectivity to the `subjects` table and returns a `healthy` or `unhealthy` status with the API version and database status.

## Related documentation

- [Environment variables](ENV_VARS.md)
- [Testing](TESTING.md)
- [Troubleshooting](TROUBLESHOOTING.md)
