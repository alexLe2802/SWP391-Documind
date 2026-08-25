# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, tested NestJS foundation for the AI Study Hub backend.

**Architecture:** Use a modular NestJS application with global configuration,
Prisma database access, Firebase Admin infrastructure, reusable authorization
guards, and compile-ready domain modules. Implement only foundation behavior so
feature teams start from clear boundaries without inheriting fake endpoints.

**Tech Stack:** NestJS, TypeScript, Prisma, PostgreSQL, Firebase Admin SDK,
Swagger/OpenAPI, class-validator, Jest, Supertest, ESLint, Prettier

---

### Task 1: Project Tooling and Bootstrap

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `nest-cli.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc`
- Create: `src/main.ts`
- Create: `src/app.module.ts`

- [ ] Add scripts for development, linting, unit tests, e2e tests, Prisma, and builds.
- [ ] Install runtime and development dependencies with `npm install`.
- [ ] Add NestJS bootstrap with `/api`, CORS, validation, and Swagger.
- [ ] Run `npm run build`; expect exit code 0.

### Task 2: Health Behavior Through TDD

**Files:**

- Create: `src/health/health.controller.spec.ts`
- Create: `src/health/health.controller.ts`
- Create: `src/health/health.module.ts`
- Create: `test/health.e2e-spec.ts`
- Create: `test/jest-e2e.json`

- [ ] Write a unit test expecting `{ status: "ok" }`.
- [ ] Run the focused test and verify it fails because the controller is absent.
- [ ] Implement the controller and module.
- [ ] Run unit and e2e health tests; expect all tests to pass.

### Task 3: Environment Configuration Through TDD

**Files:**

- Create: `src/config/env.validation.spec.ts`
- Create: `src/config/env.validation.ts`
- Create: `.env.example`

- [ ] Write tests for defaults and missing production integration variables.
- [ ] Run tests and verify failure because validation is absent.
- [ ] Implement typed Joi validation schema.
- [ ] Run focused tests; expect all tests to pass.

### Task 4: Prisma Data Foundation

**Files:**

- Create: `prisma/schema.prisma`
- Create: `src/prisma/prisma.service.ts`
- Create: `src/prisma/prisma.module.ts`

- [ ] Define every core enum, model, relation, unique constraint, and index from the approved context.
- [ ] Add a global Prisma module and lifecycle-managed client.
- [ ] Run `npm run prisma:format` and `npm run prisma:validate`.
- [ ] Run `npm run prisma:generate`; expect the Prisma client to generate successfully.

### Task 5: Firebase and Authorization Infrastructure Through TDD

**Files:**

- Create: `src/firebase/firebase-admin.provider.ts`
- Create: `src/firebase/firebase.module.ts`
- Create: `src/auth/auth.types.ts`
- Create: `src/auth/decorators/current-user.decorator.ts`
- Create: `src/auth/decorators/roles.decorator.ts`
- Create: `src/auth/guards/firebase-auth.guard.spec.ts`
- Create: `src/auth/guards/firebase-auth.guard.ts`
- Create: `src/auth/guards/roles.guard.spec.ts`
- Create: `src/auth/guards/roles.guard.ts`
- Create: `src/auth/auth.module.ts`

- [ ] Write failing tests for missing bearer tokens, valid active users, blocked users, allowed roles, and denied roles.
- [ ] Implement Firebase provider initialization using environment variables.
- [ ] Implement guards and decorators with Prisma-backed role/status checks.
- [ ] Run focused authorization tests; expect all tests to pass.

### Task 6: Domain Module Boundaries

**Files:**

- Create one `*.module.ts` under each MVP domain folder.
- Modify: `src/app.module.ts`

- [ ] Add compile-ready modules for users, roles, subjects, categories, tags,
      documents, document-content, search, chatbot, community, saved-documents,
      admin, dashboard, and storage.
- [ ] Import the modules into `AppModule`.
- [ ] Run `npm run build`; expect exit code 0.

### Task 7: Repository and Deployment Documentation

**Files:**

- Create: `.gitignore`
- Create: `README.md`
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] Document setup, environment variables, scripts, API docs, module ownership,
      and migration workflow.
- [ ] Add a multi-stage production Dockerfile.
- [ ] Verify no real secrets or generated artifacts are tracked.

### Task 8: Final Verification and Publish

- [ ] Run `npm run format:check`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test -- --runInBand`.
- [ ] Run `npm run test:e2e -- --runInBand`.
- [ ] Run `npm run prisma:validate`.
- [ ] Run `npm run build`.
- [ ] Review `git diff --check` and `git status --short`.
- [ ] Commit the verified foundation as `chore: initialize backend foundation`.
- [ ] Rename the branch to `main` and push to `origin`.
