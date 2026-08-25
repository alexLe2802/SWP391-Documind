"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Bot,
  Download,
  FileText,
  FolderKanban,
  Globe,
  Lock,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import {
  getDashboardStatistics,
  getDashboardSummary,
  getUploadStatistics,
} from "../api/admin.api";
import type {
  AdminDashboardSummary,
  CategoryStat,
  SubjectStat,
  UploadStatItem,
} from "../api/admin.mock";
import { useLanguage } from "../i18n/LanguageProvider";
import { localize } from "../i18n/localize";

// Hiển thị giao diện admin dashboard view.
export function AdminDashboardView() {
  const { locale, t } = useLanguage();
  // Thực hiện chức năng text.
  const text = (vi: string, en: string) => localize(locale, vi, en);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [uploadStats, setUploadStats] = useState<UploadStatItem[]>([]);

  const loadData = useCallback(
    async (retryCount = 0) => {
      setIsLoading(true);
      setError("");
      try {
        const [sumRes, statsRes, uploadRes] = await Promise.all([
          getDashboardSummary(),
          getDashboardStatistics(),
          getUploadStatistics(),
        ]);
        setSummary(sumRes);
        setSubjectStats(statsRes.bySubject);
        setCategoryStats(statsRes.byCategory);
        setUploadStats(uploadRes);
      } catch (err) {
        if (retryCount < 2) {
          const delay = (retryCount + 1) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return loadData(retryCount + 1);
        }
        setError(err instanceof Error ? err.message : t("common.error"));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Helper to render sparkline SVG path
  const renderSparklinePath = (data: UploadStatItem[]) => {
    if (data.length === 0)
      return { pathData: "", areaPathData: "", points: [] };
    const width = 500;
    const height = 100;
    const padding = 10;
    const maxVal = Math.max(...data.map((d) => d.count), 1);

    const points = data.map((d, index) => {
      const x = padding + (index / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - (d.count / maxVal) * (height - padding * 2);
      return { x, y };
    });

    const pathData = points
      .map((p, index) => `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");

    const areaPathData = `${pathData} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return { pathData, areaPathData, points };
  };

  const { pathData, areaPathData, points } = renderSparklinePath(uploadStats);

  return (
    <main className="page" id="main-content">
      <div className="page-header page-header--editorial">
        <div>
          <p className="eyebrow">
            {text("BẢNG ĐIỀU KHIỂN QUẢN TRỊ", "ADMIN CONSOLE")}
          </p>
          <h1>{text("Tổng quan hệ thống", "System Overview")}</h1>
          <p>
            {text(
              "Theo dõi hiệu suất hệ thống, số lượng tài liệu hoạt động, thống kê tệp tải lên và hoạt động người dùng.",
              "Monitor system performance, active document counts, upload statistics, and user activities.",
            )}
          </p>
        </div>
        <span className="page-number">01 / ADMIN</span>
      </div>

      {error && !isLoading ? (
        <div className="content-panel">
          <p className="form-error">{error}</p>
          <button
            className="btn btn--outline"
            style={{ marginTop: "0.5rem" }}
            onClick={() => void loadData()}
          >
            {text("Thử lại", "Retry")}
          </button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="loading-state">
          <span className="loading-line" />
          <p>
            {text(
              "Đang tải dữ liệu tổng quan...",
              "Loading dashboard statistics...",
            )}
          </p>
        </div>
      ) : null}

      {!isLoading && !error && summary ? (
        <>
          {/* Summary statistic cards */}
          <section className="admin-stats">
            <article className="stat-card">
              <UsersRound size={20} />
              <span>{text("Tổng người dùng", "Total Users")}</span>
              <strong>{summary.totalUsers}</strong>
            </article>
            <article className="stat-card">
              <FileText size={20} />
              <span>{text("Tổng số tài liệu", "Total Documents")}</span>
              <strong>{summary.totalDocuments}</strong>
            </article>
            <article className="stat-card">
              <Globe size={20} />
              <span>{text("Tài liệu công khai", "Public Documents")}</span>
              <strong>{summary.publicDocuments}</strong>
            </article>
            <article className="stat-card">
              <Lock size={20} />
              <span>{text("Tài liệu riêng tư", "Private Documents")}</span>
              <strong>{summary.privateDocuments}</strong>
            </article>
            <article className="stat-card">
              <Bot size={20} />
              <span>{text("Tổng lượt hội thoại", "Total Chats")}</span>
              <strong>{summary.totalChats}</strong>
            </article>
            <article className="stat-card">
              <Download size={20} />
              <span>{text("Tổng lượt tải xuống", "Total Downloads")}</span>
              <strong>{summary.totalDownloads}</strong>
            </article>
          </section>

          {/* SVG Sparkline and Bar charts */}
          <div className="chart-grid">
            {/* Upload Statistics Area Chart */}
            <article className="chart-card">
              <h3>
                <TrendingUp
                  size={16}
                  style={{ marginRight: "8px", verticalAlign: "middle" }}
                />
                {text(
                  "Thống kê tài liệu tải lên (7 ngày qua)",
                  "Document Uploads (Last 7 Days)",
                )}
              </h3>
              {uploadStats.length > 0 ? (
                <div>
                  <svg viewBox="0 0 500 110" className="sparkline-svg">
                    <defs>
                      <linearGradient
                        id="amber-gradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="var(--amber)"
                          stopOpacity="0.3"
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--amber)"
                          stopOpacity="0"
                        />
                      </linearGradient>
                    </defs>
                    {/* Grid lines */}
                    <line
                      x1="10"
                      y1="10"
                      x2="490"
                      y2="10"
                      stroke="#f1f5f9"
                      strokeWidth="1"
                    />
                    <line
                      x1="10"
                      y1="50"
                      x2="490"
                      y2="50"
                      stroke="#f1f5f9"
                      strokeWidth="1"
                    />
                    <line
                      x1="10"
                      y1="90"
                      x2="490"
                      y2="90"
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />

                    {/* Area under curve */}
                    <path d={areaPathData} className="sparkline-area" />

                    {/* Path line */}
                    <path d={pathData} className="sparkline-line" />

                    {/* Data dots */}
                    {points.map((p, i) => (
                      <g key={i}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="4"
                          className="sparkline-point"
                        />
                        <title>{`${uploadStats[i].date}: ${uploadStats[i].count} docs`}</title>
                      </g>
                    ))}
                  </svg>
                  <div className="chart-x-labels">
                    {uploadStats.map((item) => (
                      <span key={item.date}>
                        {new Date(item.date).toLocaleDateString(
                          locale === "vi" ? "vi-VN" : "en-US",
                          { day: "numeric", month: "short" },
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p
                  style={{
                    textAlign: "center",
                    color: "var(--muted)",
                    fontSize: "0.85rem",
                  }}
                >
                  {text(
                    "Không có dữ liệu upload nào.",
                    "No upload statistics available.",
                  )}
                </p>
              )}
            </article>

            {/* Documents by Subject */}
            <article className="chart-card">
              <h3>
                <BookOpen
                  size={16}
                  style={{ marginRight: "8px", verticalAlign: "middle" }}
                />
                {text("Tài liệu theo Môn học", "Documents by Subject")}
              </h3>
              <div className="chart-bar-list">
                {subjectStats.length > 0 ? (
                  subjectStats.map((item) => {
                    const maxCount = Math.max(
                      ...subjectStats.map((s) => s.count),
                      1,
                    );
                    const percentage = (item.count / maxCount) * 100;
                    return (
                      <div className="chart-bar-row" key={item.id}>
                        <span className="chart-bar-label" title={item.subject}>
                          {item.subject}
                        </span>
                        <div className="chart-bar-wrapper">
                          <div
                            className="chart-bar-value"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="chart-bar-count">{item.count}</span>
                      </div>
                    );
                  })
                ) : (
                  <p
                    style={{
                      textAlign: "center",
                      color: "var(--muted)",
                      fontSize: "0.85rem",
                    }}
                  >
                    {text(
                      "Không có dữ liệu môn học.",
                      "No subject statistics available.",
                    )}
                  </p>
                )}
              </div>
            </article>

            {/* Documents by Category */}
            <article className="chart-card">
              <h3>
                <FolderKanban
                  size={16}
                  style={{ marginRight: "8px", verticalAlign: "middle" }}
                />
                {text("Tài liệu theo Phân loại", "Documents by Category")}
              </h3>
              <div className="chart-bar-list">
                {categoryStats.length > 0 ? (
                  categoryStats.map((item) => {
                    const maxCount = Math.max(
                      ...categoryStats.map((c) => c.count),
                      1,
                    );
                    const percentage = (item.count / maxCount) * 100;
                    return (
                      <div className="chart-bar-row" key={item.id}>
                        <span className="chart-bar-label" title={item.category}>
                          {item.category}
                        </span>
                        <div className="chart-bar-wrapper">
                          <div
                            className="chart-bar-value"
                            style={{
                              width: `${percentage}%`,
                              background: "#f59e0b",
                            }}
                          />
                        </div>
                        <span className="chart-bar-count">{item.count}</span>
                      </div>
                    );
                  })
                ) : (
                  <p
                    style={{
                      textAlign: "center",
                      color: "var(--muted)",
                      fontSize: "0.85rem",
                    }}
                  >
                    {text(
                      "Không có dữ liệu phân loại.",
                      "No category statistics available.",
                    )}
                  </p>
                )}
              </div>
            </article>
          </div>
        </>
      ) : null}
    </main>
  );
}
