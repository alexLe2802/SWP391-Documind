import type { CommunityDocument } from "../types/community";
import type { LibraryDocument } from "../types/document";
import type { Locale } from "./translations";

const libraryVi: Record<
  string,
  Pick<LibraryDocument, "description" | "subject" | "category">
> = {
  "79c555d8-b4ce-4d98-9f93-15f2fe1c9813": {
    description:
      "Đồng thuận, sao chép, mô hình lỗi và các đánh đổi trong thiết kế hệ thống.",
    subject: "Khoa học máy tính",
    category: "Hệ thống",
  },
  "16f32b32-68da-43bf-86a3-c9ad003a8a39": {
    description:
      "Câu hỏi nghiên cứu, tổng quan tài liệu, lấy mẫu và chất lượng bằng chứng.",
    subject: "Nghiên cứu",
    category: "Phương pháp luận",
  },
  "26ce9f92-23ad-4bba-b197-9196fb0c5ad6": {
    description:
      "Lựa chọn mô hình, chỉ số đánh giá, rò rỉ dữ liệu và kiểm tra triển khai.",
    subject: "Trí tuệ nhân tạo",
    category: "Học máy",
  },
  "9433ffbd-2fed-40b3-a7a3-16ef4153503e": {
    description:
      "B-tree, chỉ mục kết hợp, kế hoạch truy vấn và các lỗi hiệu năng thường gặp.",
    subject: "Khoa học máy tính",
    category: "Cơ sở dữ liệu",
  },
};

const communityVi: Record<
  string,
  Pick<CommunityDocument, "description" | "subject" | "category" | "updatedAt">
> = {
  "79c555d8-b4ce-4d98-9f93-15f2fe1c9813": {
    description:
      "Ghi chú cô đọng về đồng thuận, sao chép, mô hình lỗi và các đánh đổi trong thiết kế hệ thống.",
    subject: "Khoa học máy tính",
    category: "Hệ thống",
    updatedAt: "2 ngày trước",
  },
  "16f32b32-68da-43bf-86a3-c9ad003a8a39": {
    description:
      "Hướng dẫn có cấu trúc về câu hỏi nghiên cứu, tổng quan tài liệu, lấy mẫu và chất lượng bằng chứng.",
    subject: "Nghiên cứu",
    category: "Phương pháp luận",
    updatedAt: "5 ngày trước",
  },
  "26ce9f92-23ad-4bba-b197-9196fb0c5ad6": {
    description:
      "Giải thích bằng ví dụ về lựa chọn mô hình, chỉ số đánh giá, rò rỉ dữ liệu và kiểm tra triển khai.",
    subject: "Trí tuệ nhân tạo",
    category: "Học máy",
    updatedAt: "1 tuần trước",
  },
  "bc5df6ac-1334-4a6e-8acd-4d822985b481": {
    description:
      "Các cấu trúc có thể tái sử dụng cho lập luận, đoạn tổng hợp, trích dẫn và văn phong kỹ thuật rõ ràng.",
    subject: "Ngôn ngữ",
    category: "Viết học thuật",
    updatedAt: "1 tuần trước",
  },
  "9433ffbd-2fed-40b3-a7a3-16ef4153503e": {
    description:
      "B-tree, chỉ mục kết hợp, kế hoạch truy vấn và các lỗi hiệu năng thường gặp trong cơ sở dữ liệu quan hệ.",
    subject: "Khoa học máy tính",
    category: "Cơ sở dữ liệu",
    updatedAt: "2 tuần trước",
  },
  "132b3ce6-62bd-4a43-ad69-a119752ed09c": {
    description:
      "Câu hỏi phỏng vấn, bản đồ cơ hội, kiểm thử giả định và mẫu hội thảo cho đội ngũ sản phẩm.",
    subject: "Kinh doanh",
    category: "Sản phẩm",
    updatedAt: "3 tuần trước",
  },
};

// Thực hiện chức năng localize library tài liệu.
export function localizeLibraryDocument(
  document: LibraryDocument,
  locale: Locale,
): LibraryDocument {
  if (locale !== "vi") return document;

  const subjectLabels: Record<string, string> = {
    "Computer Science": "Khoa học máy tính",
    "Artificial Intelligence": "Trí tuệ nhân tạo",
    Research: "Nghiên cứu",
    Business: "Kinh doanh",
  };
  const categoryLabels: Record<string, string> = {
    Systems: "Hệ thống",
    Methodology: "Phương pháp luận",
    "Machine Learning": "Học máy",
    Database: "Cơ sở dữ liệu",
    "Lecture Notes": "Ghi chú bài giảng",
    "Research Paper": "Bài báo nghiên cứu",
    Reference: "Tài liệu tham khảo",
  };

  return {
    ...document,
    ...(libraryVi[document.id] ?? {}),
    subject: subjectLabels[document.subject] ?? document.subject,
    category: categoryLabels[document.category] ?? document.category,
  };
}

// Thực hiện chức năng localize cộng đồng tài liệu.
export function localizeCommunityDocument(
  document: CommunityDocument,
  locale: Locale,
): CommunityDocument {
  return locale === "vi" && communityVi[document.id]
    ? { ...document, ...communityVi[document.id] }
    : document;
}
