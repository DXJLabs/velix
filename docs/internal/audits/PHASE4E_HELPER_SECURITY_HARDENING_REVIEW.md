# Tinjauan Keamanan VeilChannelHelper — Fase 4E

**Tanggal:** 2026-07-20
**Branch:** `phase4/privacy-prover-boundary`
**Commit terakhir:** `73917df69dc59e9639f1ae585a2e36a170dfc1c0`

> Ini adalah tinjauan keamanan sumber internal (security hardening review).
> Ini BUKAN audit keamanan independen atau lengkap.

---

## Verdict Eksekutif

VeilChannelHelper saat ini mengimplementasikan penyimpanan pesan terenkripsi yang valid secara struktural dengan validasi envelope, komitmen preimage, dan proteksi duplikat. Tidak ada kerentanan kritis yang ditemukan dalam sumber saat ini.

Risiko utama adalah tingkat aplikasi: lokasi pesan yang dapat diprediksi (jika SDK tidak menggunakan entropi tinggi), pertumbuhan storage permanen, dan ketergantungan pada alamat Privacy Pool yang dipilih. Helper ini tidak mengautentikasi pengirim atau penerima — semua otorisasi didelegasikan ke Pool.

Deployment ke Sepolia direkomendasikan secara BERSYARAT: terblokir sementara hingga syarat controlled-test terpenuhi, bukan penolakan arsitektur.

---

## Batas Otorisasi

Helper mengautentikasi hanya satu identitas: alamat Privacy Pool yang dipasang pada konstruksi.

```cairo
assert(caller == self.privacy_pool.read(), errors::UNAUTHORIZED_PRIVACY_POOL);
```

Helper TIDAK mengautentikasi identitas pengirim atau penerima plaintext. Ini adalah desain yang disengaja — helper hanya memvalidasi struktur dan komitmen ciphertext. Otorisasi partisipan aplikasi, jika diperlukan, harus didesain melalui bukti privasi-kompatibel, kemampuan terenkripsi, atau kebijakan protokol. Menambahkan otorisasi partisipan secara langsung akan merusak privasi.

---

## Commitment Preimage

Commitment dihitung sebagai:

```
Poseidon(
  VEIL_MESSAGE_COMMITMENT_DOMAIN,   // 'VEIL_MSG_COMMIT_V1'
  envelope_version,                  // u8 → felt252
  message_locator,                   // felt252
  payload_chunk_count,               // u64 → felt252
  ...ciphertext_chunks               // felt252[]
)
```

`claimed_payload_commitment` (index 2 calldata) dibandingkan dengan hasil komputasi ini — commitment yang diklaim itu sendiri bukan bagian dari preimage. Mengubah satu chunk ciphertext pun mengubah commitment yang dihasilkan.

Catatan: Preimage saat ini tidak mengikat alamat kontrak helper. Ini bukan eksploitasi tabrakan antar-kontrak saat ini karena setiap kontrak yang dideploy memiliki storage terpisah. Ini adalah pertimbangan penguatan protokol untuk envelope V2 di masa depan, opsional setelah perubahan SDK, test, dan spesifikasi kontrak yang terkoordinasi. Bukan blokir Sepolia untuk envelope V1.

---

## Analisis Replay dan Locator

| Lapis | Perlindungan | Cakupan |
|---|---|---|
| Pool WriteOnce | Melindungi action/transaksi yang berisi menurut semantik Pool | Transaction-level |
| Helper: locator uniqueness | Mencegah locator yang sama ditulis dua kali | Helper-level, duplicate protection |
| Helper: commitment uniqueness | Mencegah commitment yang sama digunakan dua kali | Helper-level, duplicate protection |

Penting:

- Pool WriteOnce melindungi action/transaksi yang mengandung menurut semantik Pool.
- Keunikan locator dan keunikan commitment adalah proteksi duplikat tingkat helper.
- Keduanya BUKAN autentikasi partisipan atau proteksi replay lengkap pada level pesan aplikasi.
- Locator yang dapat diprediksi dapat memungkinkan konsumsi locator yang ditargetkan jika terekspos sebelum inklusi.
- Ancaman visibilitas pra-inklusi dan pemesanan aktual tidak didemonstrasikan dalam tinjauan ini.

**Syarat:** Spesifikasi SDK untuk lokator pesan satu kali dengan entropi tinggi harus dikunci sebelum deployment.

---

## Analisis Spam dan Storage

Setiap pesan yang diterima menulis secara permanen:
- 1 `VeilMessageRecord` (4 field)
- N ciphertext chunks (hingga 64)
- 2 boolean marker (`stored_message_locators`, `committed_payloads`)

Batas 64 chunk membatasi biaya per panggilan tetapi tidak membatasi pertumbuhan state seumur hidup.

Mitigasi yang NAIF tidak direkomendasikan:
- `max_messages` global dapat sendiri dihabiskan untuk menolak layanan secara permanen.
- Pruning dapat merusak discovery imutabel dan pengambilan pesan historis.
- Ekonomi spam, kebijakan ukuran payload, monitoring, dan penanganan kebisingan indexer memerlukan desain terpisah.

Ini tetap merupakan risiko testnet yang dimonitor, bukan risiko produksi yang terselesaikan.

---

## Analisis Metadata Privasi

Metadata yang tetap terlihat on-chain:
- `message_locator` (event key, felt252)
- `payload_commitment` (event data, felt252)
- `payload_chunk_count` (via VeilMessageRecord)
- Transaction hash, block timestamp, gas

Lokasi pesan TIDAK boleh digunakan sebagai:
- identifikasi percakapan
- identifikasi channel
- identifikasi deal
- identifikasi pengirim atau penerima

SDK harus menghasilkan locator dari entropi tinggi (bukan sekuensial atau deterministik). Pertimbangkan batching pada tingkat Pool untuk mengurangi korelasi timing.

---

## Analisis Storage dan External-Call

| Aspek | Status |
|---|---|
| Partial-write safety | ✓ Transaksi Cairo atomik — semua atau tidak sama sekali |
| Reentrancy | ✓ Tidak ada external call, tidak ada interaksi ERC-20 |
| Event ordering | ✓ Event emit setelah semua storage write |
| Empty return span | ✓ `Span<OpenNoteDeposit>` kosong — source-compatible dengan helper messaging-only |

Kesesuaian runtime belum diverifikasi hingga eksekusi terhadap helper yang dideploy ulang diuji. Runtime safety belum sepenuhnya diverifikasi.

---

## Temuan Berdasarkan Severity

### HIGH (3)

| # | Temuan | Rekomendasi |
|---|---|---|
| 1 | Locator griefing — observer dapat memprediksi dan mengonsumsi locator sebelum inklusi | SDK harus menggunakan locator entropi tinggi |
| 2 | Tidak ada autentikasi partisipan — helper hanya mengautentikasi Pool | Desain ulang jika diperlukan: gunakan bukti privasi-kompatibel |
| 3 | Duplikat helper ≠ replay protection — helper mencegah duplikat, bukan replay pesan aplikasi | Dokumentasikan batas dengan jelas |

### MEDIUM (4)

| # | Temuan | Rekomendasi |
|---|---|---|
| 4 | Konstruktor menerima alamat apa pun ≠ 0 — tidak memverifikasi bahwa itu adalah Pool | Prosedur deployment harus memverifikasi alamat Pool |
| 5 | Preimage commitment tidak mengikat alamat kontrak — penguatan untuk v2 | Opsional, terkoordinasi dengan SDK |
| 6 | Metadata leakage — locator, commitment, chunk count, timing terlihat | SDK: entropi tinggi; Pool: batching opsional |
| 7 | Cakupan test — 20 lulus tetapi edge cases tertentu belum diuji | Lihat bagian Test Hardening |

### LOW (3)

| # | Temuan | Rekomendasi |
|---|---|---|
| 8 | Griefing komitmen — penyerang dapat pre-register commitment | Ruang 252-bit membuat ini tidak praktis |
| 9 | Konstruktor tidak bisa diubah — migrasi Pool butuh helper baru | Dokumentasikan prosedur redeploy |
| 10 | Test edge cases — calldata kosong, getter unknown, event layout | Lihat Test Hardening |

### INFORMATIONAL (1)

| # | Temuan |
|---|---|
| 11 | usize conversion aman karena chunk_count ≤ 64 |

---

## Test Hardening

20 test saat ini lulus. Diperlukan test tambahan sebelum deployment:

| Test yang Diperlukan | Alasan |
|---|---|
| Empty calldata (`privacy_invoke([])`) | Edge case yang belum diuji |
| `message_exists(false)` untuk locator tidak dikenal | Verifikasi false-negative |
| `is_payload_committed(false)` untuk commitment tidak dikenal | Verifikasi false-negative |
| Layout event MessageCommitted (key/data) | Verifikasi struktur event yang tepat |
| Beberapa pesan valid independen | Verifikasi tidak ada interferensi |
| Ciphertext chunks sama dengan locator berbeda (entropi tinggi) | Verifikasi tidak ada kolisi |
| State tidak berubah setelah setiap jalur penolakan | Verifikasi isolasi kegagalan |
| Vektor komitmen deterministik bersama SDK | Verifikasi konsistensi SDK ↔ Cairo |
| Property/fuzz untuk chunk count dan calldata length | Coverage otomatis jika didukung |

```
HELPER_TEST_HARDENING_REQUIRED=true
```

---

## Syarat Controlled Deployment

Deployment ke Sepolia diblokir sementara hingga kondisi berikut terpenuhi:

| Syarat | Status |
|---|---|
| Spesifikasi derivasi locator SDK dikunci | ❌ Belum |
| Vektor komitmen deterministik SDK/Cairo lulus | ❌ Belum |
| Test hardening lulus | ❌ Belum |
| Alamat Sepolia Pool diverifikasi eksplisit dalam konfigurasi deployment | ❌ Belum |
| Identitas RC.0 yang tepat tetap jujur ditandai belum diverifikasi | ❌ Tetap belum |
| Manifest deployment dan prosedur rollback/redeploy disiapkan | ❌ Belum |
| Shield tetap dinonaktifkan | ✓ |
| Tidak ada kunci produksi yang digunakan | ✓ |

```
HELPER_SEPOLIA_DEPLOYMENT_RECOMMENDATION=CONDITIONAL
HELPER_DEPLOYMENT_CONDITIONS_SATISFIED=false
HELPER_DEPLOYMENT_BLOCKED=true
```

`BLOCKED=true` berarti diblokir sementara hingga kondisi controlled-test terpenuhi — BUKAN penolakan arsitektur.

---

## Pool Context

- Helper hanya menerima alamat Pool yang dipasang pada konstruksi.
- ABI surface Sepolia Pool dan perilaku `compile_actions` telah diverifikasi sebelumnya.
- Identitas kontrak PRIVACY-0.14.3-RC.0 yang tepat tetap belum diverifikasi.
- Sepolia Pool saat ini tetap diklasifikasikan sebagai legacy/pre-screening.
- Shield tetap dinonaktifkan.

---

## Fakta yang Diverifikasi

| Fakta | Status |
|---|---|
| Isolated build berhasil | ✓ |
| 20/20 focused test lulus | ✓ |
| Local class hash | `0x35d26edfba322a472f717d57654b31d9bab13c681e18ef1bd616f613d4b6665` |
| Helper lama yang dideploy | Kontrak legacy berbeda (`0x7892efb...`) |
| Helper saat ini dideploy | Tidak |
| Eksekusi runtime | Belum terjadi |

---

## Status

```
HELPER_SECURITY_REVIEW_COMPLETED=true
HELPER_SECURITY_AUDIT_COMPLETED=false
HELPER_ISOLATED_BUILD_VERIFIED=true
HELPER_ISOLATED_TEST_VERIFIED=true
HELPER_TESTS_PASSED=20
HELPER_LOCAL_CLASS_HASH_AVAILABLE=true
HELPER_CODE_CHANGE_REQUIRED=false
HELPER_TEST_HARDENING_REQUIRED=true
HELPER_DEPLOYMENT_CONDITIONS_SATISFIED=false
HELPER_DEPLOYMENT_BLOCKED=true
HELPER_SEPOLIA_DEPLOYMENT_RECOMMENDATION=CONDITIONAL
HELPER_RUNTIME_EXECUTION_VERIFIED=false
PRIVATE_INVOKE_HELPER_EXECUTION_VERIFIED=false
FULL_CAIRO_BUILD_VERIFIED=false
LOCAL_PROVER_VERIFIED=false
REAL_PROOF_VERIFIED=false
BROADCAST_VERIFIED=false
SHIELD_ENABLED=false
FASE_5_STARTED=false
```

---

## File yang Dibaca

| File | Tujuan |
|---|---|
| `contracts/messaging/veil_channel_helper.cairo` | Sumber helper utama |
| `contracts/messaging/messaging_types.cairo` | VeilMessageRecord struct |
| `contracts/messaging/messaging_events.cairo` | MessageCommitted event |
| `contracts/messaging/messaging_interfaces.cairo` | IVeilChannelHelper trait |
| `contracts/messaging/messaging_validation.cairo` | Validasi header dan duplikat |
| `contracts/messaging/timeline_payload_hash.cairo` | Algoritma commitment |
| `contracts/interfaces/privacy_pool_types.cairo` | OpenNoteDeposit struct |
| `contracts/utils/constants.cairo` | Konstanta envelope dan chunk |
| `contracts/utils/errors.cairo` | Konstanta error |
| `contracts/utils/hashing.cairo` | Fungsi hashing umum |
| `tests/test_veil_channel_helper.cairo` | 20 focused tests |
| `docs/internal/audits/PHASE4C_SMART_CONTRACT_REALITY_AUDIT.md` | Audit realitas sebelumnya |
| `docs/internal/testing/PHASE_4D_HELPER_ISOLATED_BUILD_TEST_REPORT.md` | Laporan build/test terisolasi |
