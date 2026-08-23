export const MAX_DOCUMENT_FILE_SIZE = 80 * 1024 * 1024;

export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export const DOCUMENT_MIME_TYPE_PATTERN = new RegExp(
  `^(${DOCUMENT_MIME_TYPES.map((type) =>
    type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  ).join('|')})$`,
);

export const DOCUMENT_FILE_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
]);
