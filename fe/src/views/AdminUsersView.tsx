'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  getAdminUsers,
  updateAdminUserStatus,
  type AdminMutableUserStatus,
  type AdminUserItem,
  type AdminUsersQuery,
  type AdminUsersResponse,
  type UserRole,
  type UserStatus,
} from '../api/admin-users.api';

const ROLES: UserRole[] = ['ADMIN', 'USER'];
const STATUSES: UserStatus[] = ['ACTIVE', 'BLOCKED', 'INACTIVE'];
const MUTABLE_STATUSES: AdminMutableUserStatus[] = ['ACTIVE', 'BLOCKED'];
const DEFAULT_QUERY: AdminUsersQuery = { page: 1, limit: 20 };

export function AdminUsersView() {
  const [keyword, setKeyword] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const buildQuery = useCallback(
    (p: number): AdminUsersQuery => ({
      ...DEFAULT_QUERY,
      page: p,
      ...(keyword ? { keyword } : {}),
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
    }),
    [keyword, role, status],
  );

  const loadUsers = useCallback(async (query: AdminUsersQuery) => {
    setError('');
    setIsLoading(true);
    try {
      const res = await getAdminUsers(query);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách người dùng.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers(buildQuery(page));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadUsers, page, role, status]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    await loadUsers(buildQuery(1));
  }

  async function handleStatusChange(user: AdminUserItem, next: AdminMutableUserStatus) {
    setError('');
    setUpdatingId(user.id);
    try {
      await updateAdminUserStatus(user.id, next);
      await loadUsers(buildQuery(page));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cập nhật trạng thái thất bại.');
    } finally {
      setUpdatingId(null);
    }
  }

  const users = data?.items ?? [];
  const meta = data?.meta;

  return (
    <main>
      <div>
        <h1>Quản lý người dùng</h1>
        <p>Xem, lọc và thay đổi trạng thái tài khoản người dùng.</p>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          name="keyword"
          aria-label="Tìm kiếm theo tên hoặc email"
          placeholder="Tìm kiếm theo tên hoặc email…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <select
          name="roleFilter"
          aria-label="Lọc theo vai trò"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole | '')}
        >
          <option value="">Tất cả vai trò</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          name="statusFilter"
          aria-label="Lọc theo trạng thái"
          value={status}
          onChange={(e) => setStatus(e.target.value as UserStatus | '')}
        >
          <option value="">Tất cả trạng thái</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Đang tải…' : 'Tìm kiếm'}
        </button>
      </form>

      {error ? <p role="alert" style={{ color: 'red' }}>{error}</p> : null}

      {isLoading ? (
        <p>Đang tải danh sách người dùng…</p>
      ) : users.length === 0 ? (
        <p>Không tìm thấy người dùng nào.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Người dùng</th>
              <th>Vai trò</th>
              <th>Trạng thái</th>
              <th>Đăng nhập lần cuối</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.fullName}</strong>
                  <br />
                  <span>{u.email}</span>
                </td>
                <td>{u.role}</td>
                <td>
                  {u.status === 'INACTIVE' || u.role === 'ADMIN' ? (
                    <span>{u.status}</span>
                  ) : (
                    <select
                      value={u.status}
                      disabled={isLoading || updatingId === u.id}
                      onChange={(e) =>
                        void handleStatusChange(u, e.target.value as AdminMutableUserStatus)
                      }
                    >
                      {MUTABLE_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </td>
                <td>{u.lastLogin ?? 'Chưa có dữ liệu'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {meta && meta.totalPages > 1 ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            disabled={!meta.hasPrevious}
            onClick={() => setPage(meta.page - 1)}
          >
            ‹ Trước
          </button>
          <span>
            Trang {meta.page} / {meta.totalPages} ({meta.totalItems} người dùng)
          </span>
          <button
            type="button"
            disabled={!meta.hasNext}
            onClick={() => setPage(meta.page + 1)}
          >
            Sau ›
          </button>
        </div>
      ) : null}
    </main>
  );
}
