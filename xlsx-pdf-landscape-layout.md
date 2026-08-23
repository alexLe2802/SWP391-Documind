# XLSX PDF Landscape Layout

## Goal
Prepare temporary XLSX previews as A4 landscape pages that fit all columns on one page width before LibreOffice converts them to PDF.

## Tasks
- [x] Add an OOXML print-layout transformer for every worksheet.
- [x] Set A4 landscape, 10 mm margins, one-page width, and automatic page height.
- [x] Apply the transformer only to temporary XLSX preview input.
- [x] Add unit tests for new and existing worksheet page settings.
- [x] Run backend format checks, lint, tests, and build.

## Done When
- [x] XLSX print settings fit columns to one page wide.
- [x] XLSX print settings leave page height automatic.
- [x] Uploaded XLSX files remain unchanged.

## Verification Note
Visual PDF rendering was unavailable because the host environment does not have LibreOffice or Poppler installed. The Docker image includes LibreOffice for runtime conversion.
