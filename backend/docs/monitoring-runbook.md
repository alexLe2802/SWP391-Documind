# Production monitoring runbook

## Render health checks

- Liveness: `GET /api/health/live` (or the backward-compatible `/api/health`).
- Readiness: `GET /api/health/ready`; returns HTTP 503 when Supabase PostgreSQL is unavailable.
- Configure Render's health-check path as `/api/health/ready` so an unhealthy instance is removed from traffic.

## Alerts

Forward Render logs to the configured log destination and alert on structured JSON events:

- `health.readiness_failed` with `severity=critical`: page immediately.
- `http.unhandled_error` or `http.request_completed` with `severity=error`: alert when at least 5 occur in 5 minutes.
- `extraction.queue.processor_failed`: alert when at least 3 occur in 10 minutes.

The HTTP completion event includes `requestId`, route, status and duration. Use `requestId` to correlate it with the API error envelope and backend exception event. Never include tokens, request bodies, extracted text, or database credentials in logs.

## Extraction recovery

`PENDING` jobs are reloaded at startup. A `PROCESSING` job is reclaimed only after `EXTRACTION_LEASE_TIMEOUT_MS`; recovery atomically issues a new job ID so another live instance cannot process the same lease. Keep this timeout longer than `EXTRACTION_TIMEOUT_MS`.
