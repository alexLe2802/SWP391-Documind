type DocumentMeta = {
  fileType?: string | null;
  fileName?: string | null;
  title?: string | null;
};

type PreviewResult = {
  url: string;
  contentType?: string | null;
  fallbackToOfficeViewer?: boolean | null;
};

const OFFICE_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".dot",
  ".dotx",
  ".docm",
  ".xls",
  ".xlsx",
  ".xlt",
  ".xltx",
  ".xlsm",
  ".xlsb",
  ".ppt",
  ".pptx",
  ".pot",
  ".potx",
  ".pps",
  ".ppsx",
  ".pptm",
]);

const OFFICE_MIME_KEYWORDS = [
  "officedocument",
  "msword",
  "ms-word",
  "ms-excel",
  "ms-powerpoint",
  "wordprocessingml",
  "spreadsheetml",
  "presentationml",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/msword",
];

const OFFICE_TYPE_KEYWORDS = [
  "DOC",
  "DOCX",
  "XLS",
  "XLSX",
  "PPT",
  "PPTX",
  "WORD",
  "EXCEL",
  "POWERPOINT",
  "SPREADSHEET",
  "PRESENTATION",
];

function extractExtension(filePathOrUrl: string): string {
  try {
    const clean = filePathOrUrl.split("?")[0].split("#")[0];
    const lastDot = clean.lastIndexOf(".");
    if (lastDot !== -1) {
      return clean.slice(lastDot).toLowerCase();
    }
  } catch {
    // ignore
  }
  return "";
}

/**
 * Kiểm tra xem tài liệu có phải là định dạng Microsoft Office (Word, Excel, PowerPoint)
 * cần sử dụng Microsoft Office Online Viewer hay không.
 */
export function isOfficeDocument(
  doc?: DocumentMeta | null,
  result?: PreviewResult | null,
): boolean {
  if (result?.fallbackToOfficeViewer) {
    return true;
  }

  const contentType = (result?.contentType ?? "").toLowerCase();
  if (
    contentType &&
    OFFICE_MIME_KEYWORDS.some((keyword) => contentType.includes(keyword))
  ) {
    return true;
  }

  const fileType = (doc?.fileType ?? "").toUpperCase();
  if (
    fileType &&
    OFFICE_TYPE_KEYWORDS.some(
      (keyword) => fileType === keyword || fileType.includes(keyword),
    )
  ) {
    return true;
  }

  const candidateStrings = [
    doc?.fileName,
    doc?.title,
    result?.url,
  ].filter(Boolean) as string[];

  for (const candidate of candidateStrings) {
    const ext = extractExtension(candidate);
    if (ext && OFFICE_EXTENSIONS.has(ext)) {
      return true;
    }
  }

  return false;
}

/**
 * Tạo URL để nhúng xem trước trong iframe (embed mode).
 */
export function getPreviewFrameUrl(
  result: PreviewResult,
  doc?: DocumentMeta | null,
): string {
  if (!result.url) return "";
  return isOfficeDocument(doc, result)
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(result.url)}`
    : result.url;
}

/**
 * Tạo URL để mở xem toàn màn hình hoặc tab mới (view mode).
 */
export function getFullPreviewUrl(
  result: PreviewResult,
  doc?: DocumentMeta | null,
): string {
  if (!result.url) return "";
  return isOfficeDocument(doc, result)
    ? `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(result.url)}`
    : result.url;
}
