# QUANG-10 AI Test Evidence

- Task ID: QUANG-10
- Module: QA Testing
- Test date: 2026-06-25
- Test environment: local backend
- Automated test files:
  - `src/ai-chatbot/ai-chatbot.service.spec.ts`
  - `src/ai-chatbot/ai-chatbot.controller.spec.ts`
  - `src/ai-chatbot/services/chat-source.service.spec.ts`
- Test command:
  - `npm test -- --runInBand ai-chatbot.service.spec.ts`
  - `npm test -- --runInBand ai-chatbot.controller.spec.ts`
  - `npm test -- --runInBand src/ai-chatbot/services/chat-source.service.spec.ts`
  - `npm run lint`
  - `npm run build`

## Preconditions

- Local repository is on branch `QuangPLM`.
- `origin/main` is merged into `QuangPLM`.
- Tests use mocked Prisma, Gemini, prompt builder, and source services.
- No real Firebase token, database URL, API key, service account key, R2 key, or user email is included in this evidence.

## Scenario A: No extracted content

- Steps:
  - Mock an active document owned by the current user.
  - Return missing `DocumentContent`, or content with non-`COMPLETED` extraction status.
  - Call `askDocument`.
- Expected result:
  - Controlled not-ready error, matching current contract: `ConflictException` / HTTP 409.
  - Gemini is not called.
  - No chat session, chat message, or AI response is persisted for missing content.
- Actual result:
  - Automated service tests assert 409 conflict and no Gemini/persistence side effects.
- Status: PASS in automated tests.

## Scenario B: Gemini error

- Steps:
  - Mock Gemini to throw an unexpected error.
  - Mock Gemini to return a controlled failure response.
  - Call `askDocument`.
- Expected result:
  - API/service does not crash.
  - Response follows current UI contract with a safe user-facing answer.
  - API key, token, stack trace, and private error message are not exposed.
  - Current merged contract may include a sanitized `errorCode` such as `GEMINI_API_ERROR`.
  - The result is not falsely reported as a normal successful answer.
- Actual result:
  - Automated service tests assert source fallback answer, sanitized `errorCode`, no private error leakage, and no mock-success flag for unexpected failures.
- Status: PASS in automated tests.

## Scenario C: Empty retrieval

- Steps:
  - Mock `askLibrary` source retrieval to return no owned or saved document sources.
  - Call `askLibrary`.
- Expected result:
  - Controlled response under current contract.
  - `sources` is an empty array.
  - Gemini and prompt builder are not called.
  - User receives a clear no-source answer.
- Actual result:
  - Automated service/controller tests assert empty `sources`, no Gemini call, no prompt builder call, and no `ChatSource` records on the AI message.
- Status: PASS in automated tests.

## Scenario D: Permission error

- Steps:
  - Mock a private document owned by another user.
  - Call `askDocument` as the current user.
- Expected result:
  - Controlled permission error, matching current contract: `ForbiddenException` / HTTP 403.
  - Gemini is not called.
  - No unauthorized chat session, chat message, or chat source is created.
- Actual result:
  - Automated service/controller tests assert 403 forwarding and no Gemini/persistence side effects.
- Status: PASS in automated tests.

## Scenario E: Long prompt fallback

- Steps:
  - Mock long document content and multiple library sources.
  - Prefer bounded `contentSummary`/source snippet context.
  - Call `askLibrary`.
- Expected result:
  - Prompt context prefers `contentSummary` before full extracted text.
  - Long extracted text is truncated before it reaches the prompt.
  - Question and source/citation context remain present.
  - Gemini receives a valid bounded prompt.
  - API does not crash.
  - Citation sources include correct `documentId`, `title`, and `snippet`.
- Actual result:
  - Automated source tests assert summary-first prompt context and 3000-character prompt limit.
  - Automated service tests assert Gemini receives bounded context with the question and citation metadata is preserved.
- Status: PASS in automated tests.

## Verification Result

- `npm test -- --runInBand ai-chatbot.service.spec.ts`: PASS, 32 tests passed.
- `npm test -- --runInBand ai-chatbot.controller.spec.ts`: PASS, 11 tests passed.
- `npm test -- --runInBand src/ai-chatbot/services/chat-source.service.spec.ts`: PASS, 21 tests passed.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- Overall automated verification: PASS.

## Manual Swagger/Postman Verification

- Manual verification pending.
- Limitation: no real Firebase ID token and seeded document/content data were provided for this run.
- Required later:
  - Call `POST /api/chat/ask-document` with a valid Firebase bearer token against a document without completed extraction.
  - Call `POST /api/chat/ask-document` against another user's private document.
  - Call `POST /api/chat/ask-library` with no matching library sources.
  - Call Gemini failure paths only in a safe test environment without exposing secrets.
