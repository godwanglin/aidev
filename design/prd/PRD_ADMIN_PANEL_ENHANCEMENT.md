# PRODUCT REQUIREMENT DOCUMENT (PRD)
# Admin Panel Restructuring & Multi-Provider Gateway Platform

- **Project**: Aidev Gateway (`aidev-gateway`)
- **Version**: 2.0.0
- **Status**: Ready for Implementation
- **Last Updated**: 2026-09-17
- **Author**: Antigravity Technical Architecture Team
- **Reference**: [9Router Architecture](https://github.com/decolua/9router)

---

## 1. Executive Summary & Background

Aidev Gateway saat ini beroperasi menggunakan upstream provider tunggal (`UPSTREAM_BASE_URL` dan `UPSTREAM_API_KEY` statis di `.env`), dan panel admin masih menempatkan kontrol diskon langsung di root `/admin`.

PRD ini mendefinisikan transformasi arsitektur menyeluruh:
1. **Restrukturisasi Rute Admin Panel (`/admin/*`)**: Memisahkan modul-modul admin menjadi struktur yang modular, profesional, dan scalable.
2. **Multi-Provider & Multi-Connection Hub (`/admin/providers`)**: Mengadopsi arsitektur multi-akun & multi-provider seperti **9Router**, memungkinkan penambahan koneksi tanpa batas ke OpenAI, Anthropic, Google Gemini, OpenRouter, OpenCode, dan Custom Provider (OpenAI/Anthropic compatible) via **API Key** maupun **OAuth 2.0**.
3. **Smart Routing & Fallback Engine**: Mendistribusikan trafik request AI menggunakan strategi **Round-Robin** atau **Smart Fallback (Try-in-Order)** dengan failover otomatis saat akun terkena Rate Limit (HTTP 429) atau kuota habis.
4. **Realtime Upstream Observability (`/admin/usage`)**: Dashboard visualisasi penggunaan model dan token (In/Out) secara real-time menggunakan **Server-Sent Events (SSE)** stream.
5. **Support Tickets Conversation Thread**: Merombak sistem tiket bantuan menjadi multi-message chat thread interaktif dua arah antara developer dan admin.
6. **User-Friendly Promo & AI Models**: Peningkatan UX modul promo diskon dengan live billing preview serta katalog AI Models yang terintegrasi dengan upstream providers.

---

## 2. Information Architecture & Navigation

### 2.1 Peta Rute Admin Panel Baru

```
/admin                      -> Admin Command Center & Overview Dashboard (NEW)
├── /admin/providers        -> Multi-Connection Provider Hub (NEW)
├── /admin/usage            -> Realtime Upstream Stream & Analytics (NEW)
├── /admin/models           -> Optimized AI Models Management & Upstream Mapping
├── /admin/discounts        -> Promo, Flash Sale, & Loyalty Discounts (RELOCATED)
├── /admin/tickets          -> Support Tickets Center (UPGRADED)
└── /admin/payment          -> Payment Gateway Configuration (EXISTING)
```

### 2.2 Peta Rute Pengguna Terkait
```
/support                    -> End-User Support Center (UPGRADED to Multi-Message)
/billing                    -> End-User Billing & Top-Up (Integrated with Promo Previews)
/v1/*                       -> OpenAI-Compatible Proxy Router (UPGRADED with Multi-Connection Engine)
```

---

## 3. Detailed Functional Specifications

### 3.1 Feature 1: Admin Command Center (`/admin`)
Halaman landing panel admin utama yang berfungsi sebagai pusat kendali ringkas:
- **KPI Metrics Cards**:
  - Total Active Providers & Connected Accounts.
  - Upstream Health Score (% status 200 vs 429/500 dalam 24 jam).
  - Total Token Throughput Hari Ini (In/Out).
  - Tiket Support yang Membutuhkan Perhatian (`OPEN` & `IN_PROGRESS`).
- **Provider Status Quick Glance**: Menampilkan baris status ringkas tiap provider (OpenAI, Anthropic, Gemini, dsb.) beserta indikator hijau/kuning/merah.
- **Recent Upstream Events & Alerts**: Feed cepat request failover, akun yang terkena limit kuota, atau error upstream.
- **Quick Links**: Pintasan cepat ke penambahan koneksi baru, broadcast promo, atau balas tiket.

---

### 3.2 Feature 2: Multi-Connection Provider Hub (`/admin/providers`)
Modul sentral untuk mengelola semua akun provider upstream (terinspirasi dari 9Router).

#### 3.2.1 Provider Supported
1. **OpenAI**: Direct API Key (`sk-...`), Project Keys (`sk-proj-...`).
2. **Anthropic**: Direct API Key (`sk-ant-...`), OAuth / Claude Code Session.
3. **Google Gemini**: Gemini API Key, Google Cloud OAuth / Service Account.
4. **OpenRouter**: OpenRouter API Key (`sk-or-...`).
5. **OpenCode**: OpenCode API Key / Session Token.
6. **Custom Provider**:
   - Base URL kustom (contoh: `https://api.groq.com/openai/v1`, `https://api.deepseek.com/v1`, Ollama lokal, dsb.).
   - Protokol Kompatibilitas: Pilihan dropdown **OpenAI Compatible** atau **Anthropic Compatible**.
   - API Key & Custom Headers opsional.

#### 3.2.2 Metode Otentikasi
- **API Key**: Admin memasukkan API key secara manual. Kunci disimpan terenkripsi **AES-256-GCM** di database MySQL, dan selalu di-mask di UI (`sk-proj-••••••••abcd`).
- **OAuth 2.0**: Alur login OAuth web/callback atau Device Code Flow untuk provider yang mendukung (Google, Anthropic/Claude Code). Otomatis memperbarui `access_token` menggunakan `refresh_token`.

#### 3.2.3 Pembacaan Kuota & Akun
- **Informasi Akun**: Membaca email akun terdaftar, tier langganan, dan nama organisasi jika API provider mendukung.
- **Kuota & Usage Tracking**:
  - Membaca saldo kredit / kuota tersisa dan persentase terpakai.
  - Visualisasi progress bar kuota (Warna hijau jika normal, kuning jika < 20%, merah jika habis/exhausted).
  - **Mekanisme Sinkronisasi**:
    - **Background Auto-Sync**: Sinkronisasi otomatis setiap **15 menit** via scheduled cron job.
    - **Manual Sync**: Tombol *"Sync Quota"* pada tiap kartu koneksi untuk pembaruan instan.

#### 3.2.4 Tampilan UI Provider Hub
- **Halaman Utama**:
  - Menampilkan grid kartu provider utama (OpenAI, Anthropic, Google, OpenRouter, OpenCode, Custom).
  - Setiap kartu provider menampilkan badge: `Total Koneksi: N`, `Healthy: X`, `Rate Limited: Y`.
  - Tombol *"Manage Connections"* untuk masuk ke daftar koneksi spesifik provider tersebut.
- **Drawer / Modal Koneksi**:
  - Daftar semua akun dalam provider tersebut.
  - Sakelar Aktif/Nonaktif per koneksi.
  - Pemilihan Strategi Routing Provider: **Round-Robin** vs **Smart Fallback (Try-in-Order)**.
  - Drag-and-drop / tombol naik-turun untuk mengatur urutan prioritas jika memilih Smart Fallback.

---

### 3.3 Feature 3: Smart Routing & Auto-Failover Engine (`src/lib/router.ts`)
Menggantikan sistem proxy statis tunggal di `src/app/v1/[...path]/route.ts`.

#### 3.3.1 Logika Pemilihan Akun
Saat request client masuk ke `/v1/*` untuk model tertentu (contoh: `gpt-5.2` atau `claude-3-5-sonnet`):
1. **Identifikasi Provider**: Sistem mencocokkan model dengan provider yang bertanggung jawab.
2. **Filter Akun Sehat**: Memilih koneksi aktif yang tidak dalam status `COOLDOWN` (akibat 429 baru-baru ini) dan memiliki kuota valid.
3. **Eksekusi Strategi**:
   - **Round-Robin**: Memilih koneksi berikutnya secara seimbang (weighted counter).
   - **Smart Fallback**: Menggunakan koneksi Prioritas #1 terlebih dahulu.

#### 3.3.2 Auto-Failover & Circuit Breaker
Jika upstream merespons dengan:
- **HTTP 429 (Rate Limit Exceeded)** atau **HTTP 402/403 (Quota Exceeded)**:
  1. Tandai koneksi tersebut dalam status `COOLDOWN` selama durasi cooldown adaptif (default: 60 detik).
  2. Secara instan ulangi request (transparent retry) ke koneksi sehat berikutnya dalam provider yang sama tanpa memutus request client!
  3. Catat status failover ke dalam `UpstreamLog`.

---

### 3.4 Feature 4: Realtime Upstream Usage Dashboard (`/admin/usage`)
Dashboard pemantauan aktivitas upstream langsung tanpa jeda.

#### 3.4.1 Real-Time Server-Sent Events (SSE) Stream
- Endpoint server: `GET /api/admin/usage/stream`.
- Mengalirkan setiap event request upstream yang baru selesai ke browser klien admin secara real-time.

#### 3.4.2 Elemen Tampilan Dashboard
1. **Live Traffic Sparklines & Stats**:
   - Upstream RPS (Requests per Second).
   - Real-time Token In (Prompt) vs Token Out (Completion).
   - Latensi Rata-rata Upstream (ms).
2. **Tabel Live Request Feed**:
   - **Timestamp**: `HH:mm:ss.SSS`
   - **User / Internal Key**: ID developer pemanggil (`sk-int-...`).
   - **Provider**: Badge provider (OpenAI, Anthropic, dll.).
   - **Connection / Account**: Label nama & email akun upstream yang digunakan.
   - **Model**: Nama model AI (`gpt-5.2`, `claude-opus-4.6`, dll.).
   - **Tokens In (Prompt)**: Jumlah token input.
   - **Tokens Out (Completion)**: Jumlah token output.
   - **Total Tokens**: Akumulasi token.
   - **Latency**: Durasi eksekusi upstream dalam ms.
   - **Status**: Badge HTTP Status upstream (200 OK, 429 Rate Limit, 500 Error).
   - **Failover Badge**: Menandai apakah request ini merupakan hasil failover otomatis.
3. **Filter Interaktif**: Filter cepat berdasarkan Provider, Model, dan Status HTTP tanpa me-reload halaman.

---

### 3.5 Feature 5: AI Models Management Optimization (`/admin/models`)
Optimasi modul katalog model yang sudah ada:
- **Upstream Provider Mapping**: Kolom baru untuk menentukan provider default atau custom target upstream untuk model tersebut.
- **Live Latency Ping / Health Check**: Tombol per baris model untuk menguji koneksi langsung ke upstream model tersebut dan menampilkan waktu respons milidetik.
- **Pencarian Cepat & Filter Multi-Kriteria**: Filter model berdasarkan provider, status aktif, dan context window.
- **Optimistic UI Update**: Sakelar aktif/nonaktif langsung berubah di UI tanpa reload yang lambat.

---

### 3.6 Feature 6: User-Friendly Promo & Discounts (`/admin/discounts`)
Pemisahan dari `/admin` ke rute khusus `/admin/discounts` dengan tampilan modern:
- **Flash Sale Promo**:
  - Tombol Toggle Aktif/Nonaktif yang jelas.
  - Input persentase diskon (%) dengan slider visual.
  - Date & Time Picker untuk waktu mulai dan waktu berakhir promo.
  - **Live Preview Countdown**: Menampilkan timer countdown persis seperti yang akan dilihat end-user.
- **First Top-up Discount & Loyalty Discount**:
  - Penjelasan visual dan slider batas threshold token.
- **Live Billing Preview Widget**:
  - Di sebelah kanan layar admin, terdapat mockup interaktif yang mensimulasikan tampilan kartu paket top-up di halaman `/billing` end-user, termasuk badge diskon yang tercoret dan harga akhir IDR.

---

### 3.7 Feature 7: Support Tickets Conversation Thread (`/admin/tickets` & `/support`)
Merombak sistem tiket yang sebelumnya hanya 1 pesan & 1 jawaban menjadi thread percakapan dinamis.

#### 3.7.1 Bug Fixes yang Diperbaiki
1. **Pesan Ter-Overwrite**: Sebelumnya, update status oleh admin dapat menghapus atau menimpa teks respon sebelumnya. Sekarang setiap balasan tersimpan sebagai record `TicketMessage` baru dengan timestamp.
2. **User Tidak Bisa Menjawab Balasan Admin**: Pengguna kini dapat membalas respon admin di halaman `/support` sampai masalah benar-benar tuntas.
3. **Status Workflow**: Alur status jelas: `OPEN` (Baru) -> `IN_PROGRESS` (Sedang ditangani) -> `RESOLVED` (Terselesaikan) -> `CLOSED` (Ditutup). User atau admin dapat me-reopen tiket jika kendala muncul kembali.

#### 3.7.2 Tampilan Pengguna (`/support`)
- **Split View Layout**:
  - Sisi Kiri: Daftar tiket milik pengguna dengan status badge warna dan indikator jika ada pesan baru dari admin.
  - Sisi Kanan: Ruang obrolan (Conversation Thread) interaktif lengkap dengan riwayat pesan, nama pengirim, timestamp, dan box input balasan.
- Form pembuatan tiket baru yang simpel dan responsif dengan kategori (Technical, Billing, Account, Other).

#### 3.7.3 Tampilan Admin (`/admin/tickets`)
- Filter tiket berdasarkan status (`ALL`, `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`).
- Kotak pesan percakapan lengkap.
- Tombol aksi cepat update status (`Mark Resolved`, `Close Ticket`).
- **Discord Webhook Center**: Input Webhook URL dilengkapi tombol *"Send Test Ping"* untuk memverifikasi koneksi notifikasi ke channel Discord.

---

## 4. Database Schema Specifications (Prisma)

Pembaruan skema pada file `prisma/schema.prisma`:

```prisma
// ==========================================
// 1. MULTI-PROVIDER & CONNECTIONS (NEW)
// ==========================================

model ProviderConnection {
  id               String            @id @default(cuid())
  provider         String            // "OPENAI", "ANTHROPIC", "GOOGLE", "OPENROUTER", "OPENCODE", "CUSTOM"
  name             String            // Alias/Label, contoh: "OpenAI Team Pro Account"
  authType         String            @default("API_KEY") // "API_KEY" atau "OAUTH"
  
  // Encrypted Credentials (AES-256-GCM)
  apiKeyEncrypted  String?           @db.Text
  accessTokenEnc   String?           @db.Text
  refreshTokenEnc  String?           @db.Text
  tokenExpiresAt   DateTime?
  
  // Custom Provider Specific
  baseUrl          String?           // Contoh: "https://api.groq.com/openai/v1"
  compatibility    String?           @default("OPENAI") // "OPENAI" atau "ANTHROPIC"
  customHeaders    String?           @db.Text // JSON string format
  
  // Account & Quota Metadata
  accountEmail     String?
  tier             String?
  quotaLimitTokens BigInt?
  quotaUsedTokens  BigInt?
  quotaRemainingUsd Decimal?         @db.Decimal(10, 2)
  lastSyncedAt     DateTime?
  syncStatus       String            @default("NORMAL") // "NORMAL", "LOW_QUOTA", "EXHAUSTED", "ERROR"
  
  // Routing Config
  isActive         Boolean           @default(true)
  priority         Int               @default(1) // 1 = highest priority for Smart Fallback
  weight           Int               @default(1) // Weight for Round-Robin
  cooldownUntil    DateTime?         // If hit 429, temporary cooldown until this timestamp
  
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
  upstreamLogs     UpstreamLog[]

  @@index([provider, isActive])
  @@index([provider, priority])
}

// ==========================================
// 2. REALTIME UPSTREAM LOGS (NEW)
// ==========================================

model UpstreamLog {
  id                 String             @id @default(cuid())
  connectionId       String?
  connection         ProviderConnection? @relation(fields: [connectionId], references: [id], onDelete: SetNull)
  provider           String
  model              String
  clientApiKeyId     String?
  clientUserId       String?
  promptTokens       Int                @default(0)
  completionTokens   Int                @default(0)
  totalTokens        Int                @default(0)
  latencyMs          Int                @default(0)
  statusCode         Int
  isFailover         Boolean            @default(false)
  failoverReason     String?
  createdAt          DateTime           @default(now())

  @@index([connectionId])
  @@index([provider, createdAt])
  @@index([createdAt])
}

// ==========================================
// 3. ENHANCED SUPPORT TICKETS WITH MESSAGES (UPDATED)
// ==========================================

model SupportTicket {
  id        String          @id @default(cuid())
  userId    String
  user      User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  category  String
  subject   String
  status    String          @default("OPEN") // OPEN, IN_PROGRESS, RESOLVED, CLOSED
  createdAt DateTime        @default(now())
  updatedAt DateTime        @default(now()) @updatedAt
  messages  TicketMessage[]

  @@index([userId])
  @@index([status, createdAt])
}

model TicketMessage {
  id        String        @id @default(cuid())
  ticketId  String
  ticket    SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  senderId  String        // User ID or "ADMIN"
  senderRole String       @default("USER") // "USER" or "ADMIN"
  senderName String?
  message   String        @db.Text
  createdAt DateTime      @default(now())

  @@index([ticketId, createdAt])
}

// ==========================================
// 4. EXTENDED SYSTEM SETTING FOR ROUTING
// ==========================================
// SystemSetting ditambahkan field:
// - defaultRoutingStrategy String @default("SMART_FALLBACK") // "ROUND_ROBIN" | "SMART_FALLBACK"
// - quotaSyncIntervalMinutes Int @default(15)
```

---

## 5. API Endpoints Specification

### 5.1 Provider Connections API
- `GET /api/admin/providers`: Mengambil daftar provider, statistik total koneksi, dan status ringkas.
- `GET /api/admin/providers/[provider]`: Mengambil daftar akun koneksi untuk provider tertentu (API key dalam bentuk mask).
- `POST /api/admin/providers`: Membuat koneksi provider baru (menerima API key atau konfigurasi OAuth).
- `PUT /api/admin/providers/[id]`: Mengupdate nama, kredensial, prioritas, strategi routing, atau status aktif.
- `DELETE /api/admin/providers/[id]`: Menghapus koneksi provider.
- `POST /api/admin/providers/[id]/sync`: Memicu sinkronisasi kuota dan info akun secara on-demand.

### 5.2 Realtime Usage Stream API
- `GET /api/admin/usage/stream`: Server-Sent Events (SSE) endpoint yang meng-emit event `upstream_request` setiap kali proxy mengeksekusi request ke provider upstream.
- `GET /api/admin/usage/history`: Mengambil riwayat log upstream dengan filter (provider, model, status, pagination).

### 5.3 Support Tickets API (Upgraded)
- `GET /api/admin/tickets`: Mengambil semua tiket beserta daftar pesan terbarunya.
- `GET /api/support`: Mengambil semua tiket milik pengguna yang sedang login.
- `POST /api/support`: Membuat tiket baru (otomatis membuat `TicketMessage` pertama dan mengirim notifikasi Discord).
- `POST /api/support/[ticketId]/reply`: Pengguna membalas pesan dalam tiket.
- `POST /api/admin/tickets/[ticketId]/reply`: Admin membalas tiket dan/atau mengubah status tiket.
- `POST /api/admin/tickets/test-discord`: Mengirim pesan uji coba ke Webhook Discord.

---

## 6. Security & Credential Management

1. **Enkripsi Kredensial (AES-256-GCM)**:
   - Modul `src/lib/crypto.ts` menggunakan algoritma `aes-256-gcm` dengan initialization vector (IV) unik 12-byte dan auth tag 16-byte.
   - Master key disimpan dalam variabel lingkungan `ENCRYPTION_MASTER_KEY` di `.env`.
2. **UI Masking**:
   - String API key asli tidak pernah dikirim balik ke frontend secara utuh.
   - Format response frontend: `prefix + "••••••••" + last4` (contoh: `sk-proj-••••••••9F1a`).
3. **Session & Role Protection**:
   - Semua rute `/admin/*` dan `/api/admin/*` diverifikasi ganda via `src/proxy.ts` dan fungsi server `verifyAdmin()` (memeriksa `role === "ADMIN"` atau `email === "admin@devportal.local"`).

---

## 7. UI/UX & Design System Alignment

Desain tampilan baru harus mematuhi panduan desain pada `design/next.js_prompt_implementation_guide.md`:
- **Tipografi**: `Geist` (Inter/system-ui fallback) dan `Geist Mono` untuk kode, token, angka, dan identifier.
- **Ikonografi**: `Lucide React` dengan stroke monokrom 1.25px - 1.5px.
- **Palet Warna**:
  - Primary Accent: `#2563eb`
  - Background Surface: `#f9f9ff`
  - Surface Container / Card: `#ffffff` dan `#edf1f9`
  - Border: Strict 1px `#c3c7cf` / `#e2e8f0`
- **Dense Tables**: Padding ramping (`py-2 px-3`), baris ringkas, teks monospaced untuk token, ID, dan angka.
- **Active Navigation Sidebar**: Integrasi menu baru pada [DashboardShell.tsx](file:///c:/dev/aidev/src/components/DashboardShell.tsx):
  - Overview (`/admin`)
  - Providers (`/admin/providers`)
  - Realtime Usage (`/admin/usage`)
  - AI Models (`/admin/models`)
  - Promo Discounts (`/admin/discounts`)
  - Support Tickets (`/admin/tickets`)
  - Payment Gateway (`/admin/payment`)

---

## 8. Implementation Phases & Roadmap

- **Phase 1: Database & Core Security Foundation**
  - Update `schema.prisma` dengan model `ProviderConnection`, `UpstreamLog`, `TicketMessage`.
  - Migrasi skema database (`prisma db push`).
  - Implementasi utilitas enkripsi `src/lib/crypto.ts`.
- **Phase 2: Admin Navigation & Route Restructuring**
  - Update [DashboardShell.tsx](file:///c:/dev/aidev/src/components/DashboardShell.tsx) dengan menu admin baru.
  - Pindahkan Promo Discounts dari `/admin/page.tsx` ke `/admin/discounts/page.tsx` dengan UI yang disempurnakan.
  - Bangun Admin Overview Dashboard di `/admin/page.tsx`.
- **Phase 3: Multi-Provider Hub & Smart Routing Engine**
  - Buat halaman `/admin/providers` (daftar provider, modal tambah koneksi API Key & OAuth, visualisasi kuota).
  - Buat background scheduler sinkronisasi kuota tiap 15 menit & API sync manual.
  - Implementasikan `src/lib/router.ts` (Round-Robin & Smart Fallback) dan perbarui `/v1/[...path]/route.ts`.
- **Phase 4: Realtime Usage Dashboard & Support Tickets Overhaul**
  - Implementasikan SSE stream endpoint `/api/admin/usage/stream`.
  - Bangun dashboard `/admin/usage` (live chart, request feed table, filters).
  - Rombak Support Tickets menjadi conversational thread di `/admin/tickets` dan `/support`.
