# Contributing Guidelines

Thank you for your interest in contributing to Revize! Follow these steps and guidelines to contribute:

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
