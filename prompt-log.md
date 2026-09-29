# Prompt Log — Migrasi Sistem Credit (CR) ke USD Resmi

Dokumen ini merekam seluruh instruksi, pekerjaan, dan hasil audit yang telah dikerjakan pada repository `aidev-gateway`.

---

## 1. Rangkaian Instruksi_User

### Tahap 1 — Pemahaman
> "lek"

Permintaan awal untuk memahami sistem Credit yang berjalan: apa itu credit, bagaimana pencatatannya, dan apa arti angka 20.000 CR pada sistem.

### Tahap 2 — Arah Perubahan
> "gini aja sekarang fokus ubah dulu dari CR ke $ jadi, soal kurs per $ nya biar aku yang menentukan nya, pastikan gak ada yang ketinggalan yaa bersih keseluruhan tidak nyangkut di sistem credit lama"

Keputusan:
- Ganti sistem internal Credit (CR) menjadi saldo USD resmi.
- Kurs USD/IDR ditentukan oleh user, bukan di-hardcode.
- Wajib bersih total, tidak boleh ada sisa sistem credit lama.

### Tahap 3 — Migration Berjalan
> "oke lanjutkan"
> "oke lanjut"
> "oke lanjutkan"

Menjalankan Rename Engine, konversi data, migrasi database, dan seed.

### Tahap 4 — Audit Mendalam
> "tunggu sebelum itu kamu pastikan lagi test dan cek dri atas sampe bawah secara e2e dan pastikak tidak ada kesalahan ataupun bug test request cek logs segalamacen yaa."

Permintaan audit menyeluruh: cek dari atas ke bawah, test request, dan cek logs sedetail mungkin.

### Tahap 5 — Sweep Terakhir
> "cek 1 kali lagi siapajat di codebase masih ada yg terlewat"

Permintaan pengecekan tambahan untuk memastikan tidak ada yang terlewat di codebase.

### Tahap 6 — Dokumentasi
> "gini aja lekk, aku minta prompt log yg barusan sudah kamu kerjakan lek"

Permintaan dokumentasi/log dari seluruh pekerjaan yang baru saja diselesaikan.

---

## 2. Keputusan Arsitektur

| Aspek | Nilai |
|---|---|
| Mata uang utama | USD |
| Tipe kolom saldo | Prisma `Decimal(18,8)` |
| Sumber kurs | Environment variable `IDR_PER_USD` (diizinkan user) |
| Lokasi konversi | Layer pembayaran saja, bukan engine token |
| Core file | `src/lib/billing.ts` (dari `src/lib/credits.ts`) |
| File konfigurasi | `src/lib/billing-config.ts` |

### Mapping Rename

| Field Lama | Field Baru |
|---|---|
| `creditBalance` | `balanceUsd` |
| `purchasedCredits` | `purchasedBalanceUsd` |
| `monthlyCreditsAllocated` | `monthlyBalanceAllocatedUsd` |
| `monthlyCreditsRemaining` | `monthlyBalanceRemainingUsd` |
| `creditsCost` | `costUsd` |
| `creditAmount` | `balanceAmountUsd` |
| `rateInPer1k` | `rateInUsdPer1k` |
| `rateOutPer1k` | `rateOutUsdPer1k` |
| `costPerImage` | `imageCostUsd` |
| `monthlyCredits` | `monthlyBalanceUsd` |

| Fungsi Lama | Fungsi Baru |
|---|---|
| `calculateCreditsCost` | `calculateUsdCost` |
| `deductUserCredits` | `deductUserBalance` |
| `refundUserCredits` | `refundUserBalance` |
| `getModelCreditRates` | `getModelUsdRates` |

---

## 3. File yang Diubah

### Core
- `prisma/schema.prisma`
- `prisma/seed-tiers.js`
- `prisma/migrations/20260929_usd_billing_migration/migration.sql`
- `src/lib/billing.ts` (baru)
- `src/lib/billing-config.ts` (baru)
- `src/lib/logger.ts`
- `src/lib/orders.ts`
- `src/lib/auth.ts`
- `src/lib/session.ts`
- `src/lib/discord.ts`
- `src/lib/midtrans.ts`
- `src/lib/combo-router.ts`
- `src/lib/quota-tracker.ts`

### API Routes
- `src/app/api/billing/route.ts`
- `src/app/api/billing/claim-bonus/route.ts`
- `src/app/api/admin/users/route.ts`
- `src/app/api/admin/subscriptions/route.ts`
- `src/app/api/admin/orders/route.ts`
- `src/app/api/admin/combos/route.ts`
- `src/app/api/admin/combos/[id]/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/api/auth/me/route.ts`
- `src/app/api/models/route.ts`
- `src/app/api/v1/models/[...modelId]/route.ts`
- `src/app/api/webhooks/midtrans/route.ts`

### SSE Handlers
- `src/sse/handlers/chat.ts`
- `src/sse/handlers/images.ts`
- `src/sse/handlers/models.ts`
- `src/sse/handlers/eligibility.ts`
- `src/sse/handlers/usage.ts`

### Adapters
- `src/lib/adapters/antigravity.ts`
- `src/lib/adapters/chatgpt-web.ts`
- `src/lib/adapters/codex.ts`
- `src/lib/adapters/responses.ts`

### UI
- `src/app/billing/page.tsx`
- `src/app/logs/page.tsx`
- `src/app/models/page.tsx`
- `src/app/settings/page.tsx`
- `src/app/support/page.tsx`
- `src/app/docs/page.tsx`
- `src/app/changelog/page.tsx`
- `src/app/admin/combos/page.tsx`
- `src/app/admin/orders/page.tsx`
- `src/app/admin/users/page.tsx`
- `src/app/admin/subscriptions/page.tsx`
- `src/app/admin/logs/page.tsx`
- `src/app/admin/providers/[provider]/page.tsx`
- `src/components/DashboardShell.tsx`
- `src/app/globals.css`

---

## 4. Bug yang Ditemukan dan Diperbaiki

### registry 1 — Integritas Data
1. **BOM dan escape karakter rusak pada `prisma/schema.prisma`**
   - Penyebab: penulisan file melalui PowerShell heredoc.
   - Gejala: `prisma format` gagal dengan error `P1012`.
   - Perbaikan: hapus BOM, tulis ulang dengan encoding UTF-8 tanpa BOM.

2. **BigInt masih dipakai pada kolom Decimal**
   - Gejala: error TS `Type 'bigint' is not assignable to type Decimal`.
   - Perbaikan: ganti seluruh aritmetika ke `Number()` dan `Prisma.Decimal`.

3. **Presisi USD hilang karena pembulatan**
   - Lokasi: `src/app/api/admin/combos/route.ts`
   - Gejala: `Math.round(0.00015)` menghasilkan `0`, membuat model gratis.
   - Perbaikan: hapus `Math.round()`, gunakan `Number()` langsung.

### registry 2 — Nilai Default Salah
4. **Fallback pricing masih angka CR**
   - Lokasi: `src/lib/billing.ts`
   - Nilai lama: `25` / `100`
   - Perbaikan: `0.00015` / `0.0006`

5. **Default biaya gambar masih CR**
   - Lokasi: `src/sse/handlers/images.ts`
   - Nilai lama: `500`
   - Perbaikan: `0.005`

6. **Admin Combo masih default CR**
   - Lokasi: `src/app/admin/combos/page.tsx`
   - Nilai lama: `25`, `100`, `500`
   - Perbaikan: `0.00015`, `0.0006`, `0.005`

7. **Admin Subscription model list masih `25` / `100`**
   - Lokasi: `src/app/api/admin/subscriptions/route.ts`
   - Perbaikan: `0.00015` / `0.0006`

8. **Default alokasi user masih `BigInt(20000)`**
   - Lokasi: `src/app/api/admin/users/route.ts`
   - Perbaikan: `0`

### registry 3 — Logika Bisnis
9. **Alur top-up masih memakai rumus CR**
   - Lokasi: `src/app/api/billing/route.ts`
   - Rumus lama: `basePrice = balanceAmountUsd / 10`
   - Perbaikan: harga dalam IDR, konversi via `idrToUsd()`, minimal top-up Rp 1.000.

10. **Token amount tidak konsisten antar branch**
    - Perbaikan: konsolidasikan ke `tokensForUsd()`.

11. **Rasio tier menampilkan satuan campur**
    - Gejala: teks `1:3.1 IDR to Balances`.
    - Perbaikan: format `Rp 49.000 = $3.0625 USD`.

12. **Perbandingan Decimal dengan number**
    - Gejala: `combo.imageCostUsd > 0` gagal untuk tipe Decimal.
    - Perbaikan: `Number(combo.imageCostUsd) > 0`.

### registry 4 — Build Break
13. **Import duplikat `idrToUsd`** di `src/app/api/billing/route.ts`.
14. **Import `BalanceCard` tidak ada** di `lucide-react` pada `src/app/billing/page.tsx`. Perbaikan: `Wallet`.
15. **JSX rusak** di `src/components/DashboardShell.tsx` karena tag `<span>` tidak tertutup.
16. **Here-string rusak** menyisipkan karakter kutip di `src/app/api/billing/route.ts`.

### registry 5 — Kebersihan Kode
17. **CSS class tidak sinkron** — JSX memakai `topbar-balance-*`, CSS masih `topbar-credit-*`.
18. **Sisa teks `CR` / `Credit`** di logs, models, admin combos, admin users, auth, chat handler, images handler, usage handler, logger, orders, midtrans, support.
19. **Komentar schema** masih berisi angka CR lama.
20. **Script cleanup sementara** di `scripts/` sudah dihapus.

---

## 5. Konfigurasi Kurs

```env
IDR_PER_USD=16000
```

Fungsi konversi di `src/lib/billing-config.ts`:

| Fungsi | Kegunaan |
|---|---|
| `idrToUsd(idr)` | Harga IDR menjadi saldo USD |
| `usdToIdr(usd)` | Saldo USD menjadi harga IDR |
| `tokensForUsd(usd)` | Kuota token dari saldo USD |
| `usd(value)` | Normalisasi ke presisi 8 desimal |
| `formatUsd(value)` | Format tampilan `$0.0000` |

Default terpusat:

| Konstanta | Nilai |
|---|---|
| `DEFAULT_RATE_IN_USD_PER_1K` | `0.00015` |
| `DEFAULT_RATE_OUT_USD_PER_1K` | `0.0006` |
| `DEFAULT_IMAGE_COST_USD` | `0.005` |
| `DEFAULT_MONTHLY_BALANCE_USD` | `1` |

---

## 6. Strategi Migrasi Database

File: `prisma/migrations/20260929_usd_billing_migration/migration.sql`

```sql
SET @IDR_PER_USD = 16000;
```

Rumus konversi:

```
usd = lama / 10 / IDR_PER_USD
```

Yang dikonversi:
- `User`: saldo, saldo permanen, alokasi bulanan, sisa bulanan.
- `RequestLog`: `costUsd`.
- `Order`: `balanceAmountUsd`.
- `ComboModel`: rate in/out dan biaya image.
- `SubscriptionTierConfig`: `monthlyBalanceUsd`.
- `ModelPricing`: rate in/out.

Rollback tersedia: `npx prisma migrate resolve --rolled-back <nama_migration>`.

---

## 7. Hasil Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| `npx prisma validate` | Lulus |
| `npx prisma format` | Lulus |
| `npx tsc --noEmit` | 0 error |
| `npm run build` | Sukses |
| Grep identifier legacy | 0 sisa di source |
| Grep default CR | 0 sisa |
| `npm run lint` | Gagal, `eslint.config.js` tidak ada (masalah lama, bukan dari migrasi) |
| Test E2E database | Sukses (19 test case passed) |

---

## 8. Sisa Istilah yang Sengaja Dipertahankan

Istilah berikut bukan bagian dari sistem billing saldo dan tidak diubah:

- `src/lib/codex-reset-credits.ts` — reset credit dari provider OpenAI Codex.
- `src/components/providers/CodexResetCreditsModal.tsx` — UI reset credit provider.
- `reset-credits` route dan CSS `.btn-reset-credits`.
- `openrouter-credits` — terminology quota OpenRouter.
- `CreditCard` — nama ikon dari `lucide-react`.

---

## 9. Checklist Sebelum Production (SELESAI)

- [x] Backup database (`backups/backup_before_usd_*.json` 5.645 RequestLogs, Users, Orders, Combos aman).
- [x] Sesuaikan `@IDR_PER_USD` di migration SQL (16.000).
- [x] Set `IDR_PER_USD="16000"` di environment file (`.env`).
- [x] Jalankan migrasi database (`ALTER TABLE` seluruh tabel ke `DECIMAL(18,8)` dan konversi nilai saldo eksisting).
- [x] Jalankan `node prisma/seed-tiers.js` (Tier FREE, PLUS, PRO, ULTRA & model pricing USD ter-update).
- [x] Test register user dan cek saldo awal ($1.00 USD).
- [x] Test konversi kurs (`idrToUsd`, `usdToIdr`, `tokensForUsd`).
- [x] Test subscription tier activation & tier model access control.
- [x] Test request AI dan perhitungan `costUsd`.
- [x] Test pemotongan saldo (`deductUserBalance`) dan refund saldo (`refundUserBalance`).
- [x] Test decimal logging pada `RequestLog`.
- [x] Test production bundle (`npm run build` sukses 74/74 routes).

---

## 10. Audit Visual & Cleanup UI Billing/Logs

Setelah migrasi core engine dan database, dilakukan audit visual UI berdasarkan feedback user:
1. **Billing History Data Source**:
   - Memperbaiki sumber riwayat pembayaran di `/billing` agar membaca `prisma.order` (bukan `prisma.tokenTopup` yang membagi token 5 juta menjadi 500.000 USD).
   - Label kolom diubah menjadi "Saldo Masuk" dengan format rapi `+$3.1250 USD`.
2. **Kerapian Typography & Format Kurs**:
   - Memperbaiki CSS class `.tier-balance-alloc` yang sempat terpotong menjadi `+3,063USD` menjadi format standar `+$3.0625 USD`.
   - Mengubah card top-up ketengan menjadi kalkulasi dinamis via `idrToUsd(price)` dari [billing-config.ts](file:///c:/dev/aidev/src/lib/billing-config.ts).
   - Memperbaiki typo `SUBSUSDIPTION` kembali ke `SUBSCRIPTION`.
   - Menghapus mojibake karakter UTF-8 rusak seperti `â‰ˆ` dan `Ã¢Å“â€œ` di `/billing`, `/logs`, dan `/admin/users`.
3. **Pembersihan File Legacy**:
   - Menghapus file legacy `src/lib/credits.ts` secara permanen via git rm setelah memastikan seluruh modul mengimpor `src/lib/billing.ts`.

---

## 11. Cakupan Pengaruh `IDR_PER_USD` di Environment

Setting `IDR_PER_USD` di `.env` (atau `NEXT_PUBLIC_IDR_PER_USD`) hanya memengaruhi **jembatan konversi Rupiah saat pembayaran atau tampilan estimasi lokal**:

1. **Konversi Saldo Top-Up Masuk (`idrToUsd`)**:
   - User membayar via QRIS / VA dalam Rupiah (misal Rp 50.000).
   - Nilai saldo USD yang masuk ke akun = `Rp 50.000 / IDR_PER_USD` (contoh: pada kurs 16.000 -> `$3.1250 USD`).
   - Termasuk bonus top-up (+5% pada Rp 100.000, +10% pada Rp 250.000).
2. **Seeding & Konfigurasi Tier Langganan (`prisma/seed-tiers.js`)**:
   - Menentukan jatah saldo bulanan (`monthlyBalanceUsd`) saat script seed dijalankan:
     - Plus (Rp 49.000 / IDR_PER_USD)
     - Pro (Rp 99.000 / IDR_PER_USD)
     - Ultra (Rp 249.000 / IDR_PER_USD)
3. **Tampilan Estimasi Rupiah di Dashboard (`usdToIdr`)**:
   - Menampilkan subtext estimasi kesetaraan Rupiah (misal di modal Admin Users saat inject saldo).
4. **Token Quota Legacy Internal (`tokensForUsd`)**:
   - Menghitung kuota token internal untuk kompatibilitas mundur.

**Yang TIDAK terpengaruh oleh `IDR_PER_USD`**:
- **Pricing Model AI**: Tarif pemakaian prompt/completion AI (misalnya GPT-4o, Claude 3.5 Sonnet, Gemini Flash) murni berbasis USD per 1k token dan **tidak berubah** saat kurs IDR diubah.
- **Saldo Eksisting User**: Saldo USD pengguna (`balanceUsd`) yang sudah ada di database tidak akan berubah nominal dollarnya.

---

## 13. Dynamic Admin Configuration: Subscriptions & Paket Ketengan

Berdasarkan permintaan user agar harga langganan bulanan dan paket ketengan tidak di-hardcode di kode, telah diimplementasikan arsitektur konfigurasi dinamis via Admin Dashboard:

1. **Database Schema (`prisma/schema.prisma`)**:
   - Menambahkan kolom `features String? @db.Text` pada model `SubscriptionTierConfig` untuk menyimpan poin-poin fitur per tier dalam format JSON.
   - Menambahkan model `TopupPackage`:
     ```prisma
     model TopupPackage {
       id              String   @id @default(cuid())
       name            String
       priceIdr        Int
       bonusPercentage Int      @default(0)
       tag             String?
       badgeColor      String?  @default("blue")
       sortOrder       Int      @default(0)
       isActive        Boolean  @default(true)
       createdAt       DateTime @default(now())
       updatedAt       DateTime @updatedAt

       @@index([isActive, sortOrder])
     }
     ```
   - Skema dipush ke MySQL produksi (`194.233.78.169`) dan Prisma Client diperbarui.
   - Seeding awal 4 paket ketengan (Starter Rp 15k, Popular Rp 50k, Super Value Rp 100k bonus 5%, Power User Rp 250k bonus 10%).

2. **Admin API (`src/app/api/admin/subscriptions/route.ts`)**:
   - `GET`: Mengembalikan daftar tiers lengkap (beserta features yang di-parse) dan `topupPackages`.
   - `POST`:
     - `update_tier_config`: Mengupdate nama, harga IDR, saldo bulanan USD, batas RPM, batas API key, prioritas routing, bonus darurat, warna badge, deskripsi, poin fitur, dan status aktif.
     - `create_tier`: Membuat paket langganan baru.
     - `delete_tier`: Menghapus paket langganan kustom.
     - `create_topup_package`: Menambah paket top-up baru.
     - `update_topup_package`: Mengedit nominal IDR, bonus %, tag, warna badge, urutan tampilan, dan status aktif.
     - `delete_topup_package`: Menghapus paket top-up.

3. **Billing Route (`src/app/api/billing/route.ts`)**:
   - `GET`: Mengembalikan `topupPackages` dinamis dari database dan `tier.features`.
   - `POST`: Order checkout membaca paket ketengan secara dinamis dari database untuk menentukan bonus saldo USD, tanpa ada angka yang di-hardcode di kode backend.

4. **Admin UI (`src/app/admin/subscriptions/page.tsx`)**:
   - Menambahkan tab **Paket Langganan** dan **Paket Top-Up Ketengan**.
   - Setiap kartu tier memiliki tombol **Edit Config** yang membuka modal lengkap dengan kalkulator kurs otomatis (*Hitung dari Kurs*).
   - Menambahkan tabel manajemen Paket Ketengan dengan tombol Tambah, Edit, Hapus, dan live preview nominal saldo USD yang diterima.

5. **User Billing UI (`src/app/billing/page.tsx`)**:
   - Menghapus ketergantungan pada array hardcoded `KETENGAN_PACKAGES`.
   - Tampilan modal checkout dan kartu tier membaca langsung dari database via API.

---

## 8. Standarisasi Format 2 Angka Desimal (Kuota Bulanan, Saldo USD, Top-Up)

Sesuai instruksi: Seluruh kuota bulanan, saldo dompet, alokasi bulanan, dan nominal top-up **wajib 2 angka di belakang koma (`.toFixed(2)` / `$X.XX USD`)**, kecuali **Cost AI Request** yang tetap mempertahankan presisi 4–6 angka di belakang koma.

### Rincian Perubahan:

1. **`src/lib/billing-config.ts`**:
   - `formatUsd(value)` diselaraskan ke `Number(value || 0).toFixed(2)`.
   - Menambahkan utilitas pembantu `formatBalance(value, prefix)` untuk 2 desimal.
   - Menambahkan `formatCost(value)` yang menjaga presisi tinggi (4–6 desimal) untuk biaya per token/request.

2. **`src/app/billing/page.tsx`**:
   - Ringkasan progress bar kuota bulanan: `${...toFixed(2)} / ${...toFixed(2)} USD`.
   - Total Saldo USD: `maximumFractionDigits: 2, minimumFractionDigits: 2`.
   - Alokasi Saldo Bulanan kartu tier: `+$${Number(tier.monthlyBalanceUsd || 0).toFixed(2)} USD`.
   - Riwayat transaksi pembayaran: `+$${Number(t.balanceAmountUsd || 0).toFixed(2)} USD`.
   - Konfirmasi modal checkout & badge alokasi: `+$${Number(selectedTier?.monthlyBalanceUsd || 0).toFixed(2)} USD`.
   - Tagihan invoice top-up: `Top-Up Saldo +$${Number(activeInvoice.balanceAmountUsd || 0).toFixed(2)} USD`.
   - Pesan Emergency Rescue bonus: `+$${Number(json.bonusBalanceUsd || 0).toFixed(2)} USD`.

3. **`src/components/DashboardShell.tsx`**:
   - Topbar balance pill & title tooltip: `$${Number(currentUser.balanceUsd ?? 0).toFixed(2)} USD`.
   - Low balance warning banner: `$${Number(currentUser.balanceUsd ?? 0).toFixed(2)} USD`.
   - Mobile navigation drawer saldo dompet AI: `$${Number(currentUser?.balanceUsd ?? 0).toFixed(2)} USD`.

4. **`src/app/admin/subscriptions/page.tsx`**:
   - Kartu tier admin: `${Number(tier.monthlyBalanceUsd || 0).toFixed(2)} USD` (memperbaiki bug visual `toLocaleString()` yang menghasilkan format lokal `6,188 USD`).
   - Tabel tier: `+$${Number(t.monthlyBalanceUsd || 0).toFixed(2)} USD`.
   - Live preview input modal tier & step input: `0.01` dengan `.toFixed(2)`.
   - Estimasi USD paket ketengan: `.toFixed(2)`.

5. **`src/app/admin/users/page.tsx`**:
   - Kolom Saldo di tabel: `$${Number(u.balanceUsd || 0).toFixed(2)} USD`.
   - Subteks Kuota Bulanan & Top-up permanen: `Kuota: $...toFixed(2)` & `Top-up: $...toFixed(2)`.
   - Modal ganti paket: `+${Number(t.monthlyBalanceUsd || 0).toFixed(2)} USD` dan deskripsi auto-add kuota.
   - Modal inject saldo: saldo saat ini dan notifikasi sukses injeksi diformat `.toFixed(2)`.
   - Kartu statistik total kredit beredar: `${Number(stats.totalBalanceUsdInCirculation || 0).toFixed(2)} USD`.

6. **`src/app/admin/orders/page.tsx`**:
   - Kolom detail item order: `+${Number(o.balanceAmountUsd || 0).toFixed(2)} USD / bln (30 hari)` dan `+${Number(o.balanceAmountUsd || 0).toFixed(2)} USD`. Menghapus formula lawas pembagian token `/ 1000`.
   - Modal approval pesanan manual: `+${Number(approveModalOrder.balanceAmountUsd || 0).toFixed(2)} USD`.
   - Modal detail pesanan: `+${Number(detailModalOrder.balanceAmountUsd || 0).toFixed(2)} USD`.

7. **Backend API & Handlers (`src/app/api/billing/claim-bonus/route.ts`, `src/app/api/billing/route.ts`, `src/sse/handlers/usage.ts`, `src/lib/discord.ts`)**:
   - `claim-bonus`: bonus emergency rescue dihitung dan disimpan dengan presisi 2 desimal.
   - `billing`: order checkout saldo top-up dibulatkan ke 2 desimal (`.toFixed(2)`).
   - `/v1/usage`: respon JSON `balance`, `allocated`, `remaining`, `used`, `purchased` diformat konsisten 2 desimal.
   - `discord.ts`: field alert Discord `USD Masuk` diformat `+${Number(...).toFixed(2)} USD`.

---

## 14. Input Mandiri Saldo Ketengan (`balanceUsd`) & Eliminasi Sufiks "USD"

Berdasarkan permintaan user:
1. **Penghapusan Sufiks "USD"**: Tampilan di seluruh aplikasi tidak lagi memakai embel-embel teks `USD` (misal `$6.19 USD`), cukup simbol `$` saja (misal `$6.19`, `+$1.00`). Biaya pemakaian AI (Model Cost) tetap mempertahankan presisi tinggi (4–6 desimal) dengan format `$0.000150`.
2. **Saldo Diterima Paket Ketengan Ditentukan Langsung oleh Admin**: Nilai saldo yang didapatkan customer saat membeli paket ketengan tidak lagi dikonversi dinamis via `IDR_PER_USD` / `NEXT_PUBLIC_IDR_PER_USD`, melainkan diinput langsung oleh admin di modal manajemen paket.

### Rincian Perubahan:

1. **Database Schema & Prisma (`prisma/schema.prisma`)**:
   - Menambahkan kolom `balanceUsd Decimal @default(1.00) @db.Decimal(18, 8)` pada model `TopupPackage`.
   - Menjalankan `npx prisma db push` ke MySQL produksi (`194.233.78.169`).
   - Melakukan seed nilai `balanceUsd` pada paket eksisting: Starter (Rp 15k -> `$1.00`), Popular (Rp 50k -> `$3.15`), Super Value (Rp 100k -> `$6.50`), Power User (Rp 250k -> `$16.50`).
   - Regenerasi Prisma Client (`npx prisma generate`).

2. **Admin API & Billing Order Engine**:
   - `src/app/api/admin/subscriptions/route.ts`:
     - GET mengembalikan `balanceUsd: Number(p.balanceUsd || 1)`.
     - Action `create_topup_package` dan `update_topup_package` menyimpan nilai `balanceUsd`.
   - `src/app/api/billing/route.ts`:
     - Checkout order (`POST`) membaca `matchedPackage.balanceUsd` dari database langsung (menghapus formula konversi `idrToUsd(pkg.priceIdr)`).
     - Menghapus label embel-embel "USD" pada invoice dan item description.
   - `src/app/api/billing/claim-bonus/route.ts`:
     - Menghapus sufiks "USD" pada pesan respon bonus.

3. **Admin Dashboard (`src/app/admin/subscriptions/page.tsx`)**:
   - Menambahkan field input `Saldo Diterima ($):` di modal tambah/edit paket ketengan dengan `step="0.01"`.
   - Menghapus teks kalkulasi `(Kurs 1 USD = Rp 16.000)` dan menggantinya dengan preview langsung `Saldo Diterima Customer: +$${balanceUsd}`.
   - Menghapus seluruh sufiks teks " USD" pada tabel tier, modal tier, dan tabel paket ketengan.

4. **UI Billing & Navigasi**:
   - `src/app/billing/page.tsx`:
     - Menghapus sufiks "USD" dari progress bar kuota, kartu saldo, ringkasan tier langganan, list paket ketengan, invoice dialog, dan riwayat transaksi.
     - Menghapus span unit `<span className="balance-unit">USD</span>` dan `<span className="tier-balance-unit">USD</span>`.
     - Header card diselaraskan dari "Subscription & Saldo USD" menjadi "Subscription & Saldo", dan "Top-Up Saldo USD" menjadi "Top-Up Saldo".
   - `src/components/DashboardShell.tsx`:
     - Menghapus `<span className="topbar-balance-unit">USD</span>`.
     - Tooltip title dan mobile drawer diselaraskan menjadi `$${Number(balance).toFixed(2)}`.
     - Alert saldo menipis diselaraskan menjadi `$${Number(balance).toFixed(2)}`.

5. **Admin Pages & Logs**:
   - `src/app/admin/users/page.tsx`: Menghapus sufiks "USD" pada tabel pengguna, modal inject saldo, modal ganti paket, dan widget statistik.
   - `src/app/admin/orders/page.tsx`: Menghapus sufiks "USD" pada kolom item, modal approve, dan modal detail pesanan.
   - `src/app/logs/page.tsx`:
     - Header kolom diubah dari "Biaya (USD)" menjadi "Biaya ($)".
     - Subtitle diselaraskan menjadi `(in / out / total ≈ $)`.
     - Pill biaya model tetap mempertahankan presisi 4–6 digit desimal tanpa teks "USD" (misal `$0.000150`).
   - `src/lib/discord.ts`: Menghapus sufiks " USD" pada webhook notifikasi pembayaran dan saldo menipis.

---

## 15. Fix Endpoint PUT `/api/admin/combos/[id]`, HTML5 Input Step Validation, & Standarisasi Tarif Model ke Per 1M Tokens

Berdasarkan feedback user:
1. **Fix 405 Method Not Allowed pada PUT `/api/admin/combos/[id]`**:
   - Route `src/app/api/admin/combos/[id]/route.ts` sebelumnya adalah duplikat dari endpoint ping (`/api/admin/combos/ping`) dan hanya memiliki method `POST`.
   - Diimplementasikan method `GET`, `PUT` (mendukung update penuh modal dan toggle cepat `isActive` / `isPublic`), dan `DELETE`.
2. **Fix Bug Browser "Masukkan nilai yang valid. Dua nilai valid terdekat adalah 0 dan 1"**:
   - `<input type="number">` di modal Edit Combo sebelumnya tidak memiliki atribut `step="any"`, sehingga browser menganggap input sebagai integer (`step="1"`) dan memblokir submit form untuk angka desimal.
   - Ditambahkan `step="any"` pada Input Rate, Output Rate, dan Cost Per Image.
3. **Standarisasi Tarif Model ke Per 1M Tokens (Industri Standar seperti OpenAI/Anthropic/OpenRouter)**:
   - Penggunaan satuan per 1.000 token (`rateInUsdPer1k`) diganti dengan **per 1.000.000 tokens (1M tokens)** (`rateInUsdPer1m`, `rateOutUsdPer1m`) agar mudah dibaca dan dikonfigurasi admin tanpa angka nol yang berlebihan (contoh: `$0.625` dan `$2.50` alih-alih `0.000625` dan `0.0025`).
   - Database schema (`prisma/schema.prisma`): Menambahkan kolom `rateInUsdPer1m` dan `rateOutUsdPer1m` pada tabel `ComboModel` dan `ModelPricing`.
   - Seluruh data eksisting di MySQL dikonversi: `rateInUsdPer1m = rateInUsdPer1k * 1000` (misal `gpt-6-astra` In `$0.625`, Out `$2.50` per 1M tokens).
    - Core billing (`src/lib/billing.ts`): Menghitung pemakaian token dengan formula `(tokens / 1_000_000) * ratePer1m`.
   - UI `/admin/combos`, `/models`, dan `/admin/subscriptions`: Menampilkan format `$ / 1M tokens`.

---

## 16. Pembersihan Menyeluruh Mojibake Karakter Rusak UTF-8

Dilakukan audit mendalam dan pembersihan total terhadap karakter encoding rusak (mojibake) di seluruh codebase:
1. **`/admin/combos` (`src/app/admin/combos/page.tsx`)**:
   - Memperbaiki bullet indikator metric `â—  19 Active`, `â—  0 Inactive`, `â—  3 Image` menjadi `● 19 Active`, `● 0 Inactive`, `● 3 Image`.
   - Memperbaiki tombol close modal `âœ•` menjadi `✕`.
   - Memperbaiki tanda panah strategi fallback `â†’` menjadi `→` dan tanda pisah em-dash `â€”` menjadi `—`.
2. **`/admin/logs` (`src/app/admin/logs/page.tsx`)**:
   - Memperbaiki emoji filter scope: `Done ðŸŸ¢` $\rightarrow$ `Done 🟢`, `Fallback âš ï¸ ` $\rightarrow$ `Fallback ⚠️`, `Errors ðŸ”´` $\rightarrow$ `Errors 🔴`.
   - Memperbaiki inline status dot log: `ðŸŸ¢` $\rightarrow$ `🟢`, `ðŸ”´` $\rightarrow$ `🔴`, `â Œ` $\rightarrow$ `❌`, `âœ…` $\rightarrow$ `✅`.
   - Memperbaiki separator titik tengah `Â·` menjadi `·` dan panah `â†’` menjadi `→`.
3. **`/admin/providers/[provider]` (`src/app/admin/providers/[provider]/page.tsx`)**:
   - Memperbaiki badge status environment `â—  Live Production` dan `â—‹ Sandbox Test Mode` menjadi `● Live Production` dan `○ Sandbox Test Mode`.
4. **`/admin/orders` (`src/app/admin/orders/page.tsx`)**:
   - Memperbaiki separator nama user dan tier `User Â· Tier:` menjadi `User · Tier:`.
5. **`/docs` (`src/app/docs/page.tsx`)**:
   - Memperbaiki bullet path sistem `â€¢ Linux` dan `â€¢ Windows` menjadi `• Linux` dan `• Windows`.
6. **Layout Shell (`src/components/DashboardShell.tsx`)**:
   - Memperbaiki shortcut hint modal pencarian `Press Enter Ã¢â€ Âµ` menjadi `Press Enter ↵`.
7. **Integrasi Discord Webhook (`src/lib/discord.ts`)**:
   - Memulihkan emoji rusak pada judul dan field embed: `💰 Pembayaran Sukses`, `🌟 Subscription`, `🪙 Top-up Ketengan`, `🚨 Provider Down Alert`, `🎟️ Support Ticket`, `⚠️ Saldo Menipis`.
8. **Tracker Kuota & Handler Gambar (`src/lib/quota-tracker.ts`, `src/sse/handlers/images.ts`)**:
   - Memperbaiki simbol mata uang `Â¥` $\rightarrow$ `¥`, `Â·` $\rightarrow$ `·`, dan em-dash `Ã¢â‚¬â€ ` $\rightarrow$ `—`.

---

## 17. Backward Compatibility Endpoint `/v1/usage` untuk Coding Agent

Berdasarkan laporan user bahwa coding agent mengalami error saat membaca saldo/kuota dari gateway:
1. **Analisis Akar Masalah**:
   - Sebelumnya, response JSON `/v1/usage` mengembalikan key `credits: { balance, allocated, remaining, used, purchased, percentageUsed }`.
   - Setelah migrasi billing ke engine USD, key tersebut diganti menjadi `balance: { ... }`.
   - Akibatnya, coding agent (seperti Cline, Roo Code, Cursor, OpenCode, dan extension IDE lainnya) yang masih membaca `response.credits.balance` atau `response.credits.remaining` mendapatkan nilai `undefined` dan memicu runtime error:
     `TypeError: Cannot read properties of undefined (reading 'balance')`.
2. **Solusi Implementasi (`src/sse/handlers/usage.ts`)**:
   - Menyediakan **KEDUA-DUANYA** dalam JSON response `/v1/usage`:
     - Key **`balance`**: Format objek baru sistem USD (`balance`, `allocated`, `remaining`, `used`, `purchased`, `percentageUsed`).
     - Key **`credits`**: Objek alias backward compatible berisi nilai yang sama agar coding agent lama langsung sembuh.
     - Top-level aliases: `total_available`, `total_granted`, dan `total_used` untuk kompatibilitas universal dengan berbagai agent library pihak ketiga.

---

## 18. Clean Reset: User Balance, Subscription Tier, Logs, & Transactions

Sesuai permintaan user untuk membersihkan seluruh data aktivitas agar benar-benar bersih dan fresh untuk pengetesan:
1. **Reset Data Pengguna (`User`)**:
   - Saldo seluruh akun diatur menjadi **$5.00** (`balanceUsd: 5.00`).
   - Alokasi bulanan & saldo berjalan diselaraskan: `monthlyBalanceAllocatedUsd: 1.00`, `monthlyBalanceRemainingUsd: 1.00`, `purchasedBalanceUsd: 4.00`.
   - Tier seluruh user diturunkan menjadi **`FREE`** (`subscriptionTier: "FREE"`, `subscriptionStartedAt: null`, `subscriptionExpiresAt: null`, `bonusRescueClaimed: false`).
   - **Role pengguna tetap dipertahankan**: Akun admin (`admin@devportal.local`) tetap memiliki role `ADMIN`, akun lainnya tetap `USER`.
   - API key tetap dipertahankan (riwayat `lastUsedAt` di-clear).
2. **Pembersihan Log & Riwayat (Menjadi 0)**:
   - Menghapus 5.647 entri `RequestLog` (halaman `/logs` dan riwayat request menjadi kosong).
   - Menghapus 1.602 entri `UpstreamLog` (log routing dan failover).
   - Menghapus 13 entri `Order` (riwayat order pesanan).
   - Menghapus 17 entri `TokenTopup` (riwayat token lawas).
   - Menghapus 5 entri `LoyaltyDiscount` dan seluruh support ticket (`SupportTicket`).

---

## 19. Sinkronisasi Kuota Free Tier ($5.00) & Sistem Proteksi Tier (Downgrade/Renew)

Sesuai permintaan user untuk menyinkronkan kuota bulanan Free Tier dengan database ($5.00) dan menerapkan proteksi downgrade tier:

1. **Sinkronisasi Kuota Bulanan Free Tier ($5.00)**:
   - **Database (`SubscriptionTierConfig`)**: Memastikan record tier `FREE` memiliki `monthlyBalanceUsd: 5.00`.
   - **Sinkronisasi Data Pengguna**: Seluruh akun yang berada di tier `FREE` diperbarui sehingga:
     - `monthlyBalanceAllocatedUsd: 5.00`
     - `monthlyBalanceRemainingUsd: 5.00`
   - **Konfigurasi Default (`src/lib/billing-config.ts`)**: `DEFAULT_MONTHLY_BALANCE_USD` diperbarui menjadi `5`.
   - **Registrasi Akun Baru (`src/app/api/auth/register/route.ts`)**: Akun baru otomatis membaca alokasi kuota dari database (`SubscriptionTierConfig.FREE` = $5.00) untuk saldo awal dan kuota bulanan.
   - **Auto-Sync di Endpoint Billing (`src/app/api/billing/route.ts`)**: `GET /api/billing` memastikan jika pengguna berada di tier `FREE`, kuota bulanannya otomatis tersinkronisasi dengan konfigurasi database.
   - **Perbaikan Bug Visual (`src/app/billing/page.tsx`)**: Menghilangkan duplikasi tanda dolar `$$1.00` menjadi `$1.00` / `$5.00` bersih.

2. **Sistem Proteksi Tier (Downgrade Protection)**:
   - **Hierarki Level**: `FREE (0) < PLUS (1) < PRO (2) < ULTRA (3)` via helper `getTierLevel()` di `src/lib/billing-config.ts`.
   - **Backend API (`src/app/api/billing/route.ts`)**:
     - Memvalidasi status langganan aktif: `isSubscriptionActive` (`tier !== "FREE"` dan `subscriptionExpiresAt > now`).
     - **Tolak Downgrade**: Jika pengguna yang sedang berlangganan aktif mencoba memesan paket di bawah tier-nya (misal ULTRA mencoba order PLUS/PRO atau FREE), sistem menolak dengan HTTP 400 dan pesan error:
       `Proteksi Downgrade: Anda sedang aktif di paket [TIER] hingga [TANGGAL]. Tidak dapat downgrade ke paket [TARGET]. Silakan tunggu masa aktif selesai atau pilih paket yang setara/lebih tinggi.`
     - **Tolak Order FREE**: Paket Free tidak memerlukan transaksi pembayaran.
   - **Sistem Perpanjangan Adil (`src/lib/orders.ts` - `settleOrder`)**:
     - Jika pengguna memperpanjang tier yang sama sebelum masa aktif habis (`targetTier === currentTier`), sistem **menambahkan 30 hari ke sisa masa aktif yang ada** (`currentExpiresAt + 30 hari`), bukan menghanguskan sisa hari.
     - Kuota sisa bulan sebelumnya diakumulasikan (`increment`).
     - Jika langganan telah kedaluwarsa saat `GET /api/billing`, sistem otomatis mengembalikan status pengguna ke `FREE` dengan kuota default $5.00.
   - **Tampilan UI (`src/app/billing/page.tsx`)**:
     - **Tier Lebih Rendah**: Kartu diberikan indikator status `TERKUNCI` (<Lock size={9} />), kartu diredupkan (`opacity-60`), dan tombol di-disable dengan label `Tier di Bawah [Current Tier]` dengan tooltip penjelasan.
     - **Paket Aktif Sama**: Menampilkan tombol `Perpanjang (+30 Hari)` untuk memudahkan pengguna memperpanjang masa aktif.
     - **Upgrade**: Menampilkan tombol `Upgrade ke [Tier]`.
     - **Modal Checkout**: Menampilkan badge `PERPANJANGAN (+30 HARI)` jika melakukan renew, dan menampilkan banner error peringatan jika terjadi penolakan order.

---

## 20. Penyelarasan Saldo USD (/settings) & Rate Limit + Maksimal Key Sesuai Tier (/keys)

1. **Penyelarasan Kartu Ringkasan Akun (`/settings`)**:
   - **Backend API (`src/app/api/settings/route.ts`)**:
     - Mengembalikan data `balanceUsd`, `monthlyBalanceAllocatedUsd`, `monthlyBalanceRemainingUsd`, `subscriptionTier`, dan `subscriptionExpiresAt`.
   - **Frontend UI (`src/app/settings/page.tsx`)**:
     - Mengubah kartu lama `Personal Usage & Keys Overview` (yang sebelumnya menampilkan saldo unit token lama `50.000.000 Tokens`) menjadi **`Personal Usage & Balance Overview`**.
     - Menampilkan **Total Saldo Dompet (USD)** (`$5.00 USD`), **Kuota Bulanan Paket** (`$0.00 / $5.00 USD`), **Paket Berlangganan** (`FREE PLAN`), dan jumlah **My Active API Keys** secara sinkron.
     - Menyediakan tautan cepat `Kelola Saldo & Paket Langganan` langsung menuju halaman `/billing`.

2. **Rate Limit (RPM) & Batas Maksimal Pembuatan API Key Sesuai Tier (`/keys`)**:
   - **Konfigurasi Database (`SubscriptionTierConfig`)**:
     - `FREE`: 5 RPM, Maksimal 2 API Keys
     - `PLUS`: 30 RPM, Maksimal 5 API Keys
     - `PRO`: 60 RPM, Maksimal 10 API Keys
     - `ULTRA`: 120 RPM, Unlimited (-1) API Keys
   - **Backend API (`src/app/api/keys/route.ts`)**:
     - **Batas RPM Dinamis**: `POST /api/keys` tidak lagi di-hardcode ke 30 RPM, melainkan otomatis mengikuti nilai `rpmLimit` dari paket tier aktif pengguna (5 RPM untuk Free, 30 RPM untuk Plus, 60 RPM untuk Pro, 120 RPM untuk Ultra).
     - **Proteksi Kuota Key**: Memvalidasi jumlah key aktif milik pengguna (`currentKeysCount >= maxKeys`). Jika kuota penuh, request ditolak dengan HTTP 400 dan pesan error yang mengarahkan untuk upgrade paket.
     - **Metadata Tier di GET**: Mengembalikan informasi tier, RPM limit, batas maksimal key, dan flag `canCreate`.
   - **Sinkronisasi Otomatis saat Upgrade (`src/lib/orders.ts`)**:
     - Saat pesanan aktivasi/upgrade langganan selesai diverifikasi (`settleOrder`), sistem otomatis memperbarui nilai `rateLimit` seluruh API key yang sudah dimiliki pengguna ke RPM limit paket baru.
     - Seluruh key pengguna Free yang sudah ada di database disinkronkan ke 5 RPM.
   - **Tampilan UI Modal & Halaman (`src/app/keys/page.tsx`)**:
     - Subtext modal pembuatan key sekarang dinamis:
       `Rate Limit otomatis: [X] requests/minute (berdasarkan paket [Nama Paket]).`
       `Kuota API Key: [Total] / [Maksimal] Keys.`
     - Jika kuota pembuatan key telah tercapai, modal menampilkan kartu peringatan khusus lengkap dengan tombol `Upgrade Paket di Billing`, serta tombol generate di-disable dengan label `Kuota Key Penuh`.
     - Header halaman menampilkan badge ringkasan paket, kuota key, dan batas RPM.










