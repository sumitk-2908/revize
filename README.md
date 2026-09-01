# Revize

[![Next.js](https://img.shields.io/badge/Next.js-16.2.7-000000?logo=next.js&logoColor=white)](frontend/package.json)
[![React](https://img.shields.io/badge/React-19.2.4-61DAFB?logo=react&logoColor=111111)](frontend/package.json)
[![API](https://img.shields.io/badge/API-v1.0.0-009688?logo=fastapi&logoColor=white)](backend/app/main.py)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](frontend/package.json)
[![Python CI](https://img.shields.io/badge/Python_CI-3.11-3776AB?logo=python&logoColor=white)](.github/workflows/ci.yml)
[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A crowd-sourced academic resource hub for engineering students: notes, previous-year questions, syllabi, and tutorial sheets organized by subject and module, with public discovery, authenticated contributions, peer moderation, and personal study tools.

## What It Does

- **Discovery and study:** Browse subjects, modules, recent uploads, and weekly trending resources; search approved documents with full-text search, filters, pagination, and sorting; view PDFs, images, and text/Markdown in the in-app viewer.
- **Contribution:** Upload documents (PDF, Word, PowerPoint, Excel, images, and plain text/Markdown), monitor review status, and resubmit rejected material.
- **Moderation:** Approve, reject, or return documents individually or in batches; moderate documents and comments; manage subjects/modules; inspect platform analytics.
- **Personalization:** Bookmark documents, continue studying from history, and build a contribution profile with impact, streaks, and achievements.
- **Split data access:** The web client uses Supabase directly for operations protected by Row Level Security (RLS), while the FastAPI service handles file validation and processing, object storage, authenticated uploads, moderation actions, and other privileged workflows.

→ [Full feature list](docs/FEATURES.md)


## Quick Start

Requires Node.js 20, Python 3.11+, the Supabase CLI, and Docker Desktop.

**1. Supabase** — from the repository root:

```bash
supabase start
supabase db reset
```

**2. Backend** — create `backend/.env` first, then:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

**3. Frontend** — in a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3000`. The API is available at `http://localhost:8000`, with interactive documentation at `/api/docs`.

→ [Full setup guide](docs/LOCAL_DEV.md) · [Environment variables](docs/ENV_VARS.md)

## Documentation

| Document | Contents |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | System diagram, document lifecycle, technology stack, repository structure |
| [Features](docs/FEATURES.md) | Full feature breakdown and supported file types |
| [Local Development](docs/LOCAL_DEV.md) | Prerequisites, service setup, commands and scripts |
| [Environment Variables](docs/ENV_VARS.md) | Frontend and backend variable reference |
| [Deployment](docs/DEPLOYMENT.md) | Supabase, Cloudflare R2, Render, and Vercel deployment |
| [Testing](docs/TESTING.md) | Backend Pytest, Playwright E2E, continuous integration |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common failures and FAQ |
| [Contributing](docs/CONTRIBUTING.md) | Contribution workflow, PR guidelines, and local verification |

## Tech Stack

Next.js 16.2.7 App Router with React 19.2.4 and TypeScript, Tailwind CSS 4, and TanStack Query/Virtual on the client. FastAPI with Uvicorn on the server. Supabase PostgreSQL with RLS, full-text search, and Realtime for data; Supabase Auth with Google OAuth and TOTP MFA for identity; Cloudflare R2 through the S3-compatible boto3 API for files.

→ [Full stack table](docs/ARCHITECTURE.md#technology-stack)

## Deployment

Supabase and Cloudflare R2 are directly represented in the repository; the FastAPI service is likely Render-compatible and the Next.js frontend likely Vercel-compatible, inferred from existing URLs and integration points.

→ [Deployment guide](docs/DEPLOYMENT.md)

## Testing

Backend tests run with `python -m pytest tests -q` from `backend/`; frontend E2E tests run with `npm run test:e2e` from `frontend/`.

→ [Testing guide](docs/TESTING.md)

## Contributing

Fork the repository, branch from `main`, record schema changes as migrations, keep secrets out of commits, and run lint/build/tests before opening a pull request.

→ [Contributing guide](docs/CONTRIBUTING.md)

## License

This project is open-source and licensed under the [MIT License](LICENSE). Third-party dependencies retain their own licenses.
