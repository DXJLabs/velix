# STRK20_INTEGRATION_PLAN.md

# Rencana Integrasi STRK20 untuk VEIL

**Status:** Fase 4 hardening selesai secara lokal; real local proof BLOCKED; Fase 5 belum dimulai  
**Bahasa:** Indonesia  
**Target awal:** Starknet Sepolia  
**Repository:** `DXJLabs/velix`  
**Branch audit:** `main`  
**Commit audit:** `4ce2d0827c6b7755be0d3646065f645cabd0e744`  
**Tanggal audit:** 2026-07-19  
**Audit detail:** [`REPOSITORY_AUDIT.md`](./REPOSITORY_AUDIT.md)

> Dokumen ini diberikan kepada Codex, Claude Code, Cursor, atau coding agent lain setelah STRK20 Agent Skill dipasang.
>
> Dokumen ini bukan pengganti audit repository. Agent wajib memindai repository aktual, memperbarui nama file dan path berdasarkan kondisi nyata, lalu berhenti sebelum coding.

---

## 1. Tujuan

Mengintegrasikan VEIL dengan stack resmi Starknet Privacy/STRK20 berdasarkan **Idea 01 · Social & Communications** untuk private Deal Room yang mencakup:

- encrypted on-chain messaging;
- offer dan counter-offer;
- accept dan reject;
- private payment memo;
- escrow coordination;
- settlement evidence;
- private transfer melalui stack resmi Starknet Privacy.

VEIL bukan CAREL, ChainEstate, Arbitrum, iExec, Agentic DeFi, Noir, Garaga, messenger umum, atau wallet umum.

Flow inti VEIL adalah:

```text
Private message
Private transfer + encrypted payment memo
Private escrow negotiation
```

VEIL bukan flow Shield → Unshield dan bukan aplikasi wallet withdrawal.

---

## 2. Cara Menggunakan

### Pasang Agent Skill

```bash
npx skills add starkience/strk20-agent-skills
```

### Instruksi awal kepada agent

```text
Baca STRK20_INTEGRATION_PLAN.md.

Gunakan STRK20 Agent Skill untuk memindai repository aktual.
Lakukan hanya audit dan perencanaan.
Buat REPOSITORY_AUDIT.md.
Perbarui STRK20_INTEGRATION_PLAN.md menggunakan path file nyata.
Jangan ubah source code.
Jangan instal dependency.
Jangan commit, push, atau deploy.
Jangan mengedit Cairo contracts.
Berhenti dan tunggu persetujuan saya.
```

---

## 3. Sumber Teknis

Urutan sumber:

1. dokumentasi resmi Starknet Privacy;
2. source resmi `starkware-libs/starknet-privacy`;
3. STRK20 by Example;
4. STRK20 Agent Skill;
5. repository VEIL aktual;
6. hasil test lokal dan Sepolia;
7. dokumentasi internal VEIL.

Sumber agent-readable:

```text
https://strk20-by-example.org/llms.txt
https://strk20-by-example.org/llms-full.txt
```

Source:

```text
https://github.com/starkience/strk20-agent-skills
https://github.com/starkware-libs/starknet-privacy
https://docs.starknet.io/build/starknet-privacy/overview
```

---

## 4. Versi yang Dikunci

| Komponen | Versi/aturan |
|---|---|
| Privacy SDK | `@starkware-libs/starknet-privacy-sdk` `0.14.3-rc.2` |
| Tag SDK | `PRIVACY-0.14.3-RC.2` |
| Pool compatibility | `PRIVACY-0.14.3-RC.0` |
| Proof transaction | Invoke Transaction V3 |
| Submission authorization | `OutsideExecutionVersion.V2` |
| Target awal | Starknet Sepolia |
| Mainnet | Memerlukan persetujuan eksplisit |

Agent tidak boleh mengganti versi tanpa compatibility review dan persetujuan.

---

## 5. Kondisi VEIL yang Diketahui

- runtime Node yang dipakai untuk validasi adalah `v24.10.0`;
- official Privacy SDK sudah dipin dan divendor melalui `package.json`, `packages/veil-sdk/package.json`, dan `vendor/starkware-libs-starknet-privacy-sdk-0.14.3-rc.2.tgz`;
- adapter official SDK ada di `packages/veil-sdk/src/privacy/official-sdk.ts`, tetapi bootstrap produksi memaksanya tetap disabled di `src/app/runtime-config.js`;
- self-hosted transaction prover pernah bekerja;
- real proof pernah berhasil;
- Private Invoke V3 pernah berhasil;
- current Sepolia Privacy Pool masih legacy/pre-screening;
- Shield deposit harus tetap dinonaktifkan;
- pure shielded chat masih `BLOCKED / UNVERIFIED`;
- real two-party Sepolia E2E belum selesai;
- direct encrypted helper adalah legacy/fallback;
- direct helper bukan arsitektur produksi final;
- frontend tidak boleh memberi label `Shielded` pada jalur legacy;
- symmetric fallback key demo bukan privasi produksi.
- test Node 24 pada commit audit: SDK 103/103, app 16/16, API 11/11 lulus;
- full Cairo suite gagal compile karena `src/lib.cairo` merujuk `contracts/offers/offer_payload.cairo` yang tidak ada dan `contracts/offers/offer_validation.cairo` malformed;
- production build dan real two-party Sepolia E2E belum menjadi bukti Fase 0 ini.

### 5.1 Jalur Integrasi yang Direkomendasikan

VEIL adalah dapp pengguna dengan Privy/StarkZap, injected-wallet fallback, dan contract milik tim. Jalur target adalah kombinasi:

1. **Privacy Wallet API melalui starknet.js** untuk akun milik pengguna dan wallet yang benar-benar mendukung privacy;
2. **VEIL helper/anonymizer contracts + Wallet API** untuk satu application invoke yang diaudit dan di-allowlist;
3. **Privacy SDK Direct** hanya untuk akun yang key/viewing key-nya memang dimiliki konteks integrator, bukan untuk mengambil viewing key wallet pengguna;
4. **Direct encrypted helper** dipertahankan sebagai fallback legacy sampai canonical two-party E2E dan rollback disetujui.

Gap compatibility utama: root memakai `starknet@9.4.2` tanpa get-starknet v6, sementara jalur Wallet API resmi saat ini harus dievaluasi terhadap `WalletAccountV6`/starknet.js `>=10.4.0`. Tidak boleh upgrade dependency sebelum Fase 1 disetujui.

### 5.2 Batas Visible vs Private

| Elemen | Status |
|---|---|
| Identitas pengirim | Disembunyikan melalui jalur Pool; Pool menjadi `msg.sender` pada helper |
| Identitas penerima | Tidak ditulis terang; ditemukan melalui kemampuan penerima |
| Isi pesan | Terenkripsi dengan channel key |
| Payment memo | Terenkripsi dan dikaitkan dengan private transfer |
| Syarat negosiasi | Terenkripsi |
| Viewing key | Hanya pada wallet/perangkat pemilik |
| Fakta transaksi Pool terjadi | Dapat diamati |
| Block timestamp | Terlihat |
| Transaction hash | Terlihat |
| Ciphertext dan ukuran payload | Dapat terlihat |
| Commitment dan metadata protocol minimum | Dapat terlihat |
| Fee/gas | Dapat terlihat |

Dapp tidak boleh menerima viewing key wallet pengguna. Self-hosted proving tidak menghilangkan kewajiban screening deposit.

VEIL dirancang untuk meminimalkan dan menahan analisis metadata hubungan komunikasi, tetapi beberapa metadata blockchain dan protokol tetap dapat diamati.

## Batas Scope Wallet dan Transfer

VEIL menggunakan Privacy Pool sebagai fondasi untuk private messaging dan private transfer dengan encrypted payment memo.

Scope VEIL mencakup:

- membaca status private capability;
- mengirim private transfer;
- melampirkan encrypted payment memo;
- menampilkan transaction receipt dan settlement evidence;
- menghubungkan private transfer dengan Deal Room.

Scope VEIL tidak mencakup:

- Unshield;
- withdrawal private balance ke public wallet;
- halaman atau tombol Unshield;
- SDK Unshield;
- pengujian Unshield;
- dokumentasi penggunaan Unshield.

VEIL bukan wallet umum atau aplikasi pengelolaan keluar-masuk Privacy Pool. Pada fase implementasi yang disetujui, helper withdrawal/Unshield milik VEIL harus dihapus atau tidak diekspor dari product surface beserta test dan dokumentasinya; package official yang divendor tidak boleh dimodifikasi.

Fondasi SDK minimum untuk Idea 01 adalah:

```ts
sendMessage(...)
discoverMessages(...)
```

Fungsi tingkat Deal Room dibangun di atas fondasi tersebut:

```ts
sendPaymentWithMemo(...)
createPrivateOffer(...)
counterPrivateOffer(...)
acceptPrivateOffer(...)
discoverDealEvents(...)
```

Semua derivasi channel key harus kompatibel dengan mekanisme ECDH Privacy Pool yang dipin. Indexer hanya menemukan ciphertext kandidat dan metadata minimum; SDK penerima mencoba dekripsi secara lokal.

---

## 6. Batas Agent Skill

Agent Skill boleh:

- memindai repository;
- menemukan versi `starknet.js`, wallet connector, Cairo contract, backend, SDK, dan prover;
- menemukan titik integrasi;
- memilih jalur integrasi;
- membuat rencana bertahap;
- membantu implementasi setelah disetujui;
- menjalankan pemeriksaan otomatis.

Agent Skill tidak boleh:

- membuat Cairo contract;
- mengedit Cairo contract;
- menyentuh private key, viewing key, seed phrase, atau secret;
- menyimpan key material ke file;
- deploy mainnet tanpa persetujuan;
- menyatakan privasi selesai hanya karena build berhasil.

Contract yang tetap menjadi tanggung jawab tim VEIL:

- `VeilChannelHelper`;
- `VeilOffer`;
- `VeilClaimEscrow`;
- `VeilDealEscrow`;
- `VeilSettlementHelper`;
- `VeilEncryptionKeyRegistry`.

Agent boleh membaca dan mengaudit contract, tetapi hanya membuat rekomendasi jika perubahan Cairo dibutuhkan.

---

## 7. Data yang Harus Privat

Target production:

- message;
- attachment metadata sensitif;
- offer;
- counter-offer;
- accept;
- reject;
- offer terms;
- payment memo;
- escrow coordination;
- claim/dispute coordination;
- isi kesepakatan;
- konteks settlement.

Agent wajib menjelaskan:

1. data sebelum enkripsi;
2. data yang disembunyikan Privacy Pool;
3. data yang tetap terlihat;
4. data on-chain;
5. data indexer;
6. data yang hanya tersedia di perangkat pengguna.

---

## 8. Data yang Tidak Boleh Bocor

Dilarang masuk source, commit, log, database plaintext, analytics, atau error report:

- private key;
- seed phrase;
- viewing key;
- shared secret;
- derived encryption key;
- session key;
- plaintext message;
- plaintext offer;
- plaintext payment memo;
- plaintext escrow terms;
- decrypted attachment.

Gunakan placeholder:

```env
STARKNET_RPC_URL=
PRIVACY_PROVER_URL=
PRIVACY_POOL_ADDRESS=
VEIL_CHANNEL_HELPER_ADDRESS=
VEIL_OFFER_ADDRESS=
VEIL_ESCROW_ADDRESS=
```

---

## 9. Batas Privasi

Agent harus membuat bagian `PRIVACY_BOUNDARIES` yang menjelaskan metadata yang mungkin tetap terlihat:

- transaction hash;
- block number;
- timestamp;
- contract interaction;
- encrypted note;
- nullifier;
- commitment;
- event index;
- ciphertext size;
- gas/fee;
- timing pattern;
- metadata protocol.

Jangan gunakan klaim:

- `100% anonymous`;
- `tidak ada metadata`;
- `untraceable`;
- `fully private`;

tanpa bukti teknis dan sumber resmi.

---

## 10. Audit Repository Wajib

**Status Fase 0:** selesai untuk commit audit. Detail temuan, path, fungsi/class, risiko, hasil test, dan verdict ada di [`REPOSITORY_AUDIT.md`](./REPOSITORY_AUDIT.md).

### 10.1 Peta Path Aktual

| Area | Path aktual / titik integrasi |
|---|---|
| Entry/bootstrap | `index.html`, `src/app-runtime.js`, `src/app/bootstrap.js` (`bootstrapVeilApp`) |
| Routing/screens | `src/app/router.js`, `src/ui/`, `src/features/` |
| Runtime/capability gate | `src/app/runtime-config.js`, `src/domain/feature-status.js`, `src/domain/privacy-capabilities.js` |
| Wallet connection | `src/services/wallet/wallet-service.js`, `injected-wallet.js`, `privy-bridge.js`, `privy-wallet-api.js`, `starkzap-adapter.js` |
| Transaction submission | `src/features/transactions/transaction-submit-flow.js`, feature controllers under `src/features/` |
| SDK composition | `src/services/veil-client-service.js`, `packages/veil-sdk/src/client.ts` |
| Wallet API | `packages/veil-sdk/src/privacy/wallet-api.ts` |
| Official SDK adapter | `packages/veil-sdk/src/privacy/official-sdk.ts`, `financial-flows.ts`, `proving.ts`, `profile-store.ts` |
| Legacy transport | `packages/veil-sdk/src/direct_helper_transport.ts` |
| Canonical transport boundary | `packages/veil-sdk/src/privacy-pool/starknet-transport.ts` |
| Application crypto/tag | `packages/veil-sdk/src/privacy/application-encryption.ts`, `packages/veil-sdk/src/conversation-tag.ts`, `packages/veil-sdk/src/direct-message-encryption.ts` |
| Indexer/API | `api/indexer/messages.js`, `api/indexer/_lib/`, `api/_lib/security.js`, `api/_lib/privy.js` |
| Prover research | `tools/privacy-set-viewing-key-poc/` |
| Network manifest | `config/veil-sepolia.js`, `.env.example` |
| Cairo | `contracts/`, `src/lib.cairo`, `tests/*.cairo`, `Scarb.toml`, `snfoundry.toml` |
| Operations | `vercel.json`; tidak ditemukan tracked `.github/workflows/` |

### 10.2 Reality Check Fase 0

- `package.json` mengunci Node `>=24`, npm `11.6.2`, root `starknet@9.4.2`, StarkZap `3.0.0`, dan official SDK RC.2 dari artifact lokal.
- `src/app/runtime-config.js` mengunci Sepolia, menolak Pool screening palsu, menonaktifkan official SDK runtime, paymaster, offer/escrow/settlement legacy, dan menjadikan Direct encrypted sebagai default.
- `api/indexer/messages.js` adalah bounded stateless RPC bridge dengan opaque conversation tag, signed cursor, confirmation depth, dan reorg rollback; bukan durable production indexer.
- `api/paymaster.js` dan `api/wallet/sign.js` fail-disabled.
- Cairo source tidak build pada commit audit; Agent Skill tidak boleh memperbaikinya.
- Tidak ada bukti retained real two-party/two-device Sepolia canonical flow.

Sebelum coding, audit:

### Root

- package manager;
- workspace;
- build/test/lint commands;
- environment;
- CI;
- deployment;
- branch dan commit.

### Frontend

- entry point;
- routing;
- Home;
- Rooms;
- Deal Room;
- Wallet;
- Points;
- Settings;
- wallet connection;
- transaction submission;
- receipt handling;
- offer/payment/escrow UI;
- activity timeline;
- state management;
- encryption/decryption flow.

### SDK

- `packages/veil-sdk`;
- client;
- privacy adapter;
- direct helper transport;
- canonical privacy transport;
- payload codec;
- discovery;
- transaction builder;
- tests.

Nama di atas hanya konteks. Agent wajib memakai path aktual.

### Smart Contract

- `VeilChannelHelper`;
- `VeilOffer`;
- interface;
- event;
- state machine;
- tests;
- deployment scripts;
- address manifest.

### Backend/Indexer

- API;
- event scanner;
- RPC;
- cursor;
- database;
- discovery;
- attachment;
- invitation;
- prover gateway;
- health;
- logging;
- retry;
- reorg handling.

### Wallet

Identifikasi:

- `starknet.js`;
- `get-starknet`;
- Argent;
- Braavos;
- Privy;
- Ready Account;
- StarkZap;
- AVNU Paymaster;
- account version;
- transaction version.

### Prover

Identifikasi:

- Docker image;
- tag;
- JSON-RPC;
- request/response;
- timeout;
- retry;
- log;
- health check.

---

## 11. Format `REPOSITORY_AUDIT.md`

```md
# Repository Audit

## Ringkasan Eksekutif
## Branch dan Commit
## Struktur Folder Aktual
## Build dan Test Commands
## Frontend Reality
## Wallet Reality
## SDK Reality
## Smart Contract Reality
## Backend dan Indexer Reality
## Prover Reality
## Privacy Pool Reality
## Legacy Path
## Canonical STRK20 Path
## Gap terhadap Target
## Risiko
## File yang Perlu Diubah
## File yang Tidak Boleh Diubah Otomatis
## Pertanyaan Terbuka
## Verdict
```

Setiap temuan harus menyebut path file, fungsi/class, bukti, status, risiko, dan rekomendasi. Dilarang menebak path.

---

## 12. Wawancara Setelah Audit

Tanyakan hanya hal yang belum dapat dipastikan:

1. fitur private untuk MVP;
2. apakah target hanya Sepolia;
3. wallet wajib;
4. apakah private payment masuk MVP;
5. apakah escrow execution atau hanya coordination;
6. apakah backend boleh menyimpan ciphertext;
7. apakah attachment masuk fase awal;
8. apakah legacy path tetap dipertahankan;
9. syarat penghapusan legacy path;
10. alamat pool Sepolia yang sudah dikonfirmasi.

---

## 13. Evaluasi Jalur Integrasi

Agent harus mengevaluasi dan menjelaskan pilihan:

### Wallet API melalui starknet.js

Untuk pengguna dengan wallet biasa dan flow wallet-native.

### Privacy SDK Direct

Hanya jika aplikasi/backend secara sah memegang key miliknya sendiri. Jangan memindahkan key pengguna ke backend.

### Helper/Anonymizer Contract + Wallet API

Untuk private invoke ke application contract. Contract ditulis dan diaudit tim, bukan dibuat atau diedit Agent Skill.

### Private Sub-account

Status awal:

```text
TRACKED / HARUS DIVERIFIKASI DENGAN DUKUNGAN RESMI
```

---

## 14. Arsitektur Target

```text
Pengguna A
   |
   | Menulis pesan atau payment memo
   v
VEIL SDK
   |
   +-- Derivasi channel key
   +-- Enkripsi payload
   +-- Bangun private transfer bila ada pembayaran
   +-- Bangun satu InvokeExternal yang diizinkan
   |
   v
Privacy Pool
   |
   | Pool menjadi msg.sender
   v
VeilChannelHelper
   |
   +-- Menyimpan ciphertext
   +-- Menyimpan commitment/tag minimum
   +-- Memancarkan event
   |
   v
Discovery Indexer
   |
   | Mengembalikan ciphertext kandidat dan metadata minimum
   v
Perangkat Pengguna B
   |
   +-- SDK mendekripsi secara lokal
```

Privacy Pool contract tidak dimodifikasi. `VeilChannelHelper` tetap merupakan kode milik tim VEIL yang harus ditulis, ditinjau, diuji, diaudit, dan dideploy oleh tim; Agent Skill hanya boleh memberi rekomendasi atau change request.

---

## 15. Legacy vs Canonical

Agent harus membuat tabel berdasarkan audit:

| Fungsi | Legacy direct helper | Canonical STRK20 | Status |
|---|---|---|---|
| Message | `DirectHelperTransport` submits client-encrypted ciphertext directly | `StarknetPrivacyPoolTransport` + one allowlisted InvokeExternal is prepared | legacy locally verified; canonical live unverified |
| Offer | deployed legacy address is runtime-disabled | hardened source exists but current Cairo build is broken and deployment is unverified | blocked |
| Payment memo | direct encrypted memo is not a private payment | `financial-flows.ts::payWithEncryptedMemo` composes transfer + invoke locally | canonical E2E blocked |
| Escrow coordination | removed public runtime | private Claim and custody-settlement sources exist; no verified live deployment/E2E | blocked |
| Discovery | bounded application indexer by opaque tag | official discovery adapter/private registry foundation exists | partial; durable indexer missing |
| Encryption | browser Direct ECDH fallback | wallet-owned privacy state plus domain-separated application encryption | local only/live unverified |
| Proof | no Pool proof on direct helper path | official SDK/Wallet API proof boundary is prepared | no canonical live evidence |
| Two-party E2E | isolated local A/B crypto tests | no retained real two-device Sepolia run | unverified |

Aturan:

- jalur legacy tidak boleh diberi label `Shielded`;
- status harus membedakan prepared, proving, submitted, accepted, reverted, dan failed;
- Shield deposit tetap disabled pada current legacy Sepolia pool.

---

## 16. Fase Implementasi

### Fase 0 — Audit Tanpa Perubahan

**Status:** `COMPLETED` pada 2026-07-19 untuk `main@4ce2d0827c6b7755be0d3646065f645cabd0e744`.

Output:

- `REPOSITORY_AUDIT.md`;
- pembaruan dokumen ini.

Larangan:

- tidak coding;
- tidak install dependency;
- tidak commit;
- tidak push;
- tidak deploy.

Hasil validasi:

- Node `v24.10.0`;
- SDK 103/103 PASS;
- app 16/16 PASS;
- API 11/11 PASS;
- Cairo compile FAIL (lihat `REPOSITORY_AUDIT.md`);
- tidak ada source/dependency/Cairo/commit/push/deploy change.

### Fase 1 — Compatibility Matrix ✅ done 2026-07-19

**Status:** compatibility decisions locked; canonical runtime remains disabled.

Kunci:

- Privacy SDK;
- prover image;
- pool contract;
- starknet.js;
- wallet connector;
- account version;
- transaction version;
- Outside Execution;
- Cairo;
- Scarb;
- test framework.

Output:

```text
docs/internal/engineering/STRK20_COMPATIBILITY_MATRIX.md
```

Keputusan Fase 1:

- Node 24.x dan SDK `0.14.3-rc.2` tetap dikunci;
- user-owned accounts menggunakan `WalletAccountV6` melalui starknet.js;
- target migrasi wallet adalah exact `starknet@10.4.0`, get-starknet discovery/wallet-standard `6.0.2`, dan types-js `0.10.3`;
- StarkZap/Privy tetap terisolasi pada direct encrypted path sampai ada bukti privacy capability;
- current Sepolia Pool tetap `legacy-pre-screening`; canonical runtime dan Shield tetap disabled;
- Ready menjadi wallet uji utama; dokumentasi Starknet.js terbaru juga menyebut Xverse, tetapi dukungan VEIL tetap `UNVERIFIED` sampai live test;
- direct SDK hanya untuk akun yang benar-benar dikontrol tim/integrator, bukan viewing key pengguna;
- Unshield tetap di luar scope produk;
- prover pin conflict, missing prover image digest, Cairo build failure, dan missing two-party E2E dicatat sebagai blocker.

Detail dan sumber: [`docs/internal/engineering/STRK20_COMPATIBILITY_MATRIX.md`](./docs/internal/engineering/STRK20_COMPATIBILITY_MATRIX.md).

Hasil validasi Fase 1 pada Node `v24.10.0`:

- `npm run build` PASS, termasuk TypeScript typecheck dan Vite production bundle (`5797` modules transformed);
- SDK 103/103 PASS;
- app 16/16 PASS;
- API 11/11 PASS;
- `package-lock.json` disinkronkan dengan dependency `ethers@6.15.0` yang sudah lebih dahulu dideklarasikan di `package.json`; tidak ada dependency wallet/STRK20 target yang ditambahkan atau di-upgrade;
- clean `npm ci` tidak diklaim PASS karena proses reify pada repository `/mnt/c` terhenti oleh performa/locking filesystem WSL; dependency tree kemudian dipulihkan dengan install offline berbasis lockfile dan dua tarball ber-integrity cocok sebelum build/test final;
- warning build yang tersisa berasal dari annotation/module directive dependency pihak ketiga dan ukuran chunk; tidak ada build error.

Tidak ada perubahan source aplikasi atau Cairo, dan tidak ada commit, push, atau deploy pada Fase 1.

### Fase 2 — Privacy Boundary dan Payload ✅ done 2026-07-19

**Status:** privacy/data ownership, canonical payload, encryption envelope, helper commitment profile, and legacy boundary locked; canonical runtime remains disabled.

Output:

```text
docs/internal/engineering/VEIL_PRIVACY_BOUNDARIES.md
docs/internal/engineering/VEIL_PAYLOAD_SPEC.md
```

Tindakan yang dimodelkan:

- message;
- offer;
- counter-offer;
- accept;
- reject;
- payment memo;
- escrow coordination;
- settlement evidence.

Keputusan Fase 2:

- user-owned account tetap memakai wallet route; dapp tidak menerima viewing key, notes, private registry, atau proof witness pengguna;
- canonical public envelope tidak memuat application kind/domain, stable context hash, room/channel ID, event type, wallet address, participant key metadata, atau plaintext-derived preview;
- canonical helper profile mengikuti hardened one-time `message_locator` dan commitment domain `VEIL_MSG_COMMIT_V1` pada source VEIL, tetapi belum diklaim live karena Cairo/deployment belum terverifikasi;
- deployed `VEIL_TIMELINE_V1` dengan stable `conversationTag` dan public `event_type` dipertahankan hanya sebagai isolated Direct encrypted legacy profile;
- payment + encrypted memo harus satu private action batch dengan tepat satu `InvokeExternal` ke `VeilChannelHelper`;
- offer/escrow payload pada helper adalah coordination only; executable contract state transition tetap separate allowlisted transaction;
- serialized ciphertext envelope dibatasi maksimal 64 felt chunks / 1984 UTF-8 bytes sesuai hardened helper source;
- canonical one-time locator discovery belum diinventarisasi sebagai solusi; derivation/distribution tetap blocker Fase 6 sampai ada desain resmi yang kompatibel dan E2E;
- tidak ada perubahan source aplikasi atau Cairo pada fase dokumentasi ini.

Detail:

- [`docs/internal/engineering/VEIL_PRIVACY_BOUNDARIES.md`](./docs/internal/engineering/VEIL_PRIVACY_BOUNDARIES.md)
- [`docs/internal/engineering/VEIL_PAYLOAD_SPEC.md`](./docs/internal/engineering/VEIL_PAYLOAD_SPEC.md)

Hasil validasi Fase 2 pada Node `v24.10.0`:

- pemeriksaan link lokal dan code fence dokumen PASS;
- `npm run build` PASS;
- SDK 103/103 PASS;
- app 16/16 PASS;
- API 11/11 PASS;
- tidak ada dependency, source aplikasi, atau Cairo yang diubah pada Fase 2;
- tidak ada commit, push, atau deploy.

### Fase 3 — Official Privacy Transport ✅ selesai 2026-07-19

Tujuan:

- official Privacy SDK dalam satu adapter;
- legacy dan canonical terpisah;
- Invoke V3;
- OutsideExecutionVersion.V2;
- error mapping;
- test headless;
- tidak ada secret pada log.

Hasil Fase 3:

- official Privacy SDK tetap terisolasi pada adapter dan dikunci ke `0.14.3-rc.2`;
- capability gate fail-closed memisahkan status installed, compatible, wallet capable, Pool compatible, prepared, dan live verified;
- user-owned accounts tetap menggunakan Wallet API tanpa menyerahkan viewing key, private key, note registry, nullifier secret, atau proof witness kepada VEIL;
- direct SDK dibatasi untuk account dan viewing key milik integrator;
- canonical helper profile membatasi tepat satu invoke ke target/selector yang di-allowlist dan memvalidasi payload V1/commitment/ukuran secara deterministik;
- canonical failure tidak memanggil legacy secara diam-diam;
- Direct encrypted tetap terpisah dengan status `DIRECT_ENCRYPTED_LEGACY`;
- runtime production tetap `CANONICAL_UNAVAILABLE`, `prepared: false`, dan `liveVerified: false`;
- Unshield tetap di luar product surface;
- `npm run build`, 114 SDK test, 16 app test, dan 11 API test PASS dengan Node `v24.10.0`;
- tidak ada perubahan Cairo, dependency, deployment, commit, push, atau live transaction;
- laporan lengkap: [`docs/internal/testing/PHASE_3_OFFICIAL_PRIVACY_TRANSPORT_REPORT.md`](./docs/internal/testing/PHASE_3_OFFICIAL_PRIVACY_TRANSPORT_REPORT.md).

Gate: berhenti dan tunggu persetujuan eksplisit sebelum Fase 4. `prepared` bukan `verified`, dan Fase 3 tidak mengklaim canonical two-party messaging live.

### Fase 4 — Transaction Prover Integration and Hardening ⚠️ BLOCKED pada real local proof

Tujuan:

- validasi RPC dan image tag;
- health check;
- timeout;
- retry terbatas;
- sanitized logging;
- pengukuran proof duration;
- real proof yang dapat diulang.

Hasil implementasi 2026-07-19:

- official `starknet_transaction_prover` dikunci ke tag
  `PRIVACY-0.14.3-RC.2`, source commit
  `e6b6fd2e9932909107833579e5b6efd6c75fa0af`, dan OCI digest
  `sha256:a2f71d7139069fa566c4f44bdd66b79cac992c0cbc20ddf0af3a3558c6cabd64`;
- OpenRPC dikunci ke `0.10.3-rc.2` pada
  `starknet-specs@82376e69dee268c5ddce8333499b7a7dce57095d`;
- boundary TypeScript memisahkan health/spec, request construction, prover
  submission, response/proof-facts validation, dan non-broadcast preparation;
- endpoint, redirect, ukuran, JSON shape/depth, timeout, retry transient,
  cancellation, logging, custody, chain, SDK, Pool, Invoke V3, dan Outside
  Execution V2 divalidasi fail-closed;
- proof intent dibatasi ke direct SDK account milik integrator dan tepat satu
  allowlisted `InvokeExternal` dengan calldata yang identik dengan commitment
  payload VEIL; Deposit/Shield dan Withdraw/Unshield ditolak;
- mock-RPC focused validation lulus, tetapi ini bukan real local proof evidence;
- real digest-pinned proof tidak dapat dijalankan karena Docker tidak tersedia,
  port 3000 kosong, dan host 2 vCPU / sekitar 15 GiB berada di bawah rekomendasi
  upstream 48 vCPU / 96 GiB;
- status akhir tetap `CANONICAL_UNAVAILABLE`, `canonicalPrepared: false`,
  `liveVerified: false`, Shield disabled, dan Unshield unavailable;
- runbook:
  [`docs/internal/testing/PHASE_4_LOCAL_PROVER_RUNBOOK.md`](./docs/internal/testing/PHASE_4_LOCAL_PROVER_RUNBOOK.md);
- laporan:
  [`docs/internal/testing/PHASE_4_TRANSACTION_PROVER_REPORT.md`](./docs/internal/testing/PHASE_4_TRANSACTION_PROVER_REPORT.md).

Gate: jangan mulai Fase 5. Fase 4 belum PASS sampai real digest-pinned proof
melewati boundary dan menghasilkan evidence tersanitasi `LOCAL_PROVER_VERIFIED`.

### Fase 4B — Call-Mock Proving Pipeline ✅ done 2026-07-20

Tujuan:

- verifikasi pipeline proving menggunakan `CallMockProofProvider` resmi SDK;
- konfirmasi struktur Invoke V3 dan server actions ter-decode;
- validasi replay-protection WriteOnce dan Invoke ke alamat helper;
- tanpa broadcast, tanpa apply_actions, tanpa prover lokal.

Hasil verifikasi 2026-07-20:

- test: `packages/veil-sdk/tests/phase4b-mock-proving.test.mjs`;
- hasil: **4 passed, 0 failed, 0 skipped**;
- Privacy Pool: `0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5`;
- Pool class hash: `0x30b8c540cf04d8ef0f4db2a9098d9cc0e35e83af1cb3325f5a4f40144b4b30b`;
- Helper target: `0x052390845931a0c8d4735246d853a1a514c3cbf88cb1714937284814c5e57b23`;
- Invoke Transaction V3, calldata length: 17, signature length: 2;
- server actions ter-decode: WriteOnce, WriteOnce, EmitViewingKeySet, Invoke;
- tepat satu Invoke menargetkan helper lama yang dideploy;
- tidak ada Deposit, Withdraw, Unshield, TransferFrom, TransferTo, Offer, atau Escrow;
- laporan: [`docs/internal/PHASE4B_CALL_MOCK_PROVING_REPORT.md`](./docs/internal/PHASE4B_CALL_MOCK_PROVING_REPORT.md);
- audit realitas: [`docs/internal/audits/PHASE4C_SMART_CONTRACT_REALITY_AUDIT.md`](./docs/internal/audits/PHASE4C_SMART_CONTRACT_REALITY_AUDIT.md).

Klarifikasi penting:

- Helper yang menjadi target Invoke adalah versi lama yang sudah dideploy (`0x05239084...`, class hash `0x7892efb...`), BUKAN sumber lokal saat ini (`contracts/messaging/veil_channel_helper.cairo`).
- Helper lama menggunakan `conversation_tag`/`event_index` dan emit `TimelineCommitmentStored`. Sumber lokal saat ini menggunakan `message_locator`/`payload_commitment` dan emit `MessageCommitted`. Keduanya adalah kontrak berbeda.
- `HELPER_SOURCE_DEPLOYMENT_MATCH_VERIFIED=false`.
- `CallMockProofProvider` memverifikasi pipeline SDK → `Pool::compile_actions` → decode server actions. Tidak memverifikasi eksekusi helper, storage writes, penerimaan payload, atau kesamaan dengan sumber lokal.

Status:

```
LEGACY_HELPER_ADDRESS_USED_FOR_CALL_MOCK=true
CALL_MOCK_COMPILE_ACTIONS_VERIFIED=true
HELPER_SOURCE_DEPLOYMENT_MATCH_VERIFIED=false
HELPER_LOCAL_CLASS_HASH_UNAVAILABLE=true
HELPER_SOURCE_REVIEW_COMPLETED=true
HELPER_SECURITY_AUDIT_COMPLETED=false
HELPER_ISOLATED_BUILD_VERIFIED=false
HELPER_RUNTIME_EXECUTION_VERIFIED=false
PRIVATE_INVOKE_HELPER_EXECUTION_VERIFIED=false
HELPER_STORAGE_SPAM_RISK_REVIEW_REQUIRED=true
SMART_CONTRACT_REALITY_AUDIT_COMPLETED=true
SMART_CONTRACT_SECURITY_AUDIT_COMPLETED=false
FULL_CAIRO_BUILD_VERIFIED=false
POOL_ABI_SURFACE_VERIFIED=true
POOL_EXACT_RC0_IDENTITY_VERIFIED=false
STATIC_INVOKE_V3_VERIFIED=true
CALL_MOCK_SIGNATURE_VERIFIED=false
CALL_MOCK_PROOF_VERIFIED=false
REAL_PROVER_DEFERRED_INFRASTRUCTURE=true
LOCAL_PROVER_VERIFIED=false
REAL_PROOF_VERIFIED=false
BROADCAST_VERIFIED=false
SHIELD_ENABLED=false
FASE_5_STARTED=false
```

`CallMockProofProvider` tidak menghasilkan proof STARK/ZK sebenarnya.
Komponen ini memanggil `Pool::compile_actions` melalui Sepolia RPC dan membangun
`proofFacts` serta output pesan menggunakan implementasi test resmi SDK.
Tahap prover asli ditangguhkan karena komputasi VPS/cloud yang sesuai belum tersedia.

**Deferred Infrastructure Gate** — persyaratan sebelum proving asli dilanjutkan:

- VPS atau cloud compute yang sesuai;
- Docker tersedia;
- image transaction prover resmi yang dipin berdasarkan digest;
- CPU dan RAM yang mencukupi;
- tidak ada wallet secret produksi;
- akun/state testing ephemeral yang dimiliki integrator.

**Urutan implementasi yang dikoreksi:**

1. ✅ Koreksi dokumentasi Fase 4B.
2. Kunci spesifikasi VeilChannelHelper kanonikal (message_locator, payload_commitment, event).
3. Buat target build dan test terisolasi untuk helper saat ini.
4. Review validasi payload, storage, event, authorization, dan batas spam.
5. Produksi class hash lokal yang dapat direproduksi.
6. Deploy helper yang ditulis ulang hanya setelah persetujuan eksplisit.
7. Ulangi CallMockProofProvider terhadap alamat helper baru.
8. Real proving tetap ditangguhkan untuk infrastruktur VPS/cloud.
9. Perbaiki Offer setelah messaging kanonikal stabil.
10. Audit/redesign VeilDealEscrow secara terpisah.

### Fase 4D — VeilChannelHelper Isolated Build dan Test ✅ done 2026-07-20

Tujuan:

- verifikasi helper saat ini dapat dikompilasi secara terisolasi;
- ganti test lama yang menggunakan API legacy dengan test terfokus untuk sumber saat ini;
- validasi seluruh entrypoint, validasi envelope, proteksi duplikat, dan getter;
- tanpa mengubah sumber kontrak, tanpa Offer, tanpa Escrow.

Hasil verifikasi 2026-07-20:

- test: `tests/test_veil_channel_helper.cairo` — commit `249cb47`;
- isolated build: **SUCCEEDED** — `/tmp/veil-channel-helper-isolated`;
- isolated test: **20 passed, 0 failed, 0 skipped** — `/tmp/veil-channel-helper-isolated-test`;
- Sierra artifact dan CASM artifact dihasilkan;
- local class hash: `0x35d26edfba322a472f717d57654b31d9bab13c681e18ef1bd616f613d4b6665`;
- helper lama yang dideploy: class hash `0x7892efb...` — berbeda, tetap versi legacy;
- laporan: [`docs/internal/testing/PHASE_4D_HELPER_ISOLATED_BUILD_TEST_REPORT.md`](./docs/internal/testing/PHASE_4D_HELPER_ISOLATED_BUILD_TEST_REPORT.md).

### Fase 4E — Tinjauan Keamanan VeilChannelHelper ✅ done 2026-07-20

Tujuan:

- tinjauan keamanan sumber level kode untuk VeilChannelHelper dan modul pendukungnya;
- verifikasi batas otorisasi, validasi payload, preimage commitment, proteksi duplikat;
- analisis risiko: replay, locator griefing, spam, metadata leakage, storage growth;
- tanpa mengubah Cairo, tanpa test, tanpa SDK.

Hasil tinjauan 2026-07-20:

- tidak ada kerentanan kritis ditemukan dalam sumber saat ini;
- helper hanya mengautentikasi Pool yang dipasang pada konstruksi;
- locator dan commitment uniqueness adalah proteksi duplikat, bukan replay protection lengkap;
- pertumbuhan storage permanen — tidak ada mekanisme pruning;
- metadata (locator, commitment, chunk count, timing) tetap terlihat on-chain;
- 20 test lulus; test hardening diperlukan sebelum deployment;
- deployment direkomendasikan BERSYARAT — terblokir sementara hingga syarat controlled-test terpenuhi;
- laporan: [`docs/internal/audits/PHASE4E_HELPER_SECURITY_HARDENING_REVIEW.md`](./docs/internal/audits/PHASE4E_HELPER_SECURITY_HARDENING_REVIEW.md).

### Fase 5 — Private Invoke ke Helper

Tujuan:

- canonical private invoke;
- selector dan calldata benar;
- transaction hash;
- receipt;
- event;
- commitment/ciphertext verification.

Jika contract perlu diubah, buat:

```text
docs/internal/audits/CAIRO_CHANGE_REQUEST.md
```

Jangan mengedit Cairo otomatis.

### Fase 6 — Discovery dan Dekripsi

Tujuan:

- indexer membaca event;
- ciphertext-only storage;
- cursor;
- duplicate/restart/reorg handling;
- dekripsi lokal;
- negative decryption test.

### Fase 7 — Real Two-Party Messaging E2E

Gunakan dua akun dan dua konteks perangkat/browser terpisah.

Dilarang:

- symmetric demo key;
- hardcoded shared secret;
- fallback yang diberi label canonical.

Alur:

1. A mengirim private message.
2. Proof dibuat.
3. Invoke V3 disubmit.
4. Transaction diterima.
5. Indexer menemukan event.
6. B mendekripsi.
7. B membalas.
8. A mendekripsi balasan.
9. Pihak ketiga gagal mendekripsi.

Bukti:

- transaction hash;
- block;
- event index;
- sanitized logs;
- negative test;
- langkah reproduksi.

### Fase 8 — Offer Flow

- create offer;
- counter;
- accept/reject;
- expire;
- convert to escrow jika didukung.

### Fase 9 — Private Transfer dengan Encrypted Payment Memo

Tujuan fase ini adalah menghubungkan private transfer dengan komunikasi Deal Room sebagaimana dijelaskan dalam STRK20 Idea 01 · Social & Communications.

Alur target:

1. Pengirim memilih penerima dalam Deal Room.
2. Pengirim menentukan aset dan jumlah private transfer.
3. Pengirim menulis payment memo.
4. Payment memo dienkripsi menggunakan channel key yang sesuai.
5. SDK membangun private transfer dan encrypted message invoke.
6. Transfer dan memo dikirim dalam transaksi yang sama apabila jalur resmi dan compatibility yang digunakan mendukung komposisi tersebut.
7. Penerima menemukan transaksi melalui discovery.
8. Penerima mendekripsi memo pada perangkatnya.
9. Frontend menampilkan receipt dan settlement evidence.

Data yang harus tetap privat:

- identitas pengirim;
- identitas penerima;
- jumlah dan aset sesuai jaminan Privacy Pool;
- isi payment memo;
- hubungan memo dengan isi Deal Room sejauh dimungkinkan protocol.

Data yang mungkin tetap terlihat:

- fakta bahwa transaksi Pool terjadi;
- transaction hash;
- block timestamp;
- fee;
- ciphertext dan ukurannya;
- commitment dan metadata protocol minimum.

Fase ini tidak mencakup:

- Unshield;
- withdrawal ke public wallet;
- pengelolaan keluar dari Privacy Pool.

### Fase 10 — Escrow Coordination

Scope pertama fase ini adalah **private escrow negotiation**: kedua pihak merundingkan dan menyetujui syarat secara terenkripsi sebelum transfer atau pelaksanaan escrow. Escrow execution, asset deposit, release, cancel, claim, atau dispute hanya masuk jika scope terpisah disetujui dan contract milik tim telah direview, diuji, diaudit, serta dideploy.

Bedakan:

- coordination;
- execution;
- deposit;
- activation;
- approval;
- release;
- cancel;
- claim/dispute;
- settlement evidence.

### Fase 11 — Frontend

Deal Room action bar:

```text
Upload | Offer | Pay | Escrow | AI
```

Timeline card:

- message;
- offer;
- counter;
- accept;
- reject;
- payment;
- escrow funding;
- approval;
- release;
- settlement;
- proof;
- error.

### Fase 12 — Security Tests

- unauthorized decryption;
- wrong viewing key;
- wrong room;
- replay;
- duplicate event;
- malformed payload;
- oversized payload;
- wrong chain;
- wrong version;
- prover timeout;
- RPC failure;
- wallet rejection;
- revert;
- indexer restart;
- log leakage scan;
- database plaintext scan;
- secret file scan.

### Fase 13 — Dokumentasi dan Evidence

Output minimum:

```text
REPOSITORY_AUDIT.md
STRK20_INTEGRATION_PLAN.md
docs/internal/engineering/STRK20_COMPATIBILITY_MATRIX.md
docs/internal/engineering/VEIL_PRIVACY_BOUNDARIES.md
docs/internal/engineering/VEIL_PAYLOAD_SPEC.md
docs/internal/testing/TWO_PARTY_E2E_PLAN.md
docs/internal/testing/TWO_PARTY_E2E_REPORT.md
docs/internal/audits/CAIRO_CHANGE_REQUEST.md
docs/public/PRIVACY_STATUS.md
```

---

## 17. Aturan Sebelum Mengubah File

Semua komentar yang ditambahkan ke source code pada fase implementasi harus menggunakan bahasa Inggris.

Agent wajib menampilkan:

```text
Fase:
Tujuan:
File yang dibaca:
File yang dibuat:
File yang diubah:
Dependency yang ditambah:
Dependency yang dihapus:
Risiko:
Test:
Rollback:
```

Agent harus menunggu persetujuan.

Setelah selesai:

```text
Ringkasan:
File berubah:
Test:
Hasil:
Belum selesai:
Risiko baru:
Commit:
Saran fase berikut:
```

---

## 18. Aturan Git

- jangan commit sebelum test;
- jangan push tanpa persetujuan;
- jangan force push;
- jangan mengubah branch utama;
- jangan menghapus legacy sebelum canonical terbukti;
- gunakan commit kecil per fase.

Contoh:

```text
feat(privacy): add canonical STRK20 transport adapter
test(privacy): add two-party discovery negative tests
docs(privacy): add compatibility matrix
```

---

## 19. Larangan Klaim

Sebelum real two-party Sepolia E2E berhasil, jangan menulis:

- fully shielded;
- production ready;
- no metadata;
- private chat complete;
- canonical integration complete;
- audited;
- mainnet ready.

Gunakan status:

- planned;
- prepared;
- partial;
- blocked;
- unverified;
- locally verified;
- Sepolia verified;
- two-party verified;
- production reviewed.

---

## 20. Kriteria Selesai

Integrasi hanya dianggap selesai jika:

- repository aktual sudah diaudit;
- compatibility matrix dikunci;
- official Privacy SDK digunakan;
- official prover digunakan;
- Invoke V3 digunakan;
- OutsideExecutionVersion.V2 digunakan;
- legacy dan canonical terpisah;
- tidak ada symmetric demo key pada production path;
- tidak ada plaintext pada chain/indexer;
- tidak ada key material pada log/file;
- real two-party Sepolia E2E berhasil;
- negative decryption test berhasil;
- offer flow berhasil;
- private payment memo berhasil;
- escrow coordination berhasil sesuai scope;
- receipt dan evidence tersedia;
- dokumentasi diperbarui;
- security review selesai;
- mainnet disetujui secara eksplisit.

---

## 21. Instruksi Pertama yang Siap Dikirim

```text
Gunakan STRK20 Agent Skill dan baca STRK20_INTEGRATION_PLAN.md.

Lakukan hanya Fase 0:
- audit repository aktual;
- buat REPOSITORY_AUDIT.md;
- perbarui STRK20_INTEGRATION_PLAN.md dengan path file nyata;
- tandai perbedaan antara dokumen dan repository;
- jangan ubah source;
- jangan instal dependency;
- jangan commit;
- jangan push;
- jangan deploy;
- jangan edit Cairo contracts;
- berhenti dan tunggu persetujuan saya.
```

---

## 22. Keputusan yang Dikunci

- VEIL adalah private Deal Room di Starknet.
- VEIL mengikuti STRK20 Idea 01 · Social & Communications.
- Produk inti adalah encrypted messaging melalui Privacy Pool.
- Payment memo dilampirkan pada private transfer, bukan Unshield.
- Escrow pada scope pertama berarti private escrow negotiation.
- Privacy Pool contract tidak dimodifikasi.
- Helper contract tetap menjadi tanggung jawab tim VEIL.
- Backend tidak menerima viewing key wallet pengguna.
- Indexer menyajikan ciphertext kandidat dan metadata minimum.
- Dekripsi dilakukan pada perangkat penerima.
- Unshield sepenuhnya berada di luar scope VEIL.
- STRK20 Agent Skill dipakai untuk audit, rencana, dan bantuan implementasi.
- Agent Skill bukan bagian runtime.
- Agent Skill tidak boleh membuat atau mengedit Cairo contract.
- Direct helper adalah legacy.
- Official Starknet Privacy/STRK20 adalah arah produksi.
- Shield deposit tetap disabled pada current legacy Sepolia pool.
- Real two-party Sepolia E2E adalah syarat verifikasi.
- Mainnet membutuhkan persetujuan eksplisit.
- Semua klaim harus mengikuti evidence.
- Runtime build/test Node harus menggunakan Node 24.
- Semua komentar source code baru harus berbahasa Inggris.
- Fase implementasi tidak boleh dimulai sebelum audit ini ditinjau dan disetujui eksplisit.
