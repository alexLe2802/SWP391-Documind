# AI Study Hub Frontend

Next.js + TypeScript frontend for the AI Study Hub MVP.

## Requirements

- Node.js 20.19+ or a current LTS version
- npm

## Setup

```bash
npm ci
cp .env.example .env
npm run dev
```

Default API base URL:

```txt
http://localhost:8080/api
```

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Current Scope

- Authentication pages: login, register, forgot password
- Protected profile page
- Admin user list and user detail pages
- Role-based route guard
- API client aligned with Firebase-authenticated backend sessions
- User roles aligned with logical ERD: ADMIN and USER
- User statuses aligned with logical ERD: ACTIVE, BLOCKED, INACTIVE
