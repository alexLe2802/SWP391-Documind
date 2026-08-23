import type { LibraryDocument } from "../types/document";

export type SavedDocumentSort = "newest" | "oldest" | "title-asc" | "size-desc";

export type SavedDocumentFilters = {
  query: string;
  subject: string;
  fileType: string;
  sort: SavedDocumentSort;
};

// Thực hiện chức năng filter and sort đã lưu tài liệu.
export function filterAndSortSavedDocuments(
  documents: LibraryDocument[],
  filters: SavedDocumentFilters,
) {
  const query = filters.query.trim().toLocaleLowerCase();
  const result = documents.filter((document) => {
    const matchesSubject =
      !filters.subject || document.subject === filters.subject;
    const matchesFileType =
      !filters.fileType || document.fileType === filters.fileType;
    const searchableValues = [
      document.title,
      document.description,
      document.subject,
      document.category,
      document.fileName,
      ...document.tags,
    ];
    const matchesQuery =
      !query ||
      searchableValues.some((value) =>
        value.toLocaleLowerCase().includes(query),
      );
    return matchesSubject && matchesFileType && matchesQuery;
  });

  return result.sort((left, right) => {
    if (filters.sort === "oldest") {
      return (
        new Date(left.uploadedAt).getTime() -
        new Date(right.uploadedAt).getTime()
      );
    }
    if (filters.sort === "title-asc") {
      return left.title.localeCompare(right.title);
    }
    if (filters.sort === "size-desc") return right.fileSize - left.fileSize;
    return (
      new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime()
    );
  });
}
