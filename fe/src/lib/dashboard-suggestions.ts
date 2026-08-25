import type { Locale } from "../i18n/translations";
import type { LibraryDocument } from "../types/document";

const MAX_SUGGESTIONS = 4;

const templates: Record<Locale, Array<(title: string) => string>> = {
  vi: [
    (title) => `Tóm tắt những ý chính trong “${title}”`,
    (title) => `Tạo câu hỏi ôn tập từ “${title}”`,
    (title) => `Giải thích các khái niệm quan trọng trong “${title}”`,
    (title) => `Lập kế hoạch học tập dựa trên “${title}”`,
  ],
  en: [
    (title) => `Summarize the key ideas in “${title}”`,
    (title) => `Create review questions from “${title}”`,
    (title) => `Explain the important concepts in “${title}”`,
    (title) => `Create a study plan based on “${title}”`,
  ],
};

// Chuyển đổi hoặc chuẩn hóa dashboard suggestions.
export function buildDashboardSuggestions(
  documents: LibraryDocument[],
  locale: Locale,
): string[] {
  const readyDocuments = documents.filter(
    (document) => document.indexStatus === "READY",
  );
  if (readyDocuments.length === 0) return [];

  return Array.from({ length: MAX_SUGGESTIONS }, (_, index) => {
    const document = readyDocuments[index % readyDocuments.length];
    return templates[locale][index](document.title);
  });
}
