import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import type { LibraryDocument } from "../types/document";
import { DocumentActions } from "./LibraryView";

const privateDocument: LibraryDocument = {
  id: "doc-id",
  title: "Private notes",
  description: "",
  subjectId: "subject-id",
  subject: "Algorithms",
  categoryId: "category-id",
  category: "Notes",
  tags: [],
  visibility: "PRIVATE",
  fileName: "notes.pdf",
  fileType: "PDF",
  fileSize: 1024,
  pages: 1,
  uploadedAt: "2026-08-06T00:00:00.000Z",
  indexStatus: "PROCESSING",
};

const text = (_vi: string, en: string) => en;

function renderActions(document: LibraryDocument, onPublish = vi.fn(), onUnpublish = vi.fn()) {
  render(
    <DocumentActions
      document={document}
      text={text}
      isRetrying={false}
      isPublishing={false}
      onPreview={vi.fn()}
      onDownload={vi.fn()}
      onRetry={vi.fn()}
      onPublish={onPublish}
      onUnpublish={onUnpublish}
      onDelete={vi.fn()}
    />,
  );
}

describe("Library document actions", () => {
  it("shows Publish for a private owned document and invokes the action", () => {
    const onPublish = vi.fn();
    renderActions(privateDocument, onPublish);

    fireEvent.click(
      screen.getByRole("button", { name: "Submit Private notes for review" }),
    );

    expect(onPublish).toHaveBeenCalledOnce();
  });

  it("shows Pending review while a public document awaits admin approval", () => {
    renderActions({ ...privateDocument, visibility: "PUBLIC", moderationStatus: "PENDING" });

    expect(screen.getByRole("button", { name: "Cancel review for Private notes" })).toHaveTextContent("Pending review");
  });

  it("lets the owner cancel a pending publication request", () => {
    const onUnpublish = vi.fn();
    renderActions({ ...privateDocument, visibility: "PUBLIC", moderationStatus: "PENDING" }, vi.fn(), onUnpublish);

    fireEvent.click(
      screen.getByRole("button", { name: "Cancel review for Private notes" }),
    );

    expect(onUnpublish).toHaveBeenCalledOnce();
  });

  it("shows Public after admin approval and lets the owner unpublish", () => {
    const onUnpublish = vi.fn();
    renderActions({ ...privateDocument, visibility: "PUBLIC", moderationStatus: "APPROVED" }, vi.fn(), onUnpublish);

    const button = screen.getByRole("button", { name: "Make Private notes private" });
    expect(button).toHaveTextContent("Public");
    fireEvent.click(button);

    expect(onUnpublish).toHaveBeenCalledOnce();
  });
});
