"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  FileSearch,
  Files,
  FileUp,
  Library,
  Menu,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useAuth } from "../../features/auth/useAuth";
import { localize } from "../../i18n/localize";
import { ROUTES, getAuthenticatedHomeRoute } from "../../lib/routes";
import type { TranslationKey } from "../../i18n/translations";
import { Brand } from "../ui/Brand";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { Reveal } from "../ui/Reveal";

const navItems: Array<{ href: string; label: TranslationKey }> = [
  { href: "#workflow", label: "nav.workflow" },
  { href: "#features", label: "nav.features" },
  { href: "#security", label: "nav.security" },
  { href: "#faq", label: "nav.faq" },
];

const workflow = [
  {
    icon: FileUp,
    number: "01",
    title: "landing.step1Title",
    body: "landing.step1Body",
  },
  {
    icon: FileSearch,
    number: "02",
    title: "landing.step2Title",
    body: "landing.step2Body",
  },
  {
    icon: MessageSquareText,
    number: "03",
    title: "landing.step3Title",
    body: "landing.step3Body",
  },
] as const;

const features = [
  {
    icon: BookOpen,
    title: "landing.feature1Title",
    body: "landing.feature1Body",
    index: "01",
  },
  {
    icon: Files,
    title: "landing.feature2Title",
    body: "landing.feature2Body",
    index: "02",
  },
  {
    icon: Library,
    title: "landing.feature3Title",
    body: "landing.feature3Body",
    index: "03",
  },
  {
    icon: Search,
    title: "landing.feature4Title",
    body: "landing.feature4Body",
    index: "04",
  },
  {
    icon: UsersRound,
    title: "landing.feature5Title",
    body: "landing.feature5Body",
    index: "05",
  },
] as const;

const faqs = [
  { question: "landing.faq1Q", answer: "landing.faq1A" },
  { question: "landing.faq2Q", answer: "landing.faq2A" },
  { question: "landing.faq3Q", answer: "landing.faq3A" },
  { question: "landing.faq4Q", answer: "landing.faq4A" },
  { question: "landing.faq5Q", answer: "landing.faq5A" },
] as const;

// Hiển thị giao diện landing page.
export function LandingPage() {
  const { locale, t } = useLanguage();
  const { user, isLoading } = useAuth();
  // Thực hiện chức năng text.
  const text = (vi: string, en: string) => localize(locale, vi, en);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const appRoute = user
    ? getAuthenticatedHomeRoute(user.role)
    : ROUTES.dashboard;
  const isAuthenticated = !isLoading && user?.status === "ACTIVE";
  const appEntryRoute = isAuthenticated ? appRoute : ROUTES.login;

  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    // Xử lý sự kiện scroll.
    const handleScroll = () => {
      // 1. Calculate scroll progress
      const totalHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        setScrollProgress((window.scrollY / totalHeight) * 100);
      }

      // 2. Active tab detection
      const scrollPos = window.scrollY + 120; // offset for sticky header
      if (window.scrollY < 80) {
        setActiveSection("");
        return;
      }

      let currentActive = "";
      for (const item of navItems) {
        const section = document.querySelector(item.href);
        if (section) {
          const top = (section as HTMLElement).offsetTop;
          const height = (section as HTMLElement).offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            currentActive = item.href;
            break;
          }
        }
      }
      setActiveSection(currentActive);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll(); // initial call
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Xóa hoặc giải phóng menu.
  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-container header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Primary navigation">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={activeSection === item.href ? "active" : ""}
              >
                {t(item.label)}
              </a>
            ))}
          </nav>
          <div className="header-actions">
            <LanguageSwitcher />
            <Link
              href={appEntryRoute}
              className="button button--primary button--small"
            >
              {text("Vào ứng dụng", "Open app")}
            </Link>
          </div>
          <button
            type="button"
            className="mobile-menu-button"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        <div
          className="scroll-progress-bar"
          style={{ width: `${scrollProgress}%` }}
          aria-hidden="true"
        />
        <div className={`mobile-nav${menuOpen ? " is-open" : ""}`}>
          <nav aria-label="Mobile navigation">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                className={activeSection === item.href ? "active" : ""}
              >
                {t(item.label)}
              </a>
            ))}
          </nav>
          <div className="mobile-nav-actions">
            <LanguageSwitcher />
            <Link
              href={appEntryRoute}
              className="button button--primary"
              onClick={closeMenu}
            >
              {text("Vào ứng dụng", "Open app")}
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className="hero-section" aria-labelledby="hero-title">
          <div className="landing-container hero-grid">
            <Reveal className="hero-copy-reveal">
              <div className="hero-copy">
                <p className="eyebrow">{t("landing.eyebrow")}</p>
                <h1 id="hero-title">{t("landing.title")}</h1>
                <p className="hero-lede">{t("landing.subtitle")}</p>
                <div className="hero-ctas">
                  <Link
                    href={isAuthenticated ? appRoute : ROUTES.register}
                    className="button button--primary button--large"
                  >
                    {isAuthenticated
                      ? text("Vào ứng dụng", "Open app")
                      : t("landing.primaryCta")}
                    <ArrowRight size={18} />
                  </Link>
                  <a
                    href="#workflow"
                    className="button button--secondary button--large"
                  >
                    {t("landing.secondaryCta")}
                  </a>
                </div>
                <div className="hero-note">
                  <span className="hero-note-line" aria-hidden="true" />
                  <span>
                    PDF · DOCX · PPTX · XLSX · AUDIO · VIDEO · YOUTUBE · ETC
                  </span>
                </div>
              </div>
            </Reveal>

            <Reveal className="hero-preview-reveal" delay={120}>
              <div
                className="product-preview"
                aria-label={t("landing.proofLabel")}
              >
                <div className="preview-kicker">
                  <span>{t("landing.proofLabel")}</span>
                  <span className="preview-status">
                    <span />
                    AI READY
                  </span>
                </div>
                <div className="preview-filebar">
                  <div className="file-icon">
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <strong>Lecture Notes.pdf</strong>
                    <span>Research Methods · 24 pages</span>
                  </div>
                  <span className="preview-more" aria-hidden="true">
                    •••
                  </span>
                </div>
                <div className="preview-chat">
                  <div className="message message--user">
                    {t("landing.question")}
                  </div>
                  <div className="message message--ai">
                    <span className="ai-mark">
                      <Sparkles size={16} />
                    </span>
                    <div className="message-content">
                      <p>
                        {t("landing.answer")}{" "}
                        <span className="citation" tabIndex={0}>
                          [1]
                          <span className="citation-tooltip" role="tooltip">
                            <strong>{t("landing.source")}</strong>
                            <span>{t("landing.citationHint")}</span>
                          </span>
                        </span>{" "}
                        <span className="citation" tabIndex={0}>
                          [2]
                          <span className="citation-tooltip" role="tooltip">
                            <strong>{t("landing.source")}</strong>
                            <span>{t("landing.citationHint")}</span>
                          </span>
                        </span>
                      </p>
                      <div className="preview-sources-list">
                        <div className="preview-sources-title">
                          {t("landing.sources")}
                        </div>
                        <div className="preview-source-item">
                          <span className="source-number">[1]</span>{" "}
                          {t("landing.source1")}
                        </div>
                        <div className="preview-source-item">
                          <span className="source-number">[2]</span>{" "}
                          {t("landing.source2")}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="preview-input">
                  <span>Ask a follow-up question...</span>
                  <span className="preview-send" aria-hidden="true">
                    <ArrowRight size={17} />
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section
          className="workflow-section section-pad"
          id="workflow"
          aria-labelledby="workflow-title"
        >
          <div className="landing-container">
            <Reveal>
              <div className="section-heading">
                <p className="eyebrow">{t("landing.workflowEyebrow")}</p>
                <h2 id="workflow-title">{t("landing.workflowTitle")}</h2>
              </div>
            </Reveal>
            <div className="workflow-grid">
              {workflow.map((step, index) => {
                const Icon = step.icon;
                return (
                  <Reveal
                    key={step.number}
                    className="workflow-reveal"
                    delay={index * 100}
                  >
                    <article className="workflow-card">
                      <div className="workflow-card-top">
                        <Icon size={24} />
                        <span>{step.number}</span>
                      </div>
                      <h3>{t(step.title)}</h3>
                      <p>{t(step.body)}</p>
                    </article>
                  </Reveal>
                );
              })}
            </div>
            <Reveal delay={350}>
              <div className="workflow-note">
                <Sparkles size={15} />
                <span>{t("landing.workflowNote")}</span>
              </div>
            </Reveal>
          </div>
        </section>

        <section
          className="features-section section-pad"
          id="features"
          aria-labelledby="features-title"
        >
          <div className="landing-container">
            <Reveal>
              <div className="section-heading section-heading--split">
                <p className="eyebrow">{t("landing.featuresEyebrow")}</p>
                <h2 id="features-title">{t("landing.featuresTitle")}</h2>
              </div>
            </Reveal>
            <div className="feature-list-landing">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Reveal key={feature.index} delay={index * 80}>
                    <article className="feature-row">
                      <span className="feature-index">{feature.index}</span>
                      <div className="feature-icon">
                        <Icon size={24} />
                      </div>
                      <h3>{t(feature.title)}</h3>
                      <p>{t(feature.body)}</p>
                      <ArrowRight
                        className="feature-arrow"
                        size={20}
                        aria-hidden="true"
                      />
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section
          className="security-section section-pad"
          id="security"
          aria-labelledby="security-title"
        >
          <div className="landing-container security-grid">
            <Reveal>
              <div className="security-left">
                <p className="eyebrow eyebrow--amber">
                  {t("landing.securityEyebrow")}
                </p>
                <h2 id="security-title">{t("landing.securityTitle")}</h2>
                <div className="security-seal" aria-hidden="true">
                  <ShieldCheck size={36} />
                  <span>
                    SOURCE
                    <br />
                    GROUNDED
                  </span>
                </div>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="security-copy">
                <p>{t("landing.securityBody")}</p>
                <ul>
                  {(
                    [
                      "landing.security1",
                      "landing.security2",
                      "landing.security3",
                      "landing.security4",
                    ] as const
                  ).map((key) => (
                    <li key={key}>
                      <span>
                        <Check size={15} />
                      </span>
                      {t(key)}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        <section
          className="faq-section section-pad"
          id="faq"
          aria-labelledby="faq-title"
        >
          <div className="landing-container faq-grid">
            <Reveal>
              <div className="section-heading">
                <p className="eyebrow">{t("landing.faqEyebrow")}</p>
                <h2 id="faq-title">{t("landing.faqTitle")}</h2>
              </div>
            </Reveal>
            <div className="faq-list">
              {faqs.map((faq, index) => {
                const isOpen = openFaq === index;
                return (
                  <Reveal key={faq.question} delay={index * 90}>
                    <article className={`faq-item${isOpen ? " is-open" : ""}`}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenFaq(isOpen ? -1 : index)}
                      >
                        <span>{t(faq.question)}</span>
                        <ChevronDown size={20} />
                      </button>
                      <div className="faq-answer">
                        <div>
                          <p>{t(faq.answer)}</p>
                        </div>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div className="landing-container final-cta-inner">
            <Reveal>
              <p className="eyebrow eyebrow--amber">DOCUMIND</p>
              <h2>{t("landing.finalTitle")}</h2>
              <p>{t("landing.finalBody")}</p>
              <Link
                href={isAuthenticated ? appRoute : ROUTES.register}
                className="button button--amber button--large"
              >
                {isAuthenticated
                  ? text("Vào ứng dụng", "Open app")
                  : t("common.register")}
                <ArrowRight size={18} />
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container footer-grid">
          <div className="footer-brand-col">
            <Brand compact />
            <p className="footer-tagline">{t("landing.footerTagline")}</p>
          </div>
          <div className="footer-links-col">
            <h4>{t("landing.footerProduct")}</h4>
            <ul>
              <li>
                <a href="#features">{t("nav.features")}</a>
              </li>
              <li>
                <a href="#workflow">{t("nav.workflow")}</a>
              </li>
              <li>
                <a href="#security">{t("nav.security")}</a>
              </li>
              <li>
                <a href="#faq">{t("nav.faq")}</a>
              </li>
            </ul>
          </div>
          <div className="footer-links-col">
            <h4>{t("landing.footerApp")}</h4>
            <ul>
              {isAuthenticated ? (
                <li>
                  <Link href={appRoute}>
                    {text("Vào ứng dụng", "Open app")}
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link href={ROUTES.login}>{t("common.login")}</Link>
                  </li>
                  <li>
                    <Link href={ROUTES.register}>{t("common.register")}</Link>
                  </li>
                </>
              )}
              <li>
                <Link href={isAuthenticated ? ROUTES.library : ROUTES.login}>
                  {t("nav.library")}
                </Link>
              </li>
              <li>
                <Link href={isAuthenticated ? ROUTES.community : ROUTES.login}>
                  {t("nav.community")}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="landing-container footer-bottom">
          <p>{t("landing.footerCopy")}</p>
        </div>
      </footer>
    </div>
  );
}
