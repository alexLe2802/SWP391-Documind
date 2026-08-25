# MF-02: Supported Format Matrix & Failure Recovery Guide

## 1. Supported Document Format Matrix
- **PDF (.pdf):** Native text parsing using `pdf-parse`; automatic fallback to `LlamaParse OCR` for scanned/image-only PDFs.
- **Word (.docx):** Structured XML extraction via `mammoth` (preserving headings and bullet lists).
- **Presentations (.pptx):** Slide-by-slide text extraction including titles, shapes, and presenter notes.
- **Spreadsheets (.xlsx):** Multi-sheet tabular data parsing via `xlsx`.
- **Legacy Office (.doc, .ppt, .xls):** Converted to headless PDF via `LibreOffice` prior to text extraction.

## 2. Failure Handling & Recovery Mechanisms
- **Upload Failures:** If database metadata insertion fails, the uploaded binary in Cloudflare R2 is automatically rolled back.
- **Extraction Failures:** Background worker retries failed extraction jobs up to 3 times before transitioning `extractionStatus` to `FAILED`.
- **Network Resilience:** Presigned URLs (300s TTL) allow direct browser-to-CDN downloads, eliminating server bandwidth bottlenecks.