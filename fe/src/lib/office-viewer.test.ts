import { describe, expect, it } from "vitest";
import {
  getFullPreviewUrl,
  getPreviewFrameUrl,
  isOfficeDocument,
} from "./office-viewer";

describe("office-viewer", () => {
  const sampleR2Url = "https://r2.example.com/docs/file.docx?token=123";
  const samplePdfUrl = "https://r2.example.com/docs/file.pdf?token=123";

  describe("isOfficeDocument", () => {
    it("returns true when fallbackToOfficeViewer is true", () => {
      expect(
        isOfficeDocument(null, {
          url: samplePdfUrl,
          fallbackToOfficeViewer: true,
        }),
      ).toBe(true);
    });

    it("returns true for DOCX, XLSX, PPTX fileType strings", () => {
      expect(isOfficeDocument({ fileType: "DOCX" }, { url: samplePdfUrl })).toBe(
        true,
      );
      expect(isOfficeDocument({ fileType: "XLSX" }, { url: samplePdfUrl })).toBe(
        true,
      );
      expect(isOfficeDocument({ fileType: "PPTX" }, { url: samplePdfUrl })).toBe(
        true,
      );
      expect(isOfficeDocument({ fileType: "doc" }, { url: samplePdfUrl })).toBe(
        true,
      );
      expect(isOfficeDocument({ fileType: "xls" }, { url: samplePdfUrl })).toBe(
        true,
      );
    });

    it("returns true for Office MIME content types", () => {
      expect(
        isOfficeDocument(null, {
          url: "https://example.com/test",
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      ).toBe(true);
      expect(
        isOfficeDocument(null, {
          url: "https://example.com/test",
          contentType: "application/msword",
        }),
      ).toBe(true);
      expect(
        isOfficeDocument(null, {
          url: "https://example.com/test",
          contentType: "application/vnd.ms-excel",
        }),
      ).toBe(true);
    });

    it("returns true when fileName or title has an Office extension", () => {
      expect(
        isOfficeDocument({ fileName: "report.xlsx" }, { url: "https://example.com" }),
      ).toBe(true);
      expect(
        isOfficeDocument({ title: "presentation.pptx" }, { url: "https://example.com" }),
      ).toBe(true);
      expect(
        isOfficeDocument({ fileName: "doc.docx" }, { url: "https://example.com" }),
      ).toBe(true);
    });

    it("returns false for PDF, images, and other types", () => {
      expect(
        isOfficeDocument(
          { fileType: "PDF", fileName: "document.pdf" },
          { url: samplePdfUrl, contentType: "application/pdf" },
        ),
      ).toBe(false);
    });
  });

  describe("getPreviewFrameUrl", () => {
    it("embeds Office document URL into officeapps.live.com embed url", () => {
      const result = getPreviewFrameUrl(
        { url: sampleR2Url },
        { fileType: "DOCX" },
      );
      expect(result).toBe(
        `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sampleR2Url)}`,
      );
    });

    it("leaves PDF and regular URLs unchanged", () => {
      const result = getPreviewFrameUrl(
        { url: samplePdfUrl, contentType: "application/pdf" },
        { fileType: "PDF" },
      );
      expect(result).toBe(samplePdfUrl);
    });
  });

  describe("getFullPreviewUrl", () => {
    it("embeds Office document URL into officeapps.live.com view url", () => {
      const result = getFullPreviewUrl(
        { url: sampleR2Url },
        { fileType: "XLSX" },
      );
      expect(result).toBe(
        `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(sampleR2Url)}`,
      );
    });

    it("leaves PDF and regular URLs unchanged", () => {
      const result = getFullPreviewUrl(
        { url: samplePdfUrl, contentType: "application/pdf" },
        { fileType: "PDF" },
      );
      expect(result).toBe(samplePdfUrl);
    });
  });
});
