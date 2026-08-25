# Production Deployment

DocuMind uses one private repository containing `frontend/` and `backend/`.
The production web domain is:

```text
https://documind.icu
```

The hosting provider has not been selected yet. Configure the provider to build
each directory independently and keep all secrets in its environment-variable
store, never in Git.

## Toolchain and automation

Both applications use Node.js 24 LTS starting at `24.18.0` and npm `11.16.x`. Run
`nvm use` from the repository root before installing dependencies. CI rejects
versions outside Node 24/npm 11.16.x and pins `24.18.0` for reproducibility.

`.github/workflows/ci.yml` runs the backend and frontend quality gates for pull
requests and pushes to `main` or `dev`. It also verifies that the backend
container builds successfully.

After CI succeeds on `main`, `.github/workflows/cd.yml`:

1. Publishes the backend image to
   `ghcr.io/<repository-owner>/documind-backend` with `latest` and commit-SHA
   tags. Connect the selected backend host to this image once that host has
   been chosen.
2. Calls a Cloudflare Workers Builds Deploy Hook. Cloudflare checks out `main`,
   builds OpenNext with the environment already stored on Cloudflare, and
   deploys the resulting Worker.

Create a protected GitHub environment named `production`. Configure this
environment secret:

- `CLOUDFLARE_DEPLOY_HOOK_URL`

Create the hook in Cloudflare under **Workers & Pages > DocuMind > Settings >
Builds > Deploy Hooks**. Name it `github-ci-main` and bind it to `main`. The hook
URL is a credential: store it only as the GitHub secret above.

Keep `NEXT_PUBLIC_API_BASE_URL`, all `NEXT_PUBLIC_FIREBASE_*` values, and
`NEXT_PUBLIC_USE_MOCK_API=false` in the Cloudflare production build
environment. GitHub no longer builds the production frontend and therefore
does not need copies of those values.

Require the `Backend quality gate`, `Frontend quality gate`, and
`Verify backend container` checks in the `main` branch protection rule. Use the
`production` environment approval rule if deployments require manual approval.

## Frontend

Build from `frontend/`:

```text
Install: npm ci
Cloudflare build: npm run cf:build
Cloudflare deploy: npm run cf:deploy
```

For Cloudflare Workers Builds, set the root directory to `/frontend`, the build
command to `npm run cf:build`, and the deploy command to `npm run cf:deploy`.
For preview branches, use `npm run cf:upload`.

Configure:

```env
NEXT_PUBLIC_API_BASE_URL=https://api.documind.icu/api
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_USE_MOCK_API=false
```

Production builds fail immediately when a required public Firebase/API setting is
missing or `NEXT_PUBLIC_USE_MOCK_API=true`. Keep mock APIs disabled in the
Cloudflare production environment.

Only browser-safe Firebase configuration belongs in `NEXT_PUBLIC_*` variables.
Never expose `DATABASE_URL`, Firebase Admin credentials, storage secrets, or AI
provider keys in the frontend.

## Backend

Build from `backend/` using its `Dockerfile`, or run:

```text
Install: npm ci
Build: npm run build
Pre-deploy: npm run prisma:migrate:deploy
Start: npm run start:prod
Health check: /api/health
```

Set `CORS_ORIGIN=https://documind.icu` and configure the remaining variables
from `backend/.env.example` in the host's secret store. Point
`DATABASE_URL` only at the new Supabase project.

Render production must set `GEMINI_MOCK=false` and `MOCK_AUTH=false`. At least
one of `GEMINI_API_KEY` or `GEMINI_API_KEYS` must be present. Startup now fails
before opening the HTTP port if these rules or another required production
integration setting are invalid.

For a persistent IPv6-capable server, Supabase's direct connection is suitable.
For an IPv4-only persistent server, use the Supavisor session pooler. For
serverless or auto-scaling hosting, use its transaction pooler.

## New Supabase Database

1. Create a new Supabase project.
2. Copy its appropriate Postgres connection string into the production
   `DATABASE_URL` secret.
3. From `backend/`, run `npm run prisma:migrate:deploy`.
4. Run `npm run prisma:generate`.
5. Verify `/api/health` before directing production DNS traffic.

The existing `backend/prisma/migrations/` directory is intentionally preserved.

## Domain and Authentication

Point `documind.icu` to the frontend and `api.documind.icu` to the backend.
Add `documind.icu` to Firebase Authentication's authorized domains. The backend
generates Firebase action codes, and branded emails point to `/verify-email`
and `/reset-password` on the frontend.

## Transactional authentication email

Cloudflare DNS does not create sender addresses. Verify `documind.icu` in
Resend, create a sending API key, and configure the backend to use Resend's
HTTPS API. HTTPS is required because free Render services block SMTP ports.

```env
RESEND_API_KEY=re_xxxxxxxxx
AUTH_EMAIL_FRONTEND_URL=https://documind.icu
REGISTRATION_EMAIL_FROM=registration@documind.icu
RESET_PASSWORD_EMAIL_FROM=reset-password@documind.icu
```

Add the provider's DKIM records in Cloudflare and merge its SPF requirement
with the existing Firebase SPF record; a domain must not have two separate SPF
TXT records. Add a DMARC TXT record after SPF and DKIM pass. Keep all mail
records set to **DNS only**.

These sender identities do not need inboxes unless replies must be received.
The templates tell recipients not to reply.

## Verification

After deployment:

1. Confirm `https://documind.icu` loads over HTTPS.
2. Confirm frontend requests resolve through `https://api.documind.icu/api`.
3. Confirm the backend health endpoint succeeds.
4. Run the Prisma migration status command against the new database.
5. Register a test account and confirm the verification email arrives from
   `registration@documind.icu`.
6. Request a password reset and confirm it arrives from
   `reset-password@documind.icu` and opens the DocuMind reset form.
7. Test sign-in, document upload, and AI chat.
