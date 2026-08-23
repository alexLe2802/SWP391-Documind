# Harden browser authentication storage

## Goal
Remove DocuMind's redundant Firebase ID token copy from Web Storage without breaking authenticated API requests.

## Tasks
- [x] Map Firebase/client/backend session storage and trust boundaries.
- [x] Remove reads and writes of `ai-study-hub.firebaseIdToken`; clean up legacy values.
- [x] Keep API authorization sourced only from the active Firebase user.
- [x] Add regression tests proving bearer tokens are not persisted by DocuMind.
- [x] Run lint, tests, build, and the repository security scan.

## Done When
- [x] DocuMind no longer stores its own Firebase ID token in localStorage or sessionStorage.
- [x] Authenticated requests still obtain a fresh token from Firebase in memory.
- [x] Invalid or unavailable auth state fails closed.

## Notes
Firebase client configuration and its API key are public by design. A full opaque
HttpOnly session would require a separate backend session-cookie migration.
