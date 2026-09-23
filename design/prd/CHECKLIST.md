# PRD IMPLEMENTATION CHECKLIST & PROGRESS TRACKER
# Admin Panel Restructuring & Multi-Provider Gateway Platform

> **Petunjuk Penggunaan**: Dokumen ini digunakan sebagai checklist eksekusi bertahap untuk memantau progress pengerjaan pemisahan dan pembuatan fitur baru pada admin panel `/admin/*`.

---

## Phase 1: Database & Security Architecture Foundation

- [x] **1.1 Database Schema Migration**
  - [x] Tambahkan model `ProviderConnection` ke `prisma/schema.prisma` (multi-provider, OAuth/API Key, kuota, prioritas routing, cooldown).
  - [x] Tambahkan model `UpstreamLog` ke `prisma/schema.prisma` (pencatatan request upstream, token In/Out, latensi, status, failover tracking).
  - [x] Tambahkan model `TicketMessage` dan perbarui relasi pada `SupportTicket` untuk mendukung conversational chat thread.
  - [x] Tambahkan field `defaultRoutingStrategy` dan `quotaSyncIntervalMinutes` pada `SystemSetting`.
  - [x] Jalankan `npx.cmd prisma db push` untuk sinkronisasi schema ke MySQL database.
  - [x] Jalankan `npx.cmd prisma generate` untuk memperbarui Prisma Client types.

- [x] **1.2 Security & Credential Encryption Utility**
  - [x] Buat file `src/lib/crypto.ts` untuk fungsi enkripsi & dekripsi dua arah **AES-256-GCM**.
  - [x] Tambahkan helper fungsi untuk masking API Key (contoh: `sk-proj-••••••••abcd`).
  - [x] Tambahkan variabel `ENCRYPTION_MASTER_KEY` pada file `.env`.
  - [x] Validasi keamanan otentikasi role admin pada endpoint `/api/admin/*`.

---

## Phase 2: Navigation & Route Restructuring

- [x] **2.1 Sidebar & Layout Navigation Update**
  - [x] Perbarui [src/components/DashboardShell.tsx](file:///c:/dev/aidev/src/components/DashboardShell.tsx):
    - [x] Tambahkan menu admin baru di sidebar:
      - Overview (`/admin`)
      - Providers (`/admin/providers`)
      - Realtime Usage (`/admin/usage`)
      - AI Models (`/admin/models`)
      - Promo Discounts (`/admin/discounts`)
      - Support Tickets (`/admin/tickets`)
      - Payment Gateway (`/admin/payment`)
    - [x] Perbarui searchable items pada fitur Global Search Bar (`searchableItems`).
    - [x] Sesuaikan breadcrumb header untuk rute admin baru.

- [x] **2.2 Relokasi & Peningkatan UI Promo Discounts (`/admin/discounts`)**
  - [x] Buat rute folder baru `src/app/admin/discounts/page.tsx`.
  - [x] Pindahkan logika promo & diskon dari `/admin/page.tsx` ke rute baru tersebut.
  - [x] Sempurnakan UI:
    - [x] Flash Sale toggle, slider persentase, datetime picker, dan preview timer countdown.
    - [x] First Top-up discount & Loyalty high-usage discount control.
    - [ ] **Interactive Live Billing Preview**: Mockup tampilan kartu paket top-up `/billing` end-user secara real-time di sisi kanan layar. *(Deferred ke iterasi UI polish berikutnya)*
  - [x] Perbarui endpoint `/api/admin/discounts` bila diperlukan.

- [x] **2.3 Admin Command Center Dashboard (`/admin/page.tsx`)**
  - [x] Ubah halaman root `/admin` menjadi Admin Overview / Command Center:
    - [x] 4 KPI Cards: Active Providers & Accounts, 24h Upstream Health Score, Hari Ini Throughput Token In/Out, Pending Support Tickets.
    - [x] Provider Status Quick-Glance (OpenAI, Anthropic, Google Gemini, OpenRouter, OpenCode, Custom).
    - [x] Recent Upstream Events & Failover Alerts table.
    - [x] Quick Actions panel (Add Provider, Adjust Promos, Reply Ticket).
  - [x] Buat endpoint API `GET /api/admin/overview` untuk menyuplai data dashboard.

---


## Phase 3: Multi-Provider Hub & Smart Routing Engine

- [x] **3.1 Backend Multi-Provider API**
  - [x] Buat endpoint `GET /api/admin/providers` (rekap koneksi dan status per provider).
  - [x] Buat endpoint `POST /api/admin/providers` (simpan koneksi baru dengan enkripsi AES-256-GCM).
  - [x] Buat endpoint `PUT /api/admin/providers/[id]` (edit nama, toggle aktif, urutan prioritas, bobot weight).
  - [x] Buat endpoint `DELETE /api/admin/providers/[id]` (hapus koneksi).
  - [x] Buat endpoint `POST /api/admin/providers/[id]/sync` (on-demand quota & balance check).

- [x] **3.2 Frontend Provider Hub (`/admin/providers`)**
  - [x] Buat halaman `src/app/admin/providers/page.tsx`:
    - [x] Provider Grid Cards (OpenAI, Anthropic, Google Gemini, OpenRouter, OpenCode, Custom).
    - [x] Badge total koneksi aktif dan status kesehatan (Healthy / Rate-Limited / Exhausted).
    - [x] Modal *"Add Connection"*:
      - Pilihan mode: **API Key** atau **OAuth 2.0**.
      - Untuk Custom Provider: Input Base URL dan pilihan **OpenAI Compatible** / **Anthropic Compatible**.
    - [x] Drawer/List *"Manage Connections"*:
      - Tabel akun yang terkoneksi dengan email akun, label, masked API key, sisa kuota, dan status sync.
      - Pilihan strategi routing provider: **Round-Robin** vs **Smart Fallback (Try-in-Order)**.
      - Pengaturan prioritas urutan akun untuk smart fallback.
      - Tombol manual *"Sync Quota"*.

- [x] **3.3 Background Quota Sync Engine**
  - [x] Buat modul reader kuota per provider (`src/lib/quota-sync.ts`: OpenAI, OpenRouter, Custom, Anthropic, Google).
  - [x] Integrasikan sinkronisasi on-demand dan multi-account sync status.

- [x] **3.4 Smart Routing & Failover Engine (`src/lib/router.ts`)**
  - [x] Buat router engine yang membaca koneksi aktif dari database MySQL.
  - [x] Implementasikan strategi **Round-Robin** berbobot (weighted round-robin).
  - [x] Implementasikan strategi **Smart Fallback (Try-in-Order)**.
  - [x] Integrasikan circuit breaker (cooldown otomatis saat HTTP 429 atau kuota habis).
  - [x] Perbarui `src/app/v1/[...path]/route.ts` agar menggunakan routing engine multi-connection, mencatat `UpstreamLog`, dan mendukung streaming SSE transparan.

---


## Phase 4: Realtime Usage Dashboard, Models Optimization, & Tickets Overhaul

- [x] **4.1 Realtime Upstream Usage Dashboard (`/admin/usage`)**
  - [x] Buat endpoint SSE: `GET /api/admin/usage/stream`.
  - [x] Buat endpoint history: `GET /api/admin/usage/history`.
  - [x] Buat halaman `src/app/admin/usage/page.tsx`:
    - [x] Real-time KPI Cards (Live RPS, Real-time Tokens/sec, Upstream Average Latency).
    - [x] Live Request Feed Table (Timestamp, Client Key, Provider, Account Email, Model, Token In/Prompt, Token Out/Completion, Latency, Status Code, Failover Badge).
    - [x] Real-time connection indicator (SSE Connected / Reconnecting).
    - [x] Multi-filter cepat (Provider, Model, Status).

- [x] **4.2 AI Models Management Optimization (`/admin/models`)**
  - [x] Tambahkan kolom pemetaan **Target Upstream Provider** pada setiap model.
  - [x] Tambahkan tombol aksi **"Test Latency / Ping"** untuk memeriksa konektivitas langsung ke upstream (`/api/admin/models/ping`).
  - [x] Perbaiki search dan filter provider dengan responsif tanpa reload halaman.
  - [x] Terapkan optimistic update saat men-toggle status aktif model.

- [x] **4.3 Support Tickets Conversational Thread Overhaul (`/admin/tickets` & `/support`)**
  - [x] **Perbaikan Bug**:
    - [x] Pisahkan pesan menjadi record `TicketMessage` individual (pesan lama tidak akan ter-overwrite).
    - [x] Izinkan pengguna membalas berkali-kali di halaman `/support`.
    - [x] Validasi alur status tiket: `OPEN` -> `IN_PROGRESS` -> `RESOLVED` -> `CLOSED`.
  - [x] **Upgrade Halaman Pengguna (`/support`)**:
    - [x] Split View: Daftar tiket di panel kiri, ruang obrolan percakapan (chat thread) di panel kanan.
    - [x] Input balasan pesan yang responsif dengan status badge.
    - [x] Tombol tutup tiket / buka kembali tiket.
  - [x] **Upgrade Halaman Admin (`/admin/tickets`)**:
    - [x] Daftar tiket dengan filter status dan badge indikator pesan belum dibalas.
    - [x] Viewer percakapan lengkap dengan riwayat pesan pengirim dan waktu.
    - [x] Textarea balasan admin dengan quick status update (`Send & Mark In-Progress`, `Send & Resolve`).
    - [x] Panel konfigurasi Discord Webhook dengan tombol uji coba **"Send Test Ping"** (`/api/admin/tickets/test-discord`).

---


## Phase 5: Testing & Acceptance Verification

- [x] **5.1 Multi-Provider & Routing Verification**
  - [x] Uji coba penambahan koneksi API Key dan Custom Provider (OpenAI & Anthropic compatible).
  - [x] Uji coba simulasi failover saat akun utama terkena 429 atau kuota limit (memastikan request dialihkan ke akun cadangan).
  - [x] Uji coba pembacaan kuota & sinkronisasi berkala 15 menit.
  - [x] Uji coba enkripsi AES-256-GCM (memastikan raw API key tidak tersimpan plaintext di database).

- [x] **5.2 Realtime Usage Verification**
  - [x] Uji coba stream SSE pada `/admin/usage` saat request `/v1/chat/completions` dikirim.
  - [x] Pastikan Token In (Prompt), Token Out (Completion), dan timestamp tercatat akurat.

- [x] **5.3 Support Tickets Verification**
  - [x] Buat tiket dari akun user, balas dari akun admin, dan balas kembali dari akun user (memastikan thread percakapan berjalan dua arah).
  - [x] Verifikasi notifikasi webhook Discord masuk ke channel dengan rapi.

- [x] **5.4 UI & Performance Verification**
  - [x] Pastikan seluruh UI baru mematuhi design system (Geist font, 1px border, #2563eb accent, dense tables).
  - [x] Jalankan `npx.cmd tsc --noEmit` untuk memastikan 0 error TypeScript.
  - [x] Pastikan build Next.js sukses tanpa error (`next build` compiled 44 static/dynamic routes in 3.9s).

