# MF-02: Document Upload and Processing Lifecycle

## 1. Overview
MF-02 covers document ingestion, validation, R2 storage offloading, and background AI preparation.

## 2. Request & Execution Flow
1. **Frontend (UploadDocumentView):** Validates file size (<=80MB) and extensions (PDF, DOCX, PPTX, XLSX), binds metadata, and sends FormData via XMLHttpRequest with upload progress.
2. **Backend Controller (DocumentsController):** Enforces authentication via FirebaseAuthGuard, validates payload via ParseFilePipe, and triggers DocumentsService.upload.
3. **Storage (StorageService):** Uploads binary buffer to Cloudflare R2 (`users/{ownerId}/{uuid}-{fileName}`) and persists metadata to PostgreSQL with PENDING status.
4. **AI Pipeline (ContentExtractionService):** Enqueues background job, performs text extraction/OCR fallback, creates RAG vector chunks, and scans content moderation.