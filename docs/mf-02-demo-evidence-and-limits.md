# MF-02: Verification Evidence & System Limitations

## 1. Demonstrated Evidence
- **Upload with Real-time Progress:** Multi-part file upload with live percentage progress bar via `XMLHttpRequest`.
- **Asynchronous Processing:** Immediate HTTP response with 2-second frontend polling for extraction status.
- **Content Moderation:** Keyword scanner automatically flags sensitive public documents (`FLAGGED`).
- **Office Online Preview:** Integrated Microsoft Office Online Viewer for seamless in-browser document preview.
- **Unicode RFC 5987 Downloads:** Proper UTF-8 filename encoding preserving Vietnamese diacritics on file download.

## 2. Known Limitations & Constraints
- Maximum file size per document is strictly capped at 80 MB.
- OCR fallback requires an active `LLAMA_CLOUD_API_KEY` for processing scanned image documents.
- Archive files (ZIP/RAR) are intentionally disallowed to prevent zip-bomb vulnerabilities.