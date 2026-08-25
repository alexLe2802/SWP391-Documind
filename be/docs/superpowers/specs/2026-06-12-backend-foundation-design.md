# Backend Foundation Design

## Goal

Create a standalone, push-ready NestJS backend repository that gives the team a
stable foundation for implementing the AI Study Hub MVP.

## Architecture

The backend is a modular NestJS REST API with the global prefix `/api`.
Swagger is exposed at `/api/docs`. Configuration is loaded globally and
validated at startup. Prisma is the only database access layer, Firebase Admin
is the authentication and storage SDK, and business features are separated into
focused NestJS modules.

Only infrastructure behavior is implemented in this foundation. Domain modules
compile and can be assigned to team members, but they do not expose placeholder
endpoints. This avoids presenting unfinished APIs as working features.

## Included Foundation

- NestJS application bootstrap, global validation pipe, CORS, and Swagger.
- Public `GET /api/health` endpoint.
- Environment validation for required production integrations.
- Global Prisma module and lifecycle-managed Prisma client.
- Firebase Admin initialization module.
- Firebase bearer-token guard, PostgreSQL user/status check, role guard,
  `@CurrentUser()` decorator, and `@Roles()` decorator.
- Empty compile-ready modules for users, roles, subjects, categories, tags,
  documents, document content, search, chatbot, community, saved documents,
  admin, dashboard, and storage.
- Prisma schema for all core entities and enums from the context pack.
- Jest unit and e2e tests for implemented behavior.
- ESLint, Prettier, `.env.example`, Dockerfile, and contributor README.

## Security

No real environment file or Firebase service-account JSON is committed.
Protected APIs will use Firebase ID tokens. Authorization roles and blocked-user
status come from PostgreSQL, not Firebase custom claims.

## Git

`backend/` is a standalone Git repository using
the original standalone backend repository as `origin`. The initial
commit is pushed to `main` only after install, lint, test, and build checks pass.
