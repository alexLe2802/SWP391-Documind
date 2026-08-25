# Production CI/CD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure production-only deployment from `main` to Vercel and Render Starter with CI-gated deploys and automated Prisma migrations.

**Architecture:** Vercel deploys the standalone frontend repository through Git integration. Render builds the standalone backend repository as Docker, runs Prisma migrations in a paid pre-deploy step, and activates the image only after its health endpoint succeeds.

**Tech Stack:** GitHub Actions, Vercel, Render Blueprint, Docker, NestJS, Prisma, Supabase.

---

### Task 1: Make the backend image migration-capable

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `Dockerfile`

- [ ] Move `prisma` from development dependencies to production dependencies.
- [ ] Build the production Docker image.
- [ ] Run `npx prisma --version` inside the image to prove the CLI is available.

### Task 2: Define the Render production service

**Files:**

- Create: `render.yaml`

- [ ] Define a Docker web service on the Starter plan in Singapore.
- [ ] Set branch `main` and `autoDeployTrigger: checksPass`.
- [ ] Set `preDeployCommand: npm run prisma:migrate:deploy`.
- [ ] Set `healthCheckPath: /api/health`.
- [ ] Declare non-secret configuration and mark every secret `sync: false`.

### Task 3: Strengthen CI gates

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `../frontend/.github/workflows/ci.yml`

- [ ] Validate Prisma schema in backend CI.
- [ ] Build the production Docker image in backend CI.
- [ ] Verify Prisma CLI exists in the production image.
- [ ] Supply non-secret build placeholders to frontend CI so its build does not depend on developer files.

### Task 4: Document dashboard setup and operations

**Files:**

- Create: `DEPLOYMENT.md`
- Create: `../frontend/DEPLOYMENT.md`

- [ ] Document Render Blueprint creation and all production environment variables.
- [ ] Document Vercel import, production variables, and Firebase authorization.
- [ ] Document GitHub branch-protection checks.
- [ ] Document deploy verification and rollback.

### Task 5: Verify the complete configuration

- [ ] Run backend lint, tests, build, Prisma validation, and Docker checks.
- [ ] Run frontend lint and production build.
- [ ] Inspect Git diffs to ensure secrets are absent.
