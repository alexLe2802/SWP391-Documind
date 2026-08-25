# AI Study Hub Backend Guidelines

## Source of Truth

This repository uses the updated backend stack:

- NestJS and TypeScript
- Firebase Authentication verified by Firebase Admin SDK
- Cloudflare R2 through its S3-compatible API
- Supabase-hosted PostgreSQL
- Prisma ORM
- Gemini API

Do not introduce cookie sessions, application-managed passwords, Supabase Auth,
Supabase Storage, Firestore, a vector database, Redis, or a separate AI
microservice unless the team explicitly changes the architecture.

## Coding Rules

- Keep controllers thin and business logic in services.
- Validate request input with DTOs and `class-validator`.
- Access PostgreSQL only through `PrismaService`.
- Verify Firebase ID tokens on protected endpoints.
- Read roles and blocked-user status from PostgreSQL.
- Apply `RolesGuard` to admin-only endpoints.
- Use NestJS exceptions and stable response shapes.
- Never commit real `.env` files, service-account JSON, or API keys.
- Add tests before implementation for new behavior and bug fixes.

## MVP Priority

Implement authentication and user sync first, followed by subjects/categories,
document upload and extraction, search, document-grounded chat, community save
flows, and admin APIs. Keep payments, offline support, media transcripts,
semantic/vector search, and recommendations out of the initial implementation.

## Git Workflow

Create branches such as `feature/auth`, `feature/documents`, or
`fix/firebase-token`. Open pull requests into the team's integration branch and
keep commits focused.
