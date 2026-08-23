"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
  UserCheck,
  UsersRound,
  UserX,
} from "lucide-react";
import { getUsers, updateUserStatus, type UserQuery } from "../api/users.api";
import type {
  AdminMutableUserStatus,
  CurrentUser,
  UserListResponse,
  UserRole,
  UserStatus,
} from "../types/auth";
import { useAuth } from "../features/auth/useAuth";
import { useLanguage } from "../i18n/LanguageProvider";

const roles: UserRole[] = ["ADMIN", "USER"];
const statuses: UserStatus[] = ["ACTIVE", "BLOCKED", "INACTIVE"];
const mutableStatuses: AdminMutableUserStatus[] = ["ACTIVE", "BLOCKED"];
const DEFAULT_QUERY: UserQuery = { page: 1, limit: 10 };

// Hiển thị giao diện admin người dùng view.
export function AdminUsersView() {
  const { user: currentUser } = useAuth();
  const { locale, t } = useLanguage();
  const [keyword, setKeyword] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UserListResponse | null>(null);
  const [totalAdminUsers, setTotalAdminUsers] = useState(0);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const users = data?.items ?? [];
  const activeUsers = users.filter((item) => item.status === "ACTIVE").length;
  const blockedUsers = users.filter((item) => item.status === "BLOCKED").length;

  const loadUsers = useCallback(
    async (query: UserQuery = DEFAULT_QUERY) => {
      setError("");
      setIsLoading(true);

      try {
        const response = await getUsers(query);
        setData(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("admin.loadFailed"));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  const getQuery = useCallback(
    (pNum: number): UserQuery => {
      const q: UserQuery = { ...DEFAULT_QUERY, page: pNum };
      if (keyword) q.keyword = keyword;
      if (role) q.role = role;
      if (status) q.status = status;
      return q;
    },
    [keyword, role, status],
  );

  useEffect(() => {
    void getUsers({ page: 1, limit: 1, role: "ADMIN" })
      .then((response) => setTotalAdminUsers(response.meta.totalItems))
      .catch((err) =>
        setError(err instanceof Error ? err.message : t("admin.loadFailed")),
      );
  }, [t]);

  useEffect(() => {
    void loadUsers(getQuery(page));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadUsers, page, role, status]);

  // Xử lý sự kiện search.
  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    await loadUsers(getQuery(1));
  }

  // Xử lý sự kiện trạng thái change.
  async function handleStatusChange(
    targetUser: CurrentUser,
    nextStatus: AdminMutableUserStatus,
  ) {
    setError("");

    if (targetUser.id === currentUser?.id && nextStatus === "BLOCKED") {
      setError(t("admin.selfBlock"));
      return;
    }

    if (targetUser.role === "ADMIN" && nextStatus === "BLOCKED") {
      setError(t("admin.adminBlock"));
      return;
    }

    setUpdatingUserId(targetUser.id);

    try {
      await updateUserStatus(targetUser.id, nextStatus);
      await loadUsers(getQuery(page));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.statusFailed"));
    } finally {
      setUpdatingUserId(null);
    }
  }

  return (
    <main className="page" id="main-content">
      <div className="page-header page-header--editorial">
        <div>
          <p className="eyebrow">{t("admin.eyebrow")}</p>
          <h1>{t("admin.usersTitle")}</h1>
          <p>{t("admin.usersBody")}</p>
        </div>
        <span className="page-number">02 / ADMIN</span>
      </div>

      <section className="admin-stats">
        <article className="stat-card">
          <UsersRound size={20} />
          <span>{t("admin.totalUsers")}</span>
          <strong>{data?.meta?.totalItems ?? users.length}</strong>
        </article>
        <article className="stat-card">
          <UserCheck size={20} />
          <span>{t("admin.active")}</span>
          <strong>{activeUsers}</strong>
        </article>
        <article className="stat-card">
          <ShieldCheck size={20} />
          <span>{t("admin.admins")}</span>
          <strong>{totalAdminUsers}</strong>
        </article>
        <article className="stat-card">
          <UserX size={20} />
          <span>{t("admin.blocked")}</span>
          <strong>{blockedUsers}</strong>
        </article>
      </section>

      <form className="toolbar" onSubmit={handleSearch}>
        <label className="search-box">
          <Search size={18} />
          <input
            name="userSearch"
            aria-label={t("admin.searchPlaceholder")}
            autoComplete="off"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={`${t("admin.searchPlaceholder")}…`}
          />
        </label>
        <select
          name="roleFilter"
          aria-label={t("admin.allRoles")}
          value={role}
          onChange={(event) => setRole(event.target.value as UserRole | "")}
        >
          <option value="">{t("admin.allRoles")}</option>
          {roles.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          name="statusFilter"
          aria-label={t("admin.allStatuses")}
          value={status}
          onChange={(event) => setStatus(event.target.value as UserStatus | "")}
        >
          <option value="">{t("admin.allStatuses")}</option>
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button className="secondary-button" type="submit" disabled={isLoading}>
          {isLoading ? t("common.searching") : t("common.search")}
        </button>
      </form>

      <section className="content-panel">
        {error ? <p className="form-error">{error}</p> : null}
        {isLoading ? (
          <div className="loading-state">
            <span className="loading-line" />
            <p>{t("admin.loadingUsers")}</p>
          </div>
        ) : null}
        {!isLoading && users.length === 0 ? (
          <div className="empty-state">
            <UsersRound size={28} />
            <p>{t("admin.noUsers")}</p>
          </div>
        ) : null}
        {!isLoading && users.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("admin.user")}</th>
                    <th>{t("admin.role")}</th>
                    <th>{t("admin.status")}</th>
                    <th>{t("admin.lastLogin")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.fullName}</strong>
                        <span>{item.email}</span>
                      </td>
                      <td>
                        <span className="status-pill role">{item.role}</span>
                      </td>
                      <td>
                        {item.status === "INACTIVE" ? (
                          <span className="status-pill">INACTIVE</span>
                        ) : item.role === "ADMIN" ||
                          item.id === currentUser?.id ? (
                          <span
                            className={`status-pill ${item.status === "ACTIVE" ? "success" : item.status === "BLOCKED" ? "danger" : ""}`}
                          >
                            {item.status}
                          </span>
                        ) : (
                          <select
                            value={item.status}
                            disabled={isLoading || updatingUserId === item.id}
                            onChange={(event) =>
                              void handleStatusChange(
                                item,
                                event.target.value as AdminMutableUserStatus,
                              )
                            }
                          >
                            {mutableStatuses.map((statusItem) => (
                              <option key={statusItem} value={statusItem}>
                                {statusItem}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${item.status === "ACTIVE" ? "success" : item.status === "BLOCKED" ? "danger" : ""}`}
                        >
                          {item.lastLogin ?? t("profile.noData")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data?.meta && data.meta.totalPages > 1 ? (
              <div className="pagination-wrap">
                <span className="pagination-info">
                  {locale === "vi" ? "Trang" : "Page"} {data.meta.page}{" "}
                  {locale === "vi" ? "trên" : "of"} {data.meta.totalPages} (
                  {data.meta.totalItems}{" "}
                  {locale === "vi" ? "người dùng" : "users"})
                </span>
                <div className="pagination-buttons">
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={!data.meta.hasPrevious}
                    onClick={() => setPage(data.meta.page - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from(
                    { length: data.meta.totalPages },
                    (_, i) => i + 1,
                  ).map((pNum) => (
                    <button
                      key={pNum}
                      type="button"
                      aria-label={`Page ${pNum}`}
                      aria-current={
                        data.meta.page === pNum ? "page" : undefined
                      }
                      className={`pagination-btn ${data.meta.page === pNum ? "active" : ""}`}
                      onClick={() => setPage(pNum)}
                    >
                      {pNum}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={!data.meta.hasNext}
                    onClick={() => setPage(data.meta.page + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
