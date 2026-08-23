'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface AuditLogItem {
  id: string;
  userId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  items: AuditLogItem[];
  meta: { page: number; totalItems: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
}

interface MostDownloadedDoc {
  documentId: string;
  title: string;
  fileName: string;
  fileType: string;
  downloadCount: number;
}

interface MostSavedDoc {
  documentId: string;
  title: string;
  fileName: string;
  fileType: string;
  saveCount: number;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const body = await res.json() as { data: T };
  return body.data;
}

export function AdminReportsView() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [logMeta, setLogMeta] = useState<AuditLogResponse['meta'] | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [downloaded, setDownloaded] = useState<MostDownloadedDoc[]>([]);
  const [saved, setSaved] = useState<MostSavedDoc[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams({ page: String(logPage), limit: '20' });
    if (actionFilter) params.set('action', actionFilter);

    Promise.all([
      fetchJson<AuditLogResponse>(`/admin/logs/audit?${params.toString()}`),
      fetchJson<{ data: MostDownloadedDoc[] }>('/admin/reports/most-downloaded?limit=10'),
      fetchJson<{ data: MostSavedDoc[] }>('/admin/reports/most-saved?limit=10'),
    ])
      .then(([logsRes, dlRes, savedRes]) => {
        setLogs(logsRes.items);
        setLogMeta(logsRes.meta);
        setDownloaded((dlRes as unknown as { data: MostDownloadedDoc[] }).data ?? []);
        setSaved((savedRes as unknown as { data: MostSavedDoc[] }).data ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Tải dữ liệu thất bại.'))
      .finally(() => setIsLoading(false));
  }, [logPage, actionFilter]);

  return (
    <main>
      <h1>Báo cáo và Audit Log</h1>

      {error ? <p role="alert" style={{ color: 'red' }}>{error}</p> : null}
      {isLoading ? <p>Đang tải…</p> : null}

      {/* Audit Log */}
      <section>
        <h2>Audit Log</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            aria-label="Lọc theo action"
            placeholder="Lọc theo action…"
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setLogPage(1); }}
          />
        </div>
        {!isLoading && logs.length === 0 ? <p>Không có log nào.</p> : null}
        {!isLoading && logs.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Target Type</th>
                <th>Target ID</th>
                <th>User ID</th>
                <th>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.action}</td>
                  <td>{log.targetType}</td>
                  <td>{log.targetId ?? '—'}</td>
                  <td>{log.userId ?? '—'}</td>
                  <td>{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {logMeta && logMeta.totalPages > 1 ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" disabled={!logMeta.hasPrevious} onClick={() => setLogPage((p) => p - 1)}>‹</button>
            <span>Trang {logMeta.page} / {logMeta.totalPages}</span>
            <button type="button" disabled={!logMeta.hasNext} onClick={() => setLogPage((p) => p + 1)}>›</button>
          </div>
        ) : null}
      </section>

      {/* Most Downloaded */}
      <section style={{ marginTop: 32 }}>
        <h2>Tài liệu được tải nhiều nhất</h2>
        {!isLoading && downloaded.length === 0 ? <p>Không có dữ liệu.</p> : null}
        {!isLoading && downloaded.length > 0 ? (
          <table>
            <thead>
              <tr><th>Tên tài liệu</th><th>Loại</th><th>Lượt tải</th></tr>
            </thead>
            <tbody>
              {downloaded.map((doc) => (
                <tr key={doc.documentId}>
                  <td>{doc.title}</td>
                  <td>{doc.fileType}</td>
                  <td>{doc.downloadCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      {/* Most Saved */}
      <section style={{ marginTop: 32 }}>
        <h2>Tài liệu được lưu nhiều nhất</h2>
        {!isLoading && saved.length === 0 ? <p>Không có dữ liệu.</p> : null}
        {!isLoading && saved.length > 0 ? (
          <table>
            <thead>
              <tr><th>Tên tài liệu</th><th>Loại</th><th>Lượt lưu</th></tr>
            </thead>
            <tbody>
              {saved.map((doc) => (
                <tr key={doc.documentId}>
                  <td>{doc.title}</td>
                  <td>{doc.fileType}</td>
                  <td>{doc.saveCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </main>
  );
}
