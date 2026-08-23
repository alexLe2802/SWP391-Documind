# AI Chatbot Source & Snippet Verification Checklist

This checklist is used to audit the AI Chatbot's integration in the **AI Study Hub** platform. The audit ensures that both `Ask This Document` and `Ask My Library` queries correctly return answers cited with source documents and content snippets.

---

## 📋 Pre-conditions for Audit

- [ ] The target user is authenticated (via Firebase Auth token).
- [ ] At least one test document has been successfully uploaded and processed (`visibility=PUBLIC` or owned by the user, and `extractionStatus=COMPLETED`).
- [ ] The document contains identifiable sections/text that can be used for verification.

---

## 🔍 Verification Checklist

### 1. Ask This Document (`POST /api/chat/ask-document`)

| Audit Item                  | Verification Target                                                    | Expected Result                                                                                | Checked |
| :-------------------------- | :--------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- | :-----: |
| **Request Payload**         | Check that `documentId` and `question` are passed in the request body. | Validation passes and request is accepted with `200 OK`.                                       |   [ ]   |
| **Response Envelope**       | Inspect that the response body conforms to `AiChatResponseDto`.        | Root object contains `answer`, `sessionId`, `messageId`, `suggestedPrompts`, and `sources`.    |   [ ]   |
| **Sources Field Structure** | Check that `sources` is a non-empty array of objects.                  | Array is populated with citations mapping back to the queried document.                        |   [ ]   |
| **Source Number**           | Check that `sourceNumber` is an integer starting from 1.               | Indexed correctly for client display.                                                          |   [ ]   |
| **Document ID Matching**    | Check that `documentId` matches the UUID passed in the request.        | The citation matches the source file.                                                          |   [ ]   |
| **Document Title**          | Check that the `title` field matches the original document's title.    | Correct title is displayed in the source card.                                                 |   [ ]   |
| **Text Snippet Validity**   | Verify that `snippet` is populated with actual text from the document. | The snippet is non-empty and represents a paragraph or section from the original file content. |   [ ]   |
| **Relevance Score**         | Verify that `relevanceScore` is returned (number or null).             | Representing relevance weight.                                                                 |   [ ]   |

---

### 2. Ask My Library (`POST /api/chat/ask-library`)

| Audit Item               | Verification Target                                                         | Expected Result                                                                                                       | Checked |
| :----------------------- | :-------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :-----: |
| **Request Payload**      | Check that `question` is passed, along with optional `filters` and `limit`. | Request is accepted with `200 OK`.                                                                                    |   [ ]   |
| **Response Envelope**    | Inspect response structure.                                                 | Root object contains `answer`, `sessionId`, `messageId`, and `sources`.                                               |   [ ]   |
| **Sources Verification** | Inspect the `sources` array for multi-document scenarios.                   | Contains citations from multiple matching documents owned or saved by the user.                                       |   [ ]   |
| **Tag/Subject Filters**  | Pass filter query (e.g. `subjectId` or `categoryId`).                       | Citations only show documents matching the given subject or category.                                                 |   [ ]   |
| **FileType Filter**      | Pass filter `fileType` (e.g. `pdf`).                                        | Citations only show documents matching that extension/type.                                                           |   [ ]   |
| **Text Snippet Source**  | Match the `snippet` text against database contents.                         | Snippet contains text derived from `contentSummary` or `extractedText` of the cited document.                         |   [ ]   |
| **Idempotent Fallback**  | Query with a question where no matching documents exist.                    | Returns `200 OK` with `sources: []` and fallback message: _"Không tìm thấy tài liệu phù hợp trong thư viện của bạn."_ |   [ ]   |

---

## 💡 Code Verification Points (Backend Audit)

> [!NOTE]
> Ensure the following logic is present in the codebase to guarantee correctness:
>
> - **Session Resolution**: Ensure that if `sessionId` is passed, the chatbot reuses the existing session and appends the message history. If omitted, a new `ChatSession` is created with the correct mode.
> - **Source Extraction**: Ensure `ChatSourceService.getSourcesForLibrary` tokenizes and scores search relevance using a case-insensitive, diacritic-insensitive term matching mechanism across Title, Description, Tags, Summary, and Extracted Text.
> - **Prisma Relations**: Ensure each chat message creates `ChatSource` records in the database, mapping `chatMessageId` to `documentId` with snippet content and relevance score.
