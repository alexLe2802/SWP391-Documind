# Custom authentication emails

## Goal
Send branded registration-verification and password-reset emails from the NestJS backend using Firebase Admin action links and the Resend HTTPS API.

## Tasks
- [x] Add Resend environment validation and a reusable mail module. Verify: disabled delivery fails explicitly and enabled delivery uses HTTPS.
- [x] Add Vietnamese HTML templates for verification and reset emails. Verify: unit tests assert escaped user data and correct action links.
- [x] Generate Firebase Admin action links and send the two auth emails from backend services. Verify: service tests assert sender, recipient, and continue URLs.
- [x] Add a public forgot-password endpoint and trigger verification mail during registration. Verify: controller and service tests pass.
- [x] Change the frontend to call the backend instead of Firebase email-delivery APIs. Verify: frontend auth API tests pass.
- [x] Document provider/DNS setup and required environment variables. Verify: deployment instructions include SPF, DKIM, and DMARC guidance.
- [x] Run backend/frontend tests, lint, and builds.

## Done When
- [x] Firebase native delivery is no longer used for registration or password reset.
- [x] The backend is ready to send from `registration@documind.icu` and `reset-password@documind.icu` after a Resend API key is supplied.
- [x] Automated tests, lint, and production builds pass.

## Notes
- Cloudflare DNS does not create mailboxes; Resend provides outbound delivery.
- Firebase remains the source of truth for verification/reset action codes.
