# AI Study Hub Backend

NestJS foundation for the AI Study Hub REST API.

## Stack

- NestJS and TypeScript
- Prisma ORM 7 with PostgreSQL/Supabase
- Firebase Admin SDK for Authentication
- Cloudflare R2 configuration for private document storage
- Swagger/OpenAPI
- Jest and Supertest

## Requirements

- Node.js 24 LTS, version 24.18.0 (the repository pins `24.18.0`)
- npm 11.16.x
- A PostgreSQL database
- A Firebase project
- A Gemini API key

## Setup

```bash
nvm use
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate:dev -- --name init
npm run start:dev
```

The root `.nvmrc` and `.node-version` files are the source of truth for local
development and CI. Application manifests document the supported range, while
the backend startup/build guard and GitHub Actions enforce the pinned version.

The API runs at `http://localhost:3001/api`. Swagger is available at
`http://localhost:3001/api/docs`. The public health endpoint is
`GET /api/health`.

Shared integration references:

- [API contract v0.3](docs/api-contract-v0.3.md)
- [API testing guide](docs/api-testing-guide.md)
- [Document upload workflow](docs/upload-workflow-integration-notes.md)

## Environment

Never commit `.env` or Firebase service-account JSON files. Firebase private
keys stored in an environment variable may use escaped newlines (`\n`).

| Variable                       | Purpose                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `NODE_ENV`                     | `development`, `test`, or `production`                                                   |
| `PORT`                         | API port, defaults to `3001`                                                             |
| `DATABASE_URL`                 | Supabase PostgreSQL connection string                                                    |
| `FIREBASE_PROJECT_ID`          | Firebase project identifier                                                              |
| `FIREBASE_CLIENT_EMAIL`        | Firebase service account email                                                           |
| `FIREBASE_PRIVATE_KEY`         | Firebase service account private key                                                     |
| `R2_ACCOUNT_ID`                | Cloudflare account identifier                                                            |
| `R2_ACCESS_KEY_ID`             | Cloudflare R2 access key                                                                 |
| `R2_SECRET_ACCESS_KEY`         | Cloudflare R2 secret key                                                                 |
| `R2_BUCKET_NAME`               | Private document bucket                                                                  |
| `R2_ENDPOINT`                  | S3-compatible Cloudflare R2 endpoint                                                     |
| `R2_PRESIGNED_URL_TTL_SECONDS` | Presigned URL lifetime in seconds                                                        |
| `GEMINI_API_KEY`               | Server-side Gemini key                                                                   |
| `GEMINI_API_KEYS`              | Optional comma-separated backup keys; use keys from independently quota-managed projects |
| `GEMINI_MOCK`                  | Use mock AI responses when `true`                                                        |
| `MOCK_AUTH`                    | Local-only authentication bypass; production rejects `true`                             |
| `LLAMA_CLOUD_API_KEY`          | Optional OCR fallback; local PDF extraction runs first                                   |
| `LLAMA_PARSE_PREMIUM_MODE`     | Opt in to higher-credit premium OCR; defaults to `false`                                 |
| `OCR_MAX_PAGES`                | Maximum unreadable pages allowed before cloud OCR; defaults to `20`                      |
| `EXTRACTION_TIMEOUT_MS`        | Extraction timeout; defaults to `240000` so cloud OCR can finish                         |
| `CORS_ORIGIN`                  | Comma-separated allowed frontend origins                                                 |

Production startup validates configuration before NestJS accepts traffic. It rejects
AI/auth mock modes, missing R2 credentials, missing Resend configuration, missing
frontend/CORS URLs, and a disabled Gemini mock without at least one API key.

## Cloudflare R2 Storage

`StorageService` keeps the R2 bucket private. Uploads use object keys in this
format:

```text
users/{ownerId}/documents/{documentId}/{sanitizedFileName}
```

Use `createPreviewUrl()` for an inline presigned URL and
`createDownloadUrl()` for an attachment URL. These URLs expire after
`R2_PRESIGNED_URL_TTL_SECONDS` and must not be persisted in PostgreSQL.
Firebase is used only for Authentication.

## Commands

```bash
npm run start:dev
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
npm run prisma:format
npm run prisma:validate
npm run prisma:generate
```

## Module Ownership

Feature work belongs in the matching folder under `src/`: `auth`, `users`,
`roles`, `subjects`, `categories`, `tags`, `documents`, `document-content`,
`search`, `chatbot`, `community`, `saved-documents`, `admin`, `dashboard`, or
`storage`.

Keep controllers thin, business logic in services, input validation in DTOs,
and database access through `PrismaService`. Protected routes use
`FirebaseAuthGuard`; admin routes additionally use `RolesGuard` and
`@Roles(RoleName.ADMIN)`.

## Database Workflow

Edit `prisma/schema.prisma`, format and validate it, then create a named
migration:

```bash
npm run prisma:format
npm run prisma:validate
npm run prisma:migrate:dev -- --name describe_change
```

Production deployments should run `npm run prisma:migrate:deploy` before the
application starts.
