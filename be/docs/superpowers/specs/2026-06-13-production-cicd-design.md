# Production CI/CD Design

## Scope

Deploy only the `main` branch:

- Frontend: Vercel production deployment.
- Backend: Render Starter Docker web service in Singapore.
- Database: Existing Supabase PostgreSQL instance.
- No staging or backend preview service.

## Deployment Flow

1. A pull request targets `main`.
2. GitHub Actions runs lint, tests, application build, and Docker build checks.
3. The pull request is reviewed and merged only after required checks pass.
4. Vercel deploys the frontend from `frontend/main`.
5. Render waits for backend CI checks, builds the Docker image, and runs
   `npm run prisma:migrate:deploy` as its pre-deploy command.
6. Render replaces the running backend only after migration and health checks
   succeed.

## Configuration

The backend repository owns `render.yaml`. It defines a Starter service in
Singapore, the `/api/health` health check, CI-gated auto-deploys, and
environment-variable names. Sensitive values use `sync: false`.

The production Docker image contains Prisma CLI because Render executes the
pre-deploy command inside the built image. Application startup remains
`node dist/main`.

The frontend uses Vercel Git integration. GitHub Actions validates lint and
build, while Vercel owns preview and production deployment artifacts.

## Operations

Production secrets live only in Render, Vercel, Supabase, Firebase, and
Cloudflare dashboards. Branch protection requires review and successful CI
before merge. Rollback uses the previous successful Render or Vercel deploy;
database changes must remain backward-compatible because schema rollback is
not automatic.
