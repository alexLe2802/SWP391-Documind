# Office Preview Cache

## Goal
Reuse generated Office PDF previews and collapse concurrent preview requests so LibreOffice runs at most once per document.

## Tasks
- [x] Add failing storage tests for checking whether an R2 object exists.
- [x] Add failing document tests for cached and concurrent preview requests.
- [x] Implement R2 existence checks with `HeadObject`.
- [x] Reuse cached previews and share in-flight conversions in `DocumentsService`.
- [x] Run targeted tests, lint, and backend type-check.

## Done When
- [x] A cached `preview.pdf` is returned without downloading or converting the source.
- [x] Concurrent requests for one uncached document perform one conversion.
- [x] Existing fallback behavior remains covered and passing.
