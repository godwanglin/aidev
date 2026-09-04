---
name: Technical Precision
colors:
  surface: '#f9f9ff'
  surface-dim: '#d3daea'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eefe'
  surface-container-high: '#e2e8f8'
  surface-container-highest: '#dce2f3'
  on-surface: '#151c27'
  on-surface-variant: '#434655'
  inverse-surface: '#2a313d'
  inverse-on-surface: '#ebf1ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#575e70'
  on-secondary: '#ffffff'
  secondary-container: '#d9dff5'
  on-secondary-container: '#5c6274'
  tertiary: '#943700'
  on-tertiary: '#ffffff'
  tertiary-container: '#bc4800'
  on-tertiary-container: '#ffede6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#dce2f7'
  secondary-fixed-dim: '#c0c6db'
  on-secondary-fixed: '#141b2b'
  on-secondary-fixed-variant: '#404758'
  tertiary-fixed: '#ffdbcd'
  tertiary-fixed-dim: '#ffb596'
  on-tertiary-fixed: '#360f00'
  on-tertiary-fixed-variant: '#7d2d00'
  background: '#f9f9ff'
  on-background: '#151c27'
  surface-variant: '#dce2f3'
  surface-subtle: '#F9FAFB'
  border-default: '#E5E7EB'
  text-primary: '#111827'
  text-secondary: '#4B5563'
  text-tertiary: '#9CA3AF'
typography:
  headline-lg:
    fontFamily: Geist
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-page: 32px
  container-max: 1280px
  density-compact: 8px
  density-comfortable: 16px
---

## Brand & Style

This design system is engineered for high-utility developer interfaces where information density and clarity are paramount. The brand personality is clinical, reliable, and sophisticated—stripping away visual noise to prioritize the user's data and workflows.

The aesthetic follows a **Technical Minimalism** movement. It utilizes a disciplined monochrome palette, strict grid alignment, and razor-sharp typography. The emotional response should be one of "calm control," allowing developers to navigate complex API documentation, logs, and billing structures without cognitive fatigue. Visual flair is reserved exclusively for functional state changes (focus, active, success), ensuring that every pixel serves a purpose.

## Colors

The palette is rooted in a grayscale spectrum to maintain a professional, paper-like quality. 

- **Primary (#2563EB):** Used sparingly for primary actions, progress indicators, and active text links. It is the sole "signal" color in a sea of neutrals.
- **Surface Strategy:** Use `#FFFFFF` for the main content cards and `#F9FAFB` for the application background to create a subtle "layered" effect without relying on shadows.
- **Borders:** `#E5E7EB` is the workhorse for structural division. In high-density tables or nested components, use a lighter `#F3F4F6` to prevent the UI from feeling "heavy."
- **Typography:** Contrast is strictly managed. Use `#111827` for headings to ensure maximum legibility, and `#4B5563` for body text to reduce eye strain during long reading sessions.

## Typography

The system uses a multi-font approach to differentiate between "interface," "content," and "data."

- **Interface & Headings:** **Geist** provides a sharp, geometric feel that reinforces the technical aesthetic. Headlines use tight letter-spacing to maintain a compact, "designed" look.
- **Body Copy:** **Inter** is used for its exceptional legibility at small sizes, particularly in data-heavy views.
- **Data & Code:** **JetBrains Mono** is utilized for API keys, code snippets, and tabular numerals to ensure alignment and technical character.

For mobile, scale down `headline-lg` to 24px and increase line-height slightly on `body-md` to maintain touch-target legibility.

## Layout & Spacing

This design system uses a strict 4px baseline grid. All padding and margins must be multiples of 4.

- **Grid:** A 12-column fluid grid is used for dashboard layouts. On desktop, sidebars are fixed at 240px or 280px, with the main content area expanding to fill the remaining space up to a maximum of 1280px.
- **Density:** To accommodate developer tools, use "Compact" spacing (8px) for sidebars, tables, and toolbars. Use "Comfortable" spacing (16px-24px) for documentation and marketing-focused landing pages.
- **Breakpoints:**
  - Mobile: < 640px (1-column, 16px margins)
  - Tablet: 640px - 1024px (Stacking sidebars into a hamburger menu)
  - Desktop: > 1024px (Fixed sidebar, fluid content)

## Elevation & Depth

Elevation is primarily communicated through **Tonal Layers** and **1px Outlines** rather than shadows. This maintains a "flat" and modern technical feel.

- **Level 0 (Background):** `#F9FAFB`. The foundation.
- **Level 1 (Cards/Surface):** `#FFFFFF` with a 1px solid border of `#E5E7EB`. No shadow.
- **Level 2 (Popovers/Modals):** `#FFFFFF` with a 1px border and a very subtle "Ambient Shadow" (0px 4px 6px rgba(0,0,0,0.05)).
- **Focus States:** Use a 2px offset ring in the primary blue (#2563EB) to ensure accessibility without cluttering the resting UI state.

## Shapes

The shape language is "Soft" but disciplined. 

- **Components:** Standard buttons, inputs, and cards use a **4px (0.25rem)** radius. This creates a precise, engineered appearance.
- **Interactive Elements:** Checkboxes and radio buttons follow the same 4px rule.
- **Tags/Chips:** May use a slightly more rounded 6px radius to differentiate them from buttons, but never a full pill-shape.

## Components

- **Buttons:** Primary buttons use a solid `#111827` (Dark Charcoal) or `#2563EB` (Primary Blue) with white text. Secondary buttons use a white background with a 1px `#E5E7EB` border. Padding is compact: `8px 12px`.
- **Inputs:** Use a 1px border. On `:focus`, the border changes to the primary blue with a subtle 2px glow. Placeholder text is `#9CA3AF`.
- **Data Tables:** Dense layout. Row height is fixed at `40px`. Use `text-sm` for cell content. Header cells use `label-md` with a subtle bottom border.
- **Chips/Badges:** Small text, monochromatic. Success states use a subtle green tint background, but the text remains dark for legibility.
- **Code Blocks:** Background `#111827` with syntax highlighting. Use a "Copy" button in the top-right corner that appears on hover.
- **Navigation:** Vertical sidebar with monochrome icons (20px). The active state is indicated by a subtle background shift to `#F3F4F6` and a 2px vertical blue line on the left edge.