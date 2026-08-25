"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Check,
  Link2,
  LoaderCircle,
  Mail,
  Pencil,
  Save,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { getProfile } from "../api/profile.api";
import { useAuth } from "../features/auth/useAuth";
import type { UserProfile } from "../types/auth";
import { useLanguage } from "../i18n/LanguageProvider";
import { localize } from "../i18n/localize";
import {
  AVATAR_ACCEPT,
  uploadProfileAvatar,
  validateAvatarFile,
} from "../lib/profile-avatar";

// Hiển thị giao diện hồ sơ view.
export function ProfileView() {
  const { locale } = useLanguage();
  // Thực hiện chức năng text.
  const text = (vi: string, en: string) => localize(locale, vi, en);
  const { user, updateProfile } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [avatarUrlDraft, setAvatarUrlDraft] = useState(user?.avatarUrl ?? "");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    getProfile()
      .then((nextProfile) => {
        if (!active) return;
        setProfile(nextProfile);
        setFullName(nextProfile.fullName);
        setAvatarUrl(nextProfile.avatarUrl ?? "");
        setAvatarUrlDraft(nextProfile.avatarUrl ?? "");
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : localize(
                locale,
                "Không thể tải hồ sơ.",
                "Could not load your profile.",
              ),
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [locale]);

  const displayName =
    profile?.fullName ??
    user?.fullName ??
    text("Thành viên học tập", "Study member");
  const currentAvatar = avatarUrl.trim();
  const initial = displayName.charAt(0).toUpperCase();
  const hasChanges =
    fullName.trim() !== (profile?.fullName ?? user?.fullName ?? "") ||
    currentAvatar !== (profile?.avatarUrl ?? user?.avatarUrl ?? "");

  // Hiển thị hoặc mở avatar editor.
  function openAvatarEditor() {
    setAvatarUrlDraft(avatarUrl);
    setIsAvatarEditorOpen(true);
  }

  // Thực hiện chức năng apply avatar url.
  function applyAvatarUrl() {
    setAvatarUrl(avatarUrlDraft.trim());
    setAvatarFailed(false);
    setError("");
    setSuccess("");
    setIsAvatarEditorOpen(false);
  }

  // Xóa hoặc giải phóng avatar.
  function removeAvatar() {
    setAvatarUrl("");
    setAvatarUrlDraft("");
    setAvatarFailed(false);
    setError("");
    setSuccess("");
    setIsAvatarEditorOpen(false);
  }

  // Xử lý sự kiện avatar tệp.
  async function handleAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    event.target.value = "";
    if (!nextFile || !user?.id) return;

    const validationError = validateAvatarFile(nextFile);
    if (validationError) {
      setError(
        validationError === "size"
          ? text(
              "Ảnh đại diện không được vượt quá 5 MB.",
              "Avatar images must be 5 MB or smaller.",
            )
          : text(
              "Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc GIF.",
              "Only JPG, PNG, WEBP, or GIF images are supported.",
            ),
      );
      return;
    }

    setError("");
    setSuccess("");
    setIsUploadingAvatar(true);

    try {
      const downloadUrl = await uploadProfileAvatar(user.id, nextFile);
      setAvatarUrl(downloadUrl);
      setAvatarUrlDraft(downloadUrl);
      setAvatarFailed(false);
      setIsAvatarEditorOpen(false);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : text(
              "Không thể tải ảnh đại diện lên.",
              "Could not upload the avatar image.",
            ),
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  // Thực hiện chức năng submit.
  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = fullName.trim();
    if (!trimmedName || trimmedName.length > 100) return;

    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const updatedUser = await updateProfile({
        fullName: trimmedName,
        avatarUrl: currentAvatar || null,
      });
      const nextProfile: UserProfile = {
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        avatarUrl: updatedUser.avatarUrl,
        role: updatedUser.role,
        status: updatedUser.status,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt ?? new Date().toISOString(),
      };
      setProfile(nextProfile);
      setFullName(nextProfile.fullName);
      setAvatarUrl(nextProfile.avatarUrl ?? "");
      setAvatarUrlDraft(nextProfile.avatarUrl ?? "");
      setAvatarFailed(false);
      setSuccess(
        text("Đã lưu hồ sơ thành công.", "Profile saved successfully."),
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : text("Không thể lưu hồ sơ.", "Could not save your profile."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="profile-page" id="main-content">
      <header className="profile-page-heading">
        <div>
          <p className="eyebrow">
            {text("CÀI ĐẶT TÀI KHOẢN", "ACCOUNT SETTINGS")}
          </p>
          <h1>
            {text("Thông tin hồ sơ của bạn.", "Your profile, kept current.")}
          </h1>
          <p>
            {text(
              "Quản lý thông tin hiển thị trong thư viện, cộng đồng và không gian AI.",
              "Manage the identity shown across your library, community sources, and AI workspace.",
            )}
          </p>
        </div>
        <span
          className={`profile-state profile-state--${(profile?.status ?? user?.status ?? "ACTIVE").toLowerCase()}`}
        >
          <ShieldCheck size={15} />
          {profile?.status ?? user?.status}
        </span>
      </header>

      <section className="profile-layout">
        <aside className="profile-identity-panel">
          <div className="profile-avatar-control">
            <button
              type="button"
              className="profile-avatar-frame"
              onClick={openAvatarEditor}
              aria-label={text("Chỉnh sửa ảnh đại diện", "Edit avatar")}
              aria-expanded={isAvatarEditorOpen}
              disabled={isLoading || isSaving || isUploadingAvatar}
            >
              {currentAvatar && !avatarFailed ? (
                <Image
                  src={currentAvatar}
                  alt={`${displayName} ${text("ảnh đại diện", "avatar")}`}
                  width={128}
                  height={128}
                  unoptimized
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <span>{initial}</span>
              )}
              <span className="profile-avatar-edit-icon" aria-hidden="true">
                {isUploadingAvatar ? (
                  <LoaderCircle className="spin" size={22} />
                ) : (
                  <Pencil size={22} />
                )}
              </span>
            </button>

            {isAvatarEditorOpen ? (
              <div className="profile-avatar-editor">
                <header>
                  <strong>{text("Ảnh đại diện", "Profile picture")}</strong>
                  <button
                    type="button"
                    onClick={() => setIsAvatarEditorOpen(false)}
                    aria-label={text("Đóng", "Close")}
                  >
                    <X size={16} />
                  </button>
                </header>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept={AVATAR_ACCEPT}
                  hidden
                  onChange={handleAvatarFile}
                />
                <button
                  type="button"
                  className="profile-avatar-upload"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Upload size={17} />
                  {text("Tải ảnh lên", "Upload image")}
                </button>
                <span className="profile-avatar-divider">
                  {text("hoặc dán URL", "or paste a URL")}
                </span>
                <label>
                  <Link2 size={16} />
                  <input
                    value={avatarUrlDraft}
                    onChange={(event) => setAvatarUrlDraft(event.target.value)}
                    type="url"
                    maxLength={2048}
                    placeholder="https://example.com/avatar.jpg"
                  />
                </label>
                <div className="profile-avatar-editor-actions">
                  {avatarUrl ? (
                    <button
                      type="button"
                      className="profile-avatar-remove"
                      onClick={removeAvatar}
                    >
                      {text("Xóa ảnh", "Remove")}
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    className="profile-avatar-apply"
                    onClick={applyAvatarUrl}
                  >
                    {text("Áp dụng", "Apply")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div>
            <p className="eyebrow">
              {text("THÀNH VIÊN DOCUMIND", "DOCUMIND MEMBER")}
            </p>
            <h2>{displayName}</h2>
            <p>{profile?.email ?? user?.email}</p>
          </div>
          <div className="profile-badges">
            <span className="status-pill role">
              {profile?.role ?? user?.role}
            </span>
            <span className="status-pill success">
              {profile?.status ?? user?.status}
            </span>
          </div>
        </aside>

        <div className="profile-main-column">
          <form className="profile-edit-panel" onSubmit={submit}>
            <header>
              <div>
                <p className="eyebrow">
                  {text("THÔNG TIN CÁ NHÂN", "PERSONAL DETAILS")}
                </p>
                <h2>{text("Chỉnh sửa hồ sơ", "Edit profile")}</h2>
              </div>
              {isLoading ? (
                <LoaderCircle className="spin" size={20} />
              ) : (
                <UserRound size={20} />
              )}
            </header>

            <div className="profile-form-grid">
              <label>
                {text("Họ và tên", "Full name")}
                <div className="profile-input">
                  <UserRound size={17} />
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    minLength={1}
                    maxLength={100}
                    required
                    disabled={isLoading || isSaving}
                  />
                </div>
              </label>
              <label>
                {text("Địa chỉ email", "Email address")}
                <div className="profile-input profile-input--locked">
                  <Mail size={17} />
                  <input value={profile?.email ?? user?.email ?? ""} readOnly />
                </div>
                <small>
                  {text(
                    "Email được quản lý bởi nhà cung cấp xác thực.",
                    "Email is managed by your authentication provider.",
                  )}
                </small>
              </label>
            </div>

            {error ? <p className="form-error">{error}</p> : null}
            {success ? (
              <p className="form-success">
                <Check size={16} />
                {success}
              </p>
            ) : null}

            <footer>
              <span>
                {hasChanges
                  ? text(
                      "Bạn có thay đổi chưa lưu.",
                      "You have unsaved changes.",
                    )
                  : text(
                      "Thông tin hồ sơ đã được cập nhật.",
                      "Profile information is up to date.",
                    )}
              </span>
              <button
                type="submit"
                className="primary-button"
                disabled={
                  isLoading || isSaving || !hasChanges || !fullName.trim()
                }
              >
                {isSaving ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Save size={17} />
                )}
                {isSaving
                  ? text("Đang lưu...", "Saving...")
                  : text("Lưu thay đổi", "Save changes")}
              </button>
            </footer>
          </form>
        </div>
      </section>
    </main>
  );
}
