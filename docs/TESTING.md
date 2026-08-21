# Testing

## Backend tests

Backend tests are located in `backend/tests/` and cover authentication dependencies, email-confirmation handling, admin/MFA checks, upload validation for each supported file type (allow-list rejection, per-type size caps, OOXML part mismatches, and successful text/Office/PDF uploads), student upload status behavior, document deletion, and R2 cleanup.

```bash
cd backend
python -m pytest tests -q
```

The test suite imports the FastAPI application, so provide the backend's required startup variables before running it. Test fixtures mock Supabase and storage interactions.

## Frontend E2E tests

Playwright suites cover authentication, administration, uploads, and PDF viewing. The global setup attempts to seed test users using Supabase credentials from `frontend/.env.local`.

```bash
cd frontend
npm run test:e2e
```

Run the application and its configured Supabase/API dependencies first. The test suite targets Chromium and uses `http://localhost:3000` by default.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`:

- Frontend: Node.js 20, `npm ci`, lint, and production build.
- Backend: Python 3.11, dependency installation, and `python -m compileall backend/app`.

Pytest and Playwright are present in the repository but are not currently invoked by this workflow.

## Related documentation

- [Local development](LOCAL_DEV.md)
- [Environment variables](ENV_VARS.md)
- [Troubleshooting](TROUBLESHOOTING.md)
