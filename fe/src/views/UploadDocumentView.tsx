"use client";

import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  CloudUpload,
  FileText,
  Globe2,
  LoaderCircle,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  ACCEPTED_FILE_EXTENSIONS,
  createCategory,
  createSubject,
  fetchCategories,
  fetchExtractionStatus,
  fetchSubjects,
  formatFileSize,
  getMissingUploadFields,
  retryExtraction,
  uploadDocument,
  validateDocumentFile,
  type CategoryItem,
  type SubjectItem,
} from "../api/documents.api";
import type { DocumentVisibility, LibraryDocument } from "../types/document";
import { useLanguage } from "../i18n/LanguageProvider";
import { localize } from "../i18n/localize";
import { ROUTES } from "../lib/routes";

type UploadPhase = "idle" | "uploading" | "extracting" | "success" | "error";

const MAX_DOCUMENT_TITLE_LENGTH = 120;

// Thực hiện chức năng wait.
const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

// Thực hiện chức năng sort taxonomy items.
function sortTaxonomyItems<T extends { name: string }>(items: T[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

// Thực hiện chức năng unique taxonomy items.
function uniqueTaxonomyItems<T extends { id: string; name: string }>(
  items: T[],
) {
  return sortTaxonomyItems([
    ...new Map(items.map((item) => [item.id, item])).values(),
  ]);
}

// Thực hiện chức năng upsert taxonomy item.
function upsertTaxonomyItem<T extends { id: string; name: string }>(
  items: T[],
  item: T,
) {
  return uniqueTaxonomyItems([
    ...items.filter((current) => current.id !== item.id),
    item,
  ]);
}

// Hiển thị giao diện tải lên tài liệu view.
export function UploadDocumentView() {
  const { locale } = useLanguage();
  const text = useCallback(
    (vi: string, en: string) => localize(locale, vi, en),
    [locale],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [invalidFileName, setInvalidFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<DocumentVisibility>("PRIVATE");
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [taxonomyError, setTaxonomyError] = useState("");
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectCode, setNewSubjectCode] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreatingTaxonomy, setIsCreatingTaxonomy] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [createdDocument, setCreatedDocument] = useState<LibraryDocument>();

  useEffect(() => {
    let active = true;
    Promise.all([fetchSubjects(), fetchCategories()])
      .then(([subjectItems, categoryItems]) => {
        if (!active) return;
        setSubjects(uniqueTaxonomyItems(subjectItems));
        setCategories(uniqueTaxonomyItems(categoryItems));
      })
      .catch((error: unknown) => {
        if (active) {
          setTaxonomyError(
            error instanceof Error
              ? error.message
              : text(
                  "Không thể tải dữ liệu phân loại.",
                  "Could not load classification data.",
                ),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [text]);

  const selectedSubject = subjects.find((item) => item.id === subjectId);
  const availableCategories = useMemo(
    () => categories.filter((item) => item.subjectId === subjectId),
    [categories, subjectId],
  );
  const selectedCategory = availableCategories.find(
    (item) => item.id === categoryId,
  );
  const missingFields = useMemo(
    () => getMissingUploadFields({ file, title, subjectId, categoryId }),
    [categoryId, file, subjectId, title],
  );
  const isBusy = phase === "uploading" || phase === "extracting";
  const canSubmit = missingFields.length === 0 && !fileError && !isBusy;

  const helperText = useMemo(() => {
    if (canSubmit)
      return text(
        "Mọi thông tin bắt buộc đã sẵn sàng.",
        "All required information is ready.",
      );
    const labels = missingFields.map((field) => {
      if (field === "file") return text("tệp", "a file");
      if (field === "title") return text("tiêu đề", "a title");
      if (field === "subject") return text("môn học", "a subject");
      return text("danh mục", "a category");
    });
    return text(
      `Vui lòng bổ sung: ${labels.join(", ")}.`,
      `Add ${labels.join(", ")} to continue.`,
    );
  }, [canSubmit, missingFields, text]);

  // Thực hiện chức năng select tệp.
  function selectFile(nextFile?: File) {
    if (!nextFile) return;
    const validationError = validateDocumentFile(nextFile, locale);
    if (validationError) {
      setFile(undefined);
      setInvalidFileName(nextFile.name);
      setFileError(validationError);
      return;
    }
    setFile(nextFile);
    setInvalidFileName("");
    setFileError("");
    setErrorMessage("");
    if (!title.trim()) {
      setTitle(
        nextFile.name
          .replace(/\.[^.]+$/, "")
          .slice(0, MAX_DOCUMENT_TITLE_LENGTH),
      );
    }
  }

  // Xóa hoặc giải phóng tệp.
  function clearFile() {
    setFile(undefined);
    setInvalidFileName("");
    setFileError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  // Xử lý sự kiện tệp change.
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
  }

  // Xử lý sự kiện drop.
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!isBusy) selectFile(event.dataTransfer.files[0]);
  }

  // Tạo hoặc lưu thẻ.
  function addTag() {
    const value = tagInput.trim().toLowerCase();
    if (!value || tags.includes(value) || tags.length >= 10) return;
    setTags((current) => [...current, value]);
    setTagInput("");
  }

  // Xử lý sự kiện thẻ key down.
  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addTag();
    }
  }

  // Xử lý sự kiện create môn học.
  async function handleCreateSubject() {
    const name = newSubjectName.trim();
    if (!name) return;
    setIsCreatingTaxonomy(true);
    setTaxonomyError("");
    try {
      const item = await createSubject(
        name,
        (newSubjectCode.trim() || name.slice(0, 3)).toUpperCase(),
      );
      setSubjects((current) => upsertTaxonomyItem(current, item));
      setSubjectId(item.id);
      setNewSubjectName("");
      setNewSubjectCode("");
      setIsAddingSubject(false);
    } catch (error) {
      setTaxonomyError(
        error instanceof Error
          ? error.message
          : text("Không thể tạo môn học.", "Could not create subject."),
      );
    } finally {
      setIsCreatingTaxonomy(false);
    }
  }

  // Xử lý sự kiện create danh mục.
  async function handleCreateCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    if (!subjectId) {
      setTaxonomyError(
        text(
          "Hãy chọn môn học trước khi thêm danh mục.",
          "Select a subject before adding a category.",
        ),
      );
      return;
    }
    setIsCreatingTaxonomy(true);
    setTaxonomyError("");
    try {
      const item = await createCategory(name, subjectId);
      setCategories((current) => upsertTaxonomyItem(current, item));
      setCategoryId(item.id);
      setNewCategoryName("");
      setIsAddingCategory(false);
    } catch (error) {
      setTaxonomyError(
        error instanceof Error
          ? error.message
          : text("Không thể tạo danh mục.", "Could not create category."),
      );
    } finally {
      setIsCreatingTaxonomy(false);
    }
  }

  // Thực hiện chức năng poll extraction.
  async function pollExtraction(document: LibraryDocument) {
    setPhase("extracting");
    setExtractionProgress(0);
    for (;;) {
      const status = await fetchExtractionStatus(document.id);
      setExtractionProgress(status.progress ?? 0);
      if (
        status.extractionStatus === "COMPLETED" ||
        status.extractionStatus === "MOCKED"
      ) {
        setCreatedDocument({ ...document, indexStatus: "READY" });
        setExtractionProgress(100);
        setPhase("success");
        return;
      }
      if (status.extractionStatus === "FAILED") {
        setCreatedDocument({ ...document, indexStatus: "FAILED" });
        setErrorMessage(
          status.errorMessage ||
            text("Chuẩn bị AI thất bại.", "AI preparation failed."),
        );
        setPhase("error");
        return;
      }
      await wait(2000);
    }
  }

  // Thực hiện chức năng submit.
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || !file) return;
    setPhase("uploading");
    setUploadProgress(0);
    setExtractionProgress(0);
    setErrorMessage("");
    try {
      const document = await uploadDocument(
        {
          title: title.trim(),
          description: description.trim(),
          subjectId,
          categoryId,
          tags,
          visibility,
          file,
        },
        setUploadProgress,
      );
      setCreatedDocument(document);
      setUploadProgress(100);
      await pollExtraction(document);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text(
              "Không thể tải tài liệu lên.",
              "Could not upload the document.",
            ),
      );
      setPhase("error");
    }
  }

  // Xử lý sự kiện retry extraction.
  async function handleRetryExtraction() {
    if (!createdDocument) return;
    setErrorMessage("");
    setPhase("extracting");
    try {
      await retryExtraction(createdDocument.id);
      await pollExtraction(createdDocument);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : text("Không thể thử lại.", "Could not retry."),
      );
      setPhase("error");
    }
  }

  // Cập nhật form.
  function resetForm() {
    clearFile();
    setTitle("");
    setDescription("");
    setSubjectId("");
    setCategoryId("");
    setTags([]);
    setTagInput("");
    setVisibility("PRIVATE");
    setUploadProgress(0);
    setExtractionProgress(0);
    setCreatedDocument(undefined);
    setErrorMessage("");
    setPhase("idle");
  }

  useEffect(() => {
    if (
      categoryId &&
      !availableCategories.some((item) => item.id === categoryId)
    ) {
      setCategoryId("");
    }
  }, [availableCategories, categoryId]);

  if (phase === "success" && createdDocument) {
    return (
      <main id="main-content" className="upload-page">
        <section className="upload-success upload-success--complete">
          <span className="success-icon">
            <Check size={24} />
          </span>
          <div>
            <p className="eyebrow">
              {text("TẢI LÊN HOÀN TẤT", "UPLOAD COMPLETE")}
            </p>
            <h1>{createdDocument.title}</h1>
            <p>
              {text(
                "Tài liệu đã được lưu và sẵn sàng để hỏi AI.",
                "Your document is stored and ready for AI questions.",
              )}
            </p>
            <div className="extraction-steps">
              {[
                text("Đã kiểm tra tệp", "File validated"),
                text("Đã lưu an toàn", "Stored securely"),
                text("Đã trích xuất nội dung", "Content extracted"),
                text("AI đã sẵn sàng", "AI ready"),
              ].map((label) => (
                <span className="done" key={label}>
                  <Check size={14} /> {label}
                </span>
              ))}
            </div>
            <div className="upload-success-actions">
              <Link
                href={`${ROUTES.library}?document=${createdDocument.id}`}
                className="primary-button"
              >
                {text("Xem tài liệu", "View document")}
              </Link>
              <Link
                href={`${ROUTES.aiChat}?scope=document&document=${createdDocument.id}`}
                className="secondary-button"
              >
                {text("Hỏi AI", "Ask AI")}
              </Link>
              <button
                type="button"
                className="secondary-button"
                onClick={resetForm}
              >
                {text("Tải tài liệu khác", "Upload another document")}
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="upload-page">
      <header className="upload-heading">
        <p className="eyebrow">{text("TẢI TÀI LIỆU LÊN", "UPLOAD DOCUMENT")}</p>
        <h1>
          {text(
            "Thêm nguồn vào thư viện kiến thức.",
            "Add a source to your knowledge library.",
          )}
        </h1>
        <p>
          {text(
            "Tải tệp, phân loại và chuẩn bị nội dung để làm việc cùng AI.",
            "Upload, classify, and prepare a source for AI-assisted study.",
          )}
        </p>
      </header>

      <form className="upload-workspace" onSubmit={submit}>
        <section className="upload-main">
          <div className="upload-form-section upload-section-card">
            <SectionHeading
              number="01"
              title={text("Chọn tài liệu", "Choose document")}
              description={text(
                "PDF, DOCX, PPTX hoặc XLSX · Tối đa 80 MB",
                "PDF, DOCX, PPTX, or XLSX · Maximum 80 MB",
              )}
            />
            <div
              className={`upload-dropzone${fileError ? " error" : file ? " selected" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                type="file"
                hidden
                accept={ACCEPTED_FILE_EXTENSIONS.map((item) => `.${item}`).join(
                  ",",
                )}
                onChange={handleFileChange}
              />
              {file ? (
                <>
                  <span className="upload-file-icon">
                    <FileText size={24} />
                  </span>
                  <div className="selected-file-copy">
                    <strong title={file.name}>{file.name}</strong>
                    <p>
                      {file.name.split(".").pop()?.toUpperCase()} ·{" "}
                      {formatFileSize(file.size)}
                    </p>
                    <span className="file-valid">
                      <CheckCircle2 size={14} />{" "}
                      {text("Tệp hợp lệ", "Valid file")}
                    </span>
                  </div>
                  <div className="selected-file-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => inputRef.current?.click()}
                    >
                      {text("Đổi tệp", "Change")}
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={clearFile}
                      aria-label={text("Xóa tệp", "Remove file")}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </>
              ) : fileError ? (
                <>
                  <span className="upload-file-icon upload-file-icon--error">
                    <X size={24} />
                  </span>
                  <strong>{invalidFileName}</strong>
                  <p className="form-error">{fileError}</p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => inputRef.current?.click()}
                  >
                    {text("Chọn tệp khác", "Choose another file")}
                  </button>
                </>
              ) : (
                <>
                  <span className="upload-cloud">
                    <CloudUpload size={28} />
                  </span>
                  <strong>
                    {text(
                      "Kéo thả tài liệu vào đây",
                      "Drag and drop your document here",
                    )}
                  </strong>
                  <p>
                    {text(
                      "Hoặc chọn một tệp từ thiết bị",
                      "Or browse a file from your device",
                    )}
                  </p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => inputRef.current?.click()}
                  >
                    {text("Chọn tệp", "Choose file")}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="upload-form-section upload-section-card">
            <SectionHeading
              number="02"
              title={text("Thông tin tài liệu", "Document information")}
            />
            <div className="upload-form-grid">
              <label className="full-field">
                {text("Tiêu đề", "Title")}
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={MAX_DOCUMENT_TITLE_LENGTH}
                  required
                  disabled={isBusy}
                />
              </label>
              <label className="full-field">
                {text("Mô tả", "Description")}
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  disabled={isBusy}
                />
              </label>
            </div>
          </div>

          <div className="upload-form-section upload-section-card">
            <SectionHeading
              number="03"
              title={text("Phân loại", "Classification")}
              description={text(
                "Bắt buộc để sắp xếp tài liệu trong Library.",
                "Required to organize the document in your Library.",
              )}
            />
            <div className="upload-form-grid">
              <QuickTaxonomyField
                label={text("Môn học", "Subject")}
                adding={isAddingSubject}
                setAdding={setIsAddingSubject}
                value={subjectId}
                setValue={setSubjectId}
                options={subjects}
                placeholder={text("Chọn môn học", "Select subject")}
                disabled={isBusy}
              >
                <input
                  value={newSubjectName}
                  onChange={(event) => setNewSubjectName(event.target.value)}
                  placeholder={text("Tên môn học", "Subject name")}
                />
                <input
                  value={newSubjectCode}
                  onChange={(event) => setNewSubjectCode(event.target.value)}
                  placeholder={text("Mã môn học", "Subject code")}
                />
                <button
                  type="button"
                  className="quick-add-submit-btn"
                  onClick={handleCreateSubject}
                  disabled={isCreatingTaxonomy || !newSubjectName.trim()}
                >
                  {text("Lưu", "Save")}
                </button>
              </QuickTaxonomyField>
              <QuickTaxonomyField
                label={text("Danh mục", "Category")}
                adding={isAddingCategory}
                setAdding={setIsAddingCategory}
                value={categoryId}
                setValue={setCategoryId}
                options={availableCategories}
                placeholder={text("Chọn danh mục", "Select category")}
                disabled={isBusy || !subjectId}
              >
                <input
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  placeholder={text("Tên danh mục", "Category name")}
                />
                <button
                  type="button"
                  className="quick-add-submit-btn"
                  onClick={handleCreateCategory}
                  disabled={isCreatingTaxonomy || !newCategoryName.trim()}
                >
                  {text("Lưu", "Save")}
                </button>
              </QuickTaxonomyField>
            </div>
            {taxonomyError ? (
              <p className="form-error">{taxonomyError}</p>
            ) : null}
          </div>

          <div className="upload-form-section upload-section-card">
            <SectionHeading
              number="04"
              title={text("Thẻ", "Tags")}
              description={text(
                "Nhập thẻ và nhấn Enter · Tối đa 10 thẻ",
                "Type a tag and press Enter · Up to 10 tags",
              )}
            />
            <div className="tag-input">
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={handleTagKeyDown}
                maxLength={50}
                disabled={isBusy || tags.length >= 10}
                placeholder={text(
                  "Ví dụ: machine-learning",
                  "Example: machine-learning",
                )}
              />
              <button
                type="button"
                onClick={addTag}
                disabled={!tagInput.trim() || tags.length >= 10}
              >
                {text("Thêm", "Add")}
              </button>
            </div>
            {tags.length ? (
              <div className="tag-list">
                {tags.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() =>
                      setTags((current) =>
                        current.filter((item) => item !== tag),
                      )
                    }
                  >
                    {tag}
                    <X size={12} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="upload-form-section upload-section-card">
            <SectionHeading
              number="05"
              title={text("Quyền hiển thị", "Visibility")}
            />
            <div className="visibility-options visibility-options--cards">
              <button
                type="button"
                className={visibility === "PRIVATE" ? "active" : ""}
                onClick={() => setVisibility("PRIVATE")}
                disabled={isBusy}
              >
                <Lock size={20} />
                <span>
                  <strong>{text("Riêng tư", "Private")}</strong>
                  <small>
                    {text(
                      "Chỉ bạn có thể truy cập tài liệu này",
                      "Only you can access this document",
                    )}
                  </small>
                </span>
                {visibility === "PRIVATE" ? <CheckCircle2 size={18} /> : null}
              </button>
              <button
                type="button"
                className={visibility === "PUBLIC" ? "active" : ""}
                onClick={() => setVisibility("PUBLIC")}
                disabled={isBusy}
              >
                <Globe2 size={20} />
                <span>
                  <strong>
                    {text("Cộng đồng / Công khai", "Community / Public")}
                  </strong>
                  <small>
                    {text(
                      "Admin phải duyệt trước khi tài liệu xuất hiện trên cộng đồng",
                      "Admin approval is required before this appears in Community",
                    )}
                  </small>
                </span>
                {visibility === "PUBLIC" ? <CheckCircle2 size={18} /> : null}
              </button>
            </div>
          </div>

          <div className="upload-primary-action">
            <SubmitButton
              busy={isBusy}
              disabled={!canSubmit}
              label={text(
                "Tải lên và chuẩn bị cho AI",
                "Upload and prepare for AI",
              )}
            />
            <p>{helperText}</p>
          </div>
        </section>

        <aside className="upload-side upload-side--sticky">
          <div className="upload-summary-card">
            <p className="eyebrow">
              {text("TÓM TẮT TẢI LÊN", "UPLOAD SUMMARY")}
            </p>
            <dl className="upload-summary-list">
              <SummaryRow
                label={text("Tệp", "File")}
                value={file?.name || text("Chưa chọn tệp", "No file selected")}
                ready={Boolean(file)}
              />
              <SummaryRow
                label={text("Môn học", "Subject")}
                value={
                  selectedSubject?.name || text("Chưa chọn", "Not selected")
                }
                ready={Boolean(selectedSubject)}
              />
              <SummaryRow
                label={text("Danh mục", "Category")}
                value={
                  selectedCategory?.name || text("Chưa chọn", "Not selected")
                }
                ready={Boolean(selectedCategory)}
              />
              <SummaryRow
                label={text("Hiển thị", "Visibility")}
                value={
                  visibility === "PRIVATE"
                    ? text("Riêng tư", "Private")
                    : text("Cộng đồng", "Community")
                }
                ready
              />
              <SummaryRow
                label={text("AI", "AI readiness")}
                value={
                  phase === "extracting"
                    ? text("Đang chuẩn bị", "Preparing")
                    : phase === "success"
                      ? text("Sẵn sàng", "Ready")
                      : text("Chờ tải lên", "Waiting for upload")
                }
                ready={phase === "success"}
              />
            </dl>
          </div>

          <div className="extraction-preview">
            <p className="eyebrow">
              {text("CHUẨN BỊ CHO AI", "AI PREPARATION")}
            </p>
            <ol>
              {[
                text("Kiểm tra tệp và metadata", "Validate file and metadata"),
                text("Lưu tệp an toàn", "Store file securely"),
                text(
                  "Trích xuất nội dung có thể đọc",
                  "Extract readable content",
                ),
                text(
                  "Chuẩn bị ngữ cảnh tìm kiếm cho AI",
                  "Prepare searchable AI context",
                ),
              ].map((step, index) => (
                <li
                  key={step}
                  className={
                    phase === "extracting" && index < 2 ? "active" : ""
                  }
                >
                  <span>{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {isBusy || uploadProgress > 0 ? (
            <div className="upload-progress-stack">
              <Progress
                label={text("Tải tệp lên", "File upload")}
                value={uploadProgress}
                active={phase === "uploading"}
              />
              <Progress
                label={text(
                  "Trích xuất và lập chỉ mục",
                  "Extraction and indexing",
                )}
                value={extractionProgress}
                active={phase === "extracting"}
              />
            </div>
          ) : null}

          {phase === "error" && errorMessage ? (
            <div className="upload-error-card" role="alert">
              <strong>
                {createdDocument
                  ? text(
                      "Tệp đã lưu, AI chưa sẵn sàng",
                      "File saved, AI not ready",
                    )
                  : text("Tải lên thất bại", "Upload failed")}
              </strong>
              <p>{errorMessage}</p>
              {createdDocument ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleRetryExtraction}
                >
                  <RefreshCw size={16} />
                  {text("Thử chuẩn bị AI lại", "Retry AI preparation")}
                </button>
              ) : null}
            </div>
          ) : null}

          <SubmitButton
            busy={isBusy}
            disabled={!canSubmit}
            label={text(
              "Tải lên và chuẩn bị cho AI",
              "Upload and prepare for AI",
            )}
            secondary
          />
          <p className="upload-submit-helper">{helperText}</p>
          <div className="secure-upload-note">
            <ShieldCheck size={16} />
            {text(
              "Tệp được lưu riêng tư và truyền qua kết nối an toàn.",
              "Files are stored privately and transferred securely.",
            )}
          </div>
        </aside>
      </form>
    </main>
  );
}

// Hiển thị giao diện section heading.
function SectionHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="section-heading">
      <span>{number}</span>
      <div>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  );
}

// Hiển thị giao diện quick taxonomy field.
function QuickTaxonomyField({
  label,
  adding,
  setAdding,
  value,
  setValue,
  options,
  placeholder,
  disabled,
  children,
}: {
  label: string;
  adding: boolean;
  setAdding: (value: boolean) => void;
  value: string;
  setValue: (value: string) => void;
  options: Array<{ id: string; name: string; code?: string }>;
  placeholder: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="upload-field-container">
      <div className="field-header">
        <span>{label}</span>
        <button
          type="button"
          className="quick-add-toggle-btn"
          onClick={() => setAdding(!adding)}
          disabled={disabled}
        >
          {adding ? "Hủy" : "+ Thêm nhanh"}
        </button>
      </div>
      {adding ? (
        <div className="quick-add-form">{children}</div>
      ) : (
        <select
          value={value}
          onChange={(event) => setValue(event.target.value)}
          required
          disabled={disabled}
        >
          <option value="">{placeholder}</option>
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.code ? ` (${item.code})` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// Hiển thị giao diện summary row.
function SummaryRow({
  label,
  value,
  ready,
}: {
  label: string;
  value: string;
  ready: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={ready ? "ready" : ""} title={value}>
        <span>{value}</span>
        {ready ? <CheckCircle2 size={14} /> : null}
      </dd>
    </div>
  );
}

// Hiển thị giao diện progress.
function Progress({
  label,
  value,
  active,
}: {
  label: string;
  value: number;
  active: boolean;
}) {
  return (
    <div className={`upload-progress${active ? " active" : ""}`}>
      <div>
        <strong>{label}</strong>
        <span>{value}%</span>
      </div>
      <span className="progress-track">
        <span style={{ width: `${value}%` }} />
      </span>
    </div>
  );
}

// Hiển thị giao diện submit button.
function SubmitButton({
  busy,
  disabled,
  label,
  secondary = false,
}: {
  busy: boolean;
  disabled: boolean;
  label: string;
  secondary?: boolean;
}) {
  return (
    <button
      type="submit"
      className={`upload-submit${secondary ? " upload-submit--secondary" : ""}`}
      disabled={disabled}
    >
      {busy ? (
        <LoaderCircle className="spin" size={18} />
      ) : (
        <Sparkles size={18} />
      )}
      {busy ? "Đang chuẩn bị..." : label}
    </button>
  );
}
