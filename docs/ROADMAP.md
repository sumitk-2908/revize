# Roadmap and Contributing

## Roadmap

No project-source `TODO`, `FIXME`, or planned-feature markers were detected in the reviewed application source. The following items are evidence-based maintenance opportunities identified from repository gaps:

- [ ] Add and commit the PWA screenshot assets referenced by `frontend/public/manifest.json`.
- [ ] Extend GitHub Actions to execute backend Pytest and frontend Playwright suites with isolated test services.
- [ ] Add a root-level orchestration command or documented process manager for starting Supabase, FastAPI, and Next.js together.
- [ ] Add container/hosting manifests if repeatable production deployment is required.
- [ ] Add a project license and update this README with the selected license and copyright/attribution details.
- [ ] Replace hardcoded deployment-origin defaults with deployment environment configuration where appropriate.

These are recommended next steps, not currently implemented features or commitments.

## Contributing

1. Fork the repository and create a focused branch from `main`.
2. Start the local Supabase, backend, and frontend services using [Local Development](LOCAL_DEV.md).
3. Apply or add Supabase schema changes through a migration under `supabase/migrations/`; do not edit the database manually without recording the change.
4. Keep secrets out of commits and avoid adding privileged keys to `NEXT_PUBLIC_*` variables.
5. Run the relevant checks before opening a pull request:

   ```bash
   cd frontend
   npm run lint
   npm run build
   npm run test:e2e
   cd ../backend
   python -m pytest tests -q
   python -m compileall app
   ```

6. Describe behavior changes, database migrations, environment-variable changes, and test coverage in the pull request.
7. Keep pull requests small enough to review and do not claim deployment support that has not been verified.

## Related documentation

- [Local development](LOCAL_DEV.md)
- [Testing](TESTING.md)
- [Architecture](ARCHITECTURE.md)
