'use client';

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

interface AuditLogItem { id: string; userId: string | null; action: string; targetType: string; targetId: string | null; createdAt: string; }
interface AuditLogMeta { page: number; totalPages: number; hasNext: boolean; hasPrevious: boolean; }
interface MostDownloadedDoc { documentId: string; title: string; fileType: string; downloadCount: number; }
interface MostSavedDoc { documentId: string; title: string; fileType: string; saveCount: number; }

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`${res.status}`);
  const body = await res.json() as { data: T };
  return body.data;
}

export function AdminReportsView() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [meta, setMeta] = useState<AuditLogMeta | null>(null);
  const [page, setPage] = useState(1);
  const [downloaded, setDownloaded] = useState<MostDownloadedDoc[]>([]);
  const [saved, setSaved] = useState<MostSavedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchJson<{ items: AuditLogItem[]; meta: AuditLogMeta }>(`/admin/logs/audit?page=${page}&limit=20`),
      fetchJson<{ data: MostDownloadedDoc[] }>('/admin/reports/most-downloaded?limit=10'),
      fetchJson<{ data: MostSavedDoc[] }>('/admin/reports/most-saved?limit=10'),
    ])
      .then(([logsRes, dlRes, savedRes]) => {
        setLogs(logsRes.items);
        setMeta(logsRes.meta);
        setDownloaded((dlRes as unknown as { data: MostDownloadedDoc[] }).data ?? []);
        setSaved((savedRes as unknown as { data: MostSavedDoc[] }).data ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu'))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <main>
      <h1>Báo cáo & Audit Log</h1>
      {error ? <p style={{ color: 'red' }}>{error}</p> : null}
      {loading ? <p>Đang tải…</p> : null}

      <section>
        <h2>Audit Log</h2>
        {!loading && logs.length === 0 ? <p>Không có dữ liệu.</p> : null}
        {!loading && logs.length > 0 ? (
          <table>
            <thead><tr><th>Action</th><th>Target</th><th>User</th><th>Thời gian</th></tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td>{l.action}</td>
                  <td>{l.targetType} {l.targetId ?? ''}</td>
                  <td>{l.userId ?? '—'}</td>
                  <td>{new Date(l.createdAt).toLocaleString('vi-VN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {meta && meta.totalPages > 1 ? (
          <div>
            <button type="button" disabled={!meta.hasPrevious} onClick={() => setPage(p => p - 1)}>‹</button>
            <span> Trang {meta.page} / {meta.totalPages} </span>
            <button type="button" disabled={!meta.hasNext} onClick={() => setPage(p => p + 1)}>›</button>
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Tải nhiều nhất</h2>
        {!loading && downloaded.length > 0 ? (
          <table>
            <thead><tr><th>Tên tài liệu</th><th>Loại</th><th>Lượt tải</th></tr></thead>
            <tbody>{downloaded.map(d => <tr key={d.documentId}><td>{d.title}</td><td>{d.fileType}</td><td>{d.downloadCount}</td></tr>)}</tbody>
          </table>
        ) : null}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Lưu nhiều nhất</h2>
        {!loading && saved.length > 0 ? (
          <table>
            <thead><tr><th>Tên tài liệu</th><th>Loại</th><th>Lượt lưu</th></tr></thead>
            <tbody>{saved.map(d => <tr key={d.documentId}><td>{d.title}</td><td>{d.fileType}</td><td>{d.saveCount}</td></tr>)}</tbody>
          </table>
        ) : null}
      </section>
    </main>
  );
}
