# Dashboard Subscription Quotas

## Goal
Replace the dashboard storage mock with per-account subscription usage and limits, with document-derived fallback values.

## Tasks
- [x] Confirm the subscription endpoint already returns account-scoped upload and storage usage.
- [x] Render upload usage and limit from `CurrentSubscription`.
- [x] Render storage usage and limit with readable MB/GB formatting.
- [x] Fall back to document count and summed `fileSize` when subscription loading fails.
- [x] Add tests for subscription quotas and fallback behavior.
- [x] Run frontend lint, tests, and production build.

## Done When
- [x] No hard-coded dashboard storage value remains.
- [x] Each account sees quota values from its own subscription response.
- [x] The dashboard remains truthful if the subscription request fails.
