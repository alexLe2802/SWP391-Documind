"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Bell,
  Bookmark,
  CreditCard,
  FileUp,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Brand } from "../components/ui/Brand";
import { LanguageSwitcher } from "../components/ui/LanguageSwitcher";
import { useAuth } from "../features/auth/useAuth";
import { useLanguage } from "../i18n/LanguageProvider";
import { localize } from "../i18n/localize";
import { ROUTES } from "../lib/routes";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type UserNotification,
} from "../api/notifications.api";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  accent?: boolean;
};

// Kiểm tra điều kiện active path.
function isActivePath(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== ROUTES.dashboard && pathname.startsWith(`${href}/`))
  );
}

// Hiển thị giao diện app layout.
export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { locale, t } = useLanguage();
  // Thực hiện chức năng text.
  const text = (vi: string, en: string) => localize(locale, vi, en);
  const pathname = usePathname() ?? ROUTES.dashboard;
  const router = useRouter();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const initial = user?.fullName?.charAt(0).toUpperCase() ?? "D";

  const workspaceNav: NavItem[] = [
    {
      href: ROUTES.dashboard,
      label: t("nav.dashboard"),
      icon: LayoutDashboard,
    },
    { href: ROUTES.library, label: t("nav.library"), icon: LibraryBig },
    { href: ROUTES.upload, label: t("nav.upload"), icon: FileUp },
    { href: ROUTES.community, label: t("nav.community"), icon: UsersRound },
    { href: ROUTES.saved, label: t("nav.saved"), icon: Bookmark },
  ];

  const aiNav: NavItem[] = [
    {
      href: ROUTES.aiChat,
      label: text("AI Chatbot", "AI Chatbot"),
      icon: Bot,
      accent: true,
    },
  ];

  const accountNav: NavItem[] = [
    {
      href: ROUTES.subscription,
      label: t("nav.subscription"),
      icon: CreditCard,
    },
    { href: ROUTES.profile, label: t("common.profile"), icon: UserRound },
  ];

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    // Lấy dữ liệu load.
    const load = () => {
      void getNotifications()
        .then((result) => {
          if (!active) return;
          setNotifications(result.items);
          setUnreadCount(result.unreadCount);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user, pathname]);

  useEffect(() => {
    // Xóa hoặc giải phóng on outside click.
    function closeOnOutsideClick(event: MouseEvent) {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  // Lấy dữ liệu thông báo.
  async function readNotification(notification: UserNotification) {
    if (!notification.isRead) {
      await markNotificationRead(notification.id);
      setNotifications((items) =>
        items.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    }
  }

  // Lấy dữ liệu danh sách thông báo.
  async function readAllNotifications() {
    await markAllNotificationsRead();
    setNotifications((items) =>
      items.map((item) => ({ ...item, isRead: true })),
    );
    setUnreadCount(0);
  }

  // Xử lý sự kiện đăng xuất.
  async function handleLogout() {
    await logout();
    router.replace(ROUTES.login);
  }

  // Hiển thị hoặc mở link.
  function renderLink(item: NavItem) {
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`${isActivePath(pathname, item.href) ? "active" : ""}${item.accent ? " ai-nav-link" : ""}`}
        title={isSidebarCompact ? item.label : undefined}
      >
        <Icon size={18} />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <div
      className={`app-shell${isSidebarCompact ? " app-shell--compact" : ""}`}
    >
      {isMobileNavOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label={text("Đóng điều hướng", "Close navigation")}
          onClick={() => setIsMobileNavOpen(false)}
        />
      ) : null}

      <aside className={`sidebar${isMobileNavOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar-brand-row">
          <Brand compact={isSidebarCompact} />
          <button
            type="button"
            className="sidebar-collapse"
            onClick={() => setIsSidebarCompact((current) => !current)}
            aria-label={
              isSidebarCompact ? "Expand sidebar" : "Collapse sidebar"
            }
            title={isSidebarCompact ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCompact ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
          <button
            type="button"
            className="sidebar-close-mobile"
            aria-label={text("Đóng điều hướng", "Close navigation")}
            onClick={() => setIsMobileNavOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <nav
          className="side-nav"
          aria-label={text(
            "Điều hướng không gian học tập",
            "Workspace navigation",
          )}
        >
          <span className="side-nav-label">
            {text("Không gian học tập", "Workspace")}
          </span>
          {workspaceNav.map(renderLink)}
        </nav>

        <nav
          className="side-nav side-nav--ai"
          aria-label={text("Điều hướng AI", "AI navigation")}
        >
          <span className="side-nav-label">
            <Sparkles size={13} />
            {text("Hỏi AI", "Ask AI")}
          </span>
          {aiNav.map(renderLink)}
        </nav>

        <nav
          className="side-nav side-nav--utility"
          aria-label={text("Điều hướng tài khoản", "Account navigation")}
        >
          <span className="side-nav-label">{text("Tài khoản", "Account")}</span>
          {accountNav.map(renderLink)}
        </nav>

        {user?.role === "ADMIN" ? (
          <nav
            className="side-nav side-nav--admin"
            aria-label={text("Điều hướng quản trị", "Admin navigation")}
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: "1rem",
              marginTop: "1rem",
            }}
          >
            <span className="side-nav-label">{text("Quản trị", "Admin")}</span>
            {renderLink({
              href: ROUTES.adminDashboard,
              label: text("Tổng quan", "Dashboard"),
              icon: LayoutDashboard,
            })}
            {renderLink({
              href: ROUTES.adminUsers,
              label: text("Người dùng", "Users"),
              icon: UsersRound,
            })}
            {renderLink({
              href: ROUTES.adminDocuments,
              label: text("Tài liệu", "Documents"),
              icon: LibraryBig,
            })}
          </nav>
        ) : null}
      </aside>

      <div className="main-column">
        <header className="app-topbar">
          <button
            type="button"
            className="mobile-menu-button"
            aria-label={text("Mở điều hướng", "Open navigation")}
            aria-expanded={isMobileNavOpen}
            onClick={() => setIsMobileNavOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="app-topbar-user">
            {user?.avatarUrl ? (
              <span
                className="mini-avatar mini-avatar--image"
                style={{ backgroundImage: `url(${user.avatarUrl})` }}
              />
            ) : (
              <span className="mini-avatar">{initial}</span>
            )}
            <div>
              <strong>{user?.fullName}</strong>
              <span>{user?.email}</span>
            </div>
            <div className="notification-center" ref={notificationsRef}>
              <button
                type="button"
                className="notification-bell"
                aria-label={text("Thông báo", "Notifications")}
                aria-expanded={isNotificationsOpen}
                onClick={() => setIsNotificationsOpen((open) => !open)}
              >
                <Bell size={19} />
                {unreadCount > 0 ? (
                  <span className="notification-badge">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </button>
              {isNotificationsOpen ? (
                <section className="notification-popover">
                  <header>
                    <strong>{text("Thông báo", "Notifications")}</strong>
                    {unreadCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => void readAllNotifications()}
                      >
                        {text("Đánh dấu đã đọc", "Mark all read")}
                      </button>
                    ) : null}
                  </header>
                  <div className="notification-list">
                    {notifications.length ? (
                      notifications.map((notification) => (
                        <button
                          type="button"
                          key={notification.id}
                          className={`notification-item${notification.isRead ? "" : " unread"}`}
                          onClick={() => void readNotification(notification)}
                        >
                          <span
                            className={`notification-dot notification-dot--${notification.type.toLowerCase()}`}
                          />
                          <span>
                            <strong>{notification.title}</strong>
                            <small>{notification.message}</small>
                            <time>
                              {new Date(notification.createdAt).toLocaleString(
                                locale === "vi" ? "vi-VN" : "en-US",
                              )}
                            </time>
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="notification-empty">
                        {text(
                          "Chưa có thông báo nào.",
                          "No notifications yet.",
                        )}
                      </p>
                    )}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
          <div className="app-topbar-actions">
            <LanguageSwitcher />
            <button
              type="button"
              className="icon-text-button"
              onClick={() => void handleLogout()}
            >
              <LogOut size={17} />
              <span>{t("common.logout")}</span>
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
