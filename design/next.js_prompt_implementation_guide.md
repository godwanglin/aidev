# Next.js Implementation Guide: Technical Precision Dashboard

Gunakan prompt berikut pada AI Coding Assistant pilihan Anda (seperti Cursor, v0, atau Claude Dev) untuk mengimplementasikan desain ini menggunakan **Next.js 14/15 (App Router)** dan **Tailwind CSS**.

---

## 1. Environment & Tech Stack Prompt
> "Build a high-density developer platform dashboard using Next.js 15 (App Router), Tailwind CSS, and TypeScript. 
> - **Typography**: Use 'Geist' and 'Geist Mono' for a technical aesthetic.
> - **Icons**: Lucide React (monochrome, 1.25px stroke).
> - **Components**: Radix UI or shadcn/ui for primitives.
> - **Styling**: Strict 1px borders, #2563eb as the primary accent, and a light gray surface palette (#f9f9ff)."

## 2. Global Styles (Tailwind Config)
Implementasikan token warna dari `design.md`:
```javascript
// tailwind.config.ts extracts
theme: {
  extend: {
    colors: {
      surface: '#f9f9ff',
      'surface-container': '#edf1f9',
      primary: '#2563eb',
      border: '#c3c7cf', // outline-variant
      'on-surface': '#191c20',
      'on-surface-variant': '#43474e',
    },
    borderRadius: {
      'sm': '4px', // ROUND_FOUR from design system
    }
  }
}
```

## 3. Component Architecture Prompt
> "Create a layout shell with:
> 1. **Fixed Sidebar**: 256px width, `#f9f9ff` background, 1px right border. Include a workspace switcher at the top and 'Overview, Playground, Projects, API Keys, Usage, Logs, Models, Files, Team, Settings, Billing, Help' in the navigation. Use active state with a left 2px blue border.
> 2. **Sticky TopBar**: Thin 1px bottom border, including Breadcrumbs and a 'Deploy' primary button.
> 3. **Main Content**: Scrollable area with 24px (6rem) padding.
> 4. **Data Tables**: Implement a 'Dense' table style with minimal padding, system-monospaced fonts for IDs and numbers, and subtle row hover effects."

## 4. Specific Page Prompts
### Overview Page
> "Generate an 'Overview' dashboard page. 
> - Top row: 4 compact KPI cards (Total Requests, Tokens Used, API Cost, Error Rate) with small sparklines.
> - Middle: A large, clean line chart using Recharts for 'API Usage'. No gradients, thin lines, subtle grid.
> - Bottom: Two-column grid. Left (2/3): 'Recent Activity' table. Right (1/3): 'Quick Actions' command list."

### API Logs Page
> "Generate a technical 'API Logs' page. 
> - Feature a search bar and status filter at the top.
> - A wide table with columns: Timestamp, Request ID (mono), Endpoint, Model, Status (with colored dot), Latency.
> - Ensure high information density (at least 15 rows visible without scrolling)."

---

## Tips untuk Hasil Maksimal:
- **Density**: Selalu minta AI untuk "reduce padding" dan "increase information density".
- **Monochrome**: Tekankan agar tidak menggunakan gradien atau bayangan yang berat (shadow-sm saja).
- **Interactive**: Tambahkan instruksi untuk `active:scale-95` pada button untuk feel yang responsif.