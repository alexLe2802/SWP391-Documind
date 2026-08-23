---
name: Soft Editorial SaaS
colors:
  surface: '#faf9f6'
  surface-dim: '#dbdad7'
  surface-bright: '#faf9f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f1'
  surface-container: '#efeeeb'
  surface-container-high: '#e9e8e5'
  surface-container-highest: '#e3e2e0'
  on-surface: '#1a1c1a'
  on-surface-variant: '#45464d'
  inverse-surface: '#2f312f'
  inverse-on-surface: '#f2f1ee'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#904d00'
  on-secondary: '#ffffff'
  secondary-container: '#fe932c'
  on-secondary-container: '#663500'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#0d1c2e'
  on-tertiary-container: '#77859a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#ffdcc3'
  secondary-fixed-dim: '#ffb77d'
  on-secondary-fixed: '#2f1500'
  on-secondary-fixed-variant: '#6e3900'
  tertiary-fixed: '#d5e3fc'
  tertiary-fixed-dim: '#b9c7df'
  on-tertiary-fixed: '#0d1c2e'
  on-tertiary-fixed-variant: '#3a485b'
  background: '#faf9f6'
  on-background: '#1a1c1a'
  surface-variant: '#e3e2e0'
  card-bg: '#FFFFFF'
  muted-text: '#64748B'
  border-light: '#E2E8F0'
  border-subtle: '#E5E7EB'
  hover-surface: '#F8FAFC'
  ai-hover: '#B45309'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-md:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-margin: 2rem
  section-gap: 4rem
  card-padding: 1.5rem
  gutter: 1.5rem
  stack-sm: 0.5rem
  stack-md: 1rem
---

## Brand & Style

The design system for the product is built on the **Soft Editorial SaaS** narrative. It bridges the gap between high-end academic publishing and modern functional software. The brand personality is intelligent, calm, and premium, designed to evoke a sense of focused scholarship and AI-driven efficiency.

The visual style is a sophisticated blend of **Minimalism** and **Modern Corporate** aesthetics, characterized by generous whitespace, a warm "paper-like" canvas, and soft, approachable geometry. It deliberately avoids the coldness of standard tech interfaces by using editorial typographic pairings and a palette inspired by physical archives and gold-leaf accents.

**Design Principles:**

- **Academic Intelligence:** Layouts prioritize document readability and structured information.
- **Soft Precision:** High corner radii (12px–24px) eliminate the "industrial" feel of typical SaaS, replacing it with a friendly, high-end furniture-like softness.
- **AI-First Clarity:** Artificial Intelligence features are treated with distinct warmth and clarity, never feeling hidden or intrusive.

## Colors

The color strategy mimics an editorial experience. The **Neutral Canvas (#FAF9F6)** provides a warm, off-white "Alabaster" foundation that reduces eye strain compared to pure white, while **White (#FFFFFF)** is reserved for elevated content surfaces like cards and panels to create a clear structural hierarchy.

- **Primary (Deep Navy):** Used for high-emphasis actions and core branding. It provides the necessary weight and authority for an academic tool.
- **Secondary (Warm Gold):** Exclusively reserved for AI-related accents, signals, and interactive sparkles. This separates "human-generated" UI from "AI-assisted" UI.
- **Tertiary & Muted Slates:** Used for secondary text and metadata to maintain a clean, uncluttered interface.
- **Borders:** Extremely subtle Slate-200 lines are used to define space without creating the "boxy" look common in traditional dashboards.

## Typography

This system employs a **dual-font strategy** to balance editorial character with SaaS functionalism.

1.  **Serif (Playfair Display):** Used for Hero headings, section titles, and large-scale storytelling elements. It provides the "academic journal" aesthetic.
2.  **Sans-Serif (Inter):** The workhorse for the entire functional UI. All buttons, sidebars, forms, tables, and AI chat messages must use Inter to ensure maximum legibility at small sizes and high-density information environments.

**Usage Notes:**

- Maintain high contrast between Serif headlines and Sans-Serif body text.
- Metadata and labels should utilize slightly increased letter spacing and semi-bold weights for clarity against the warm background.

## Layout & Spacing

The layout philosophy follows a **Fixed-Fluid Hybrid** model. Public-facing editorial pages use a centered fixed-width grid for readability, while internal workspaces utilize a fluid multi-column system to maximize research utility.

**Internal Workspace Structures:**

- **Dashboard:** 2-column layout with a fixed sidebar.
- **Reader:** 50/50 split layout for simultaneous document viewing and AI interaction.
- **Research:** 3-column workspace (Sidebar | Chat | Sources).

**Spacing Rhythm:**
A 4px-based scale is used, but preferred increments are larger (16px, 24px, 32px) to ensure the interface feels "airy" and premium. Avoid cramped components; negative space is a functional tool here to reduce cognitive load during document analysis.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Ambient Shadows** rather than harsh borders.

- **Surface Levels:** The canvas is the lowest level (#FAF9F6). White cards (#FFFFFF) sit on top of this canvas, creating a subtle natural lift.
- **Shadow Profile:** Shadows are diffused and low-opacity. Use a "dual-shadow" approach for cards: a sharp, 1px blur for edge definition and a soft, 24px blur to simulate a gentle lift from the paper-like background.
- **Depth Color:** Shadows should be tinted with the Primary Navy color (`rgba(15, 23, 42, 0.04)`) to maintain color harmony and avoid "dirty" gray shadows.

## Shapes

The shape language is defined by **Soft Rounding**. There are no sharp corners in this system.

- **Standard Elements (Buttons, Table Rows):** 10px–12px radius.
- **Large Containers (Cards, Panels):** 14px–16px radius.
- **Interactive Inputs (Search, AI Boxes):** 18px–24px radius to emphasize their "container" nature for user thoughts.
- **Badges/Chips:** Always 999px (Pill-shaped) to distinguish them as discrete metadata entities.

## Components

### Buttons

- **Primary:** Deep Navy background, White text. Use 12px radius.
- **AI Accent:** Warm Gold background. Used exclusively for "Generate" or "Ask AI" triggers.
- **Secondary:** White background with a Slate-200 border.

### AI Chat Interface

- **User Bubbles:** Deep Navy with right alignment.
- **AI Bubbles:** White with a Slate-200 border and a small Gold sparkle icon.
- **Citations:** Small Gold badges `[n]` that trigger a source-snippet tooltip on hover.

### Inputs & Search

- AI Search bars should be prominently rounded (24px).
- Focus states must use the Warm Gold (#D97706) for the border and a soft 3px outer glow.

### Cards & Tables

- **Cards:** Solid White with a 1px Slate-200 border and soft ambient shadow.
- **Tables:** The table container must have a 12px radius. Individual rows should have a 10px radius on hover with a Slate-50 background shift to indicate interactivity.

### Chips & Badges

- Used for status (e.g., "AI Ready") or metadata. Always pill-shaped with a soft tinted background (e.g., light gold or light slate).
