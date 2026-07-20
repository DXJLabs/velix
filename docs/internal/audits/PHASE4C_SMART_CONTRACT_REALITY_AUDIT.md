# Audit Realitas Smart Contract — Fase 4C

**Tanggal:** 2026-07-20
**Branch:** `phase4/privacy-prover-boundary`
**Base commit:** `bcab9583c2009098d8796e0d5facb2f462a991ed`

> Ini adalah audit realitas repository dan sumber kontrak internal.
> Ini BUKAN audit keamanan kontrak independen atau lengkap.

---

## Verdict Eksekutif

Fase 4B memverifikasi pipeline `CallMockProofProvider` dari level SDK hingga `Pool::compile_actions` dan decoding server actions. Namun, target `Invoke` adalah helper yang sudah dideploy lama (`0x05239084...`) — bukan sumber lokal yang sudah ditulis ulang.

Helper lokal saat ini (`contracts/messaging/veil_channel_helper.cairo`) menggunakan skema pengalamatan dan event yang berbeda dari yang dideploy. Tidak ada build Cairo yang berhasil, tidak ada class hash lokal yang diproduksi, dan tidak ada eksekusi runtime helper yang diverifikasi.

Offer dan Escrow tidak dapat dikompilasi karena tipe dan modul yang hilang.

---

## Git Snapshot

| Field | Value |
|---|---|
| Branch | `phase4/privacy-prover-boundary` |
| HEAD | `bcab9583c2009098d8796e0d5facb2f462a991ed` |
| Tracked changes | None |

---

## Inventaris Kontrak

| Kontrak | File | Status |
|---|---|---|
| VeilChannelHelper | `contracts/messaging/veil_channel_helper.cairo` | Sumber ada; tidak dideploy; mismatch dengan helper lama |
| VeilOffer | `contracts/offers/veil_offer.cairo` | Build-blocked; unverified; bukan produksi kanonikal |
| VeilEscrow | `contracts/escrow/veil_escrow.cairo` | Legacy; dinonaktifkan; bukan kandidat produksi |
| VeilDealEscrow | `contracts/deal_escrow/veil_deal_escrow.cairo` | Kandidat rekber tunggal; perlu redesign + audit |
| VeilClaimEscrow | `contracts/claim_escrow/veil_claim_escrow.cairo` | Eksperimental; dinonaktifkan; di luar MVP |
| VeilSettlementHelper | `contracts/settlement/veil_settlement_helper.cairo` | Sumber ada |
| VeilEncryptionKeyRegistry | `contracts/veil_encryption_key_registry.cairo` | Sumber ada |

---

## Blokir Build Cairo

| Blokir | Dampak |
|---|---|
| `contracts/offers/offer_payload.cairo` TIDAK ADA — direferensikan di `src/lib.cairo:90` | Mencegah kompilasi modul offers |
| `OfferStatus` enum TIDAK ADA di `offer_types.cairo` | VeilEscrow.create_escrow tidak dapat dikompilasi |
| `Offer` struct TIDAK ADA di `offer_types.cairo` | Escrow creation tidak memiliki tipe Offer untuk di-query |
| `IVeilOfferDispatcher` / `IVeilOfferDispatcherTrait` TIDAK ADA di `offer_interfaces.cairo` | VeilEscrow tidak dapat dispatch ke VeilOffer |

**Full Cairo build: TIDAK TERVERIFIKASI.**

---

## Review Helper Saat Ini

### Sumber: `contracts/messaging/veil_channel_helper.cairo`

**Entrypoints:**
- `constructor(privacy_pool)` — pin alamat Pool
- `privacy_invoke(calldata)` — simpan satu pesan terenkripsi, hanya dipanggil oleh Pool
- `get_privacy_pool()` — kembalikan alamat Pool
- `message_exists(message_locator)` — cek keberadaan locator
- `get_message(message_locator)` — kembalikan VeilMessageRecord
- `get_payload_chunk(message_locator, chunk_index)` — kembalikan satu chunk ciphertext
- `is_payload_committed(payload_commitment)` — cek penggunaan ulang commitment

**privacy_invoke signature:**
```cairo
fn privacy_invoke(ref self: ContractState, calldata: Span<felt252>) -> Span<OpenNoteDeposit>
```

**Calldata layout (V1):**
- `[0]` envelope_version (harus = 1)
- `[1]` message_locator (satu felt, tidak boleh nol)
- `[2]` claimed_payload_commitment (satu felt, tidak boleh nol)
- `[3]` payload_chunk_count (u64, 1–64)
- `[4..]` ciphertext_chunks

**Validasi:**
1. Panjang calldata >= 4
2. envelope_version == 1
3. message_locator != 0
4. payload_commitment != 0
5. 0 < chunk_count <= 64
6. Panjang calldata tepat = 4 + chunk_count
7. Komputasi ulang commitment dan verifikasi kecocokan
8. Locator belum pernah disimpan
9. Commitment belum pernah digunakan

**Storage writes:**
- `messages[message_locator]` → VeilMessageRecord
- `payload_chunks[(message_locator, chunk_index)]` → setiap chunk ciphertext
- `stored_message_locators[message_locator]` → `true`
- `committed_payloads[payload_commitment]` → `true`

**Event:**
- `MessageCommitted { message_locator, payload_commitment }`

**Caller authorization:**
- Hanya `privacy_pool` yang dikonfigurasi saat konstruksi yang boleh memanggil `privacy_invoke`.
- Diverifikasi melalui `get_caller_address() == self.privacy_pool.read()`.

**Payer gas dan perilaku submission tidak diverifikasi oleh audit ini.**

**Batas struktural:**
- Maksimum 64 chunk per panggilan — penulisan storage terbatas secara struktural.
- Pertumbuhan storage bersifat permanen.
- Tidak ada otorisasi partisipan di tingkat helper.
- Kebocoran kebijakan penerimaan, kuota, ekonomi spam, dan kontrol kebisingan indexer belum terselesaikan.
- Keunikan locator dan commitment mencegah duplikasi tetapi tidak mencegah spam pesan unik.

**Isolasi dependency:** Berdasarkan inspeksi sumber, VeilChannelHelper hanya bergantung pada modul `messaging_*`, `privacy_pool_types`, dan `utils/*` — tidak bergantung pada Offer atau Escrow. Namun, tidak ada build Cairo terisolasi yang berhasil dilakukan dan tidak ada class hash lokal yang diproduksi.

---

## Perbandingan Helper Lama yang Dideploy vs Sumber Lokal Saat Ini

**Helper lama yang dideploy:**
- Alamat: `0x052390845931a0c8d4735246d853a1a514c3cbf88cb1714937284814c5e57b23`
- Class hash: `0x7892efb93c77260c410d2e3e29cf6a28421d8e1ab0c688ffaf64304e7e47d97`
- Memiliki `invoke()` dan `privacy_invoke()`
- Menggunakan `conversation_tag` dan `event_index`
- Emit `TimelineCommitmentStored(conversation_tag, event_id, payload_hash)`
- `get_payload_chunk(conversation_tag, event_index, chunk_index)`

**Sumber lokal saat ini (ditulis ulang):**
- Belum dideploy
- Memiliki `privacy_invoke()` — TIDAK memiliki `invoke()`
- Menggunakan `message_locator` dan `payload_commitment`
- Emit `MessageCommitted(message_locator, payload_commitment)`
- `get_payload_chunk(message_locator, chunk_index)`

**Kesimpulan:** Helper yang dideploy dan sumber lokal saat ini adalah kontrak yang BERBEDA secara fundamental — skema pengalamatan, struktur event, dan set entrypoint tidak cocok.

---

## Risiko Privasi dan Metadata

### Metadata yang tetap terlihat on-chain

| Elemen | Status |
|---|---|
| Transaction hash | Terlihat |
| Block number | Terlihat |
| Timestamp | Terlihat |
| Helper contract address | Terlihat |
| Calldata (header + ciphertext chunks) | Terlihat |
| Event: message_locator, payload_commitment | Terlihat |
| Gas/fee | Terlihat |

### Metadata yang disembunyikan

| Elemen | Status |
|---|---|
| Identitas pengirim | Terenkripsi dalam ciphertext |
| Identitas penerima | Terenkripsi dalam ciphertext |
| Isi pesan | Terenkripsi |
| Jenis pesan | Terenkripsi |

### Risiko VeilDealEscrow

Deal fields bersifat publik: `buyer`, `seller`, `payment_token`, `payment_amount`, `nft_contract`, `nft_token_id` — bukan eksekusi rekber privat.

### Risiko VeilClaimEscrow

`claim(calldata)` menerima `secret` langsung dalam calldata — terlihat on-chain sebelum transaksi dikonfirmasi. Inkompatibel dengan ekspektasi klaim privat.

---

## Klasifikasi Kontrak

| Kontrak | Klasifikasi |
|---|---|
| **VeilChannelHelper** | Kandidat sumber messaging kanonikal saat ini; belum dideploy; mismatch sumber/deploy dengan helper lama; isolated build belum diverifikasi; audit keamanan belum lengkap |
| **VeilOffer** | Build-blocked; unverified; bukan produksi kanonikal |
| **VeilEscrow** | Legacy; dinonaktifkan; bukan kandidat produksi |
| **VeilDealEscrow** | Kandidat rekber tunggal saat ini; memerlukan redesign, verifikasi build, pengujian, dan tinjauan keamanan sebelum deployment; field deal publik berarti tidak boleh digambarkan sebagai eksekusi rekber privat |
| **VeilClaimEscrow** | Eksperimental; dinonaktifkan; di luar MVP; desain secret-in-calldata tidak kompatibel dengan ekspektasi klaim privat |

---

## Koreksi Dokumentasi

### STRK20_INTEGRATION_PLAN.md

- Fase 4B menargetkan helper lama yang dideploy (`0x05239084...`), bukan sumber lokal saat ini.
- Helper lama memiliki skema `conversation_tag` — sumber lokal menggunakan `message_locator`.
- `HELPER_SOURCE_DEPLOYMENT_MATCH_VERIFIED=false`.
- Tidak ada build Cairo yang diverifikasi.
- Offer classification: build-blocked, bukan "unverified and must not be treated as canonical" tanpa konteks blokir.
- VeilDealEscrow: field publik — bukan private escrow execution.
- Prioritas implementasi harus dikoreksi (lihat di bawah).

### docs/internal/PHASE4B_CALL_MOCK_PROVING_REPORT.md

- Alamat VeilChannelHelper yang digunakan adalah helper lama yang dideploy.
- Tambahkan status: `LEGACY_HELPER_ADDRESS_USED_FOR_CALL_MOCK=true`, `HELPER_SOURCE_DEPLOYMENT_MATCH_VERIFIED=false`, `HELPER_LOCAL_CLASS_HASH_UNAVAILABLE=true`.
- Clarify: CallMockProofProvider memverifikasi compile_actions → decode → validasi server actions, tetapi tidak memverifikasi eksekusi helper atau storage writes.
- Koreksi: jangan nyatakan Pool membayar gas — payer gas tidak diverifikasi.
- Koreksi: jangan nyatakan penyimpanan ciphertext sebagai risiko yang dapat diterima — dokumentasikan batas struktural dan risiko spam yang belum terselesaikan.

---

## Urutan Implementasi yang Dikoreksi

1. Koreksi dokumentasi Fase 4B (selesai — dokumen ini).
2. Kunci spesifikasi VeilChannelHelper kanonikal (message_locator, payload_commitment, event).
3. Buat target build dan test terisolasi untuk helper saat ini.
4. Review validasi payload, storage, event, authorization, dan batas spam.
5. Produksi class hash lokal yang dapat direproduksi.
6. Deploy helper yang ditulis ulang hanya setelah persetujuan eksplisit.
7. Ulangi CallMockProofProvider terhadap alamat helper baru.
8. Real proving tetap ditangguhkan untuk infrastruktur VPS/cloud.
9. Perbaiki Offer setelah messaging kanonikal stabil.
10. Audit/redesign VeilDealEscrow secara terpisah.

---

## Status

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

CALL_MOCK_PROOF_VERIFIED=false
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
| `Scarb.toml` | Konfigurasi build |
| `src/lib.cairo` | Registrasi modul |
| `contracts/lib.cairo` | Registrasi modul kontrak |
| `contracts/messaging/veil_channel_helper.cairo` | Sumber helper saat ini |
| `contracts/messaging/messaging_types.cairo` | VeilMessageRecord |
| `contracts/messaging/messaging_interfaces.cairo` | IVeilChannelHelper |
| `contracts/messaging/messaging_validation.cairo` | Validasi header |
| `contracts/messaging/timeline_payload_hash.cairo` | Komputasi commitment |
| `contracts/messaging/messaging_events.cairo` | MessageCommitted event |
| `contracts/offers/veil_offer.cairo` | Sumber offer helper |
| `contracts/offers/offer_types.cairo` | EncryptedOfferActionRecord |
| `contracts/offers/offer_interfaces.cairo` | IVeilOfferHelper |
| `contracts/offers/offer_validation.cairo` | Fungsi validasi offer |
| `contracts/offers/offer_commitments.cairo` | Komputasi commitment offer |
| `contracts/offers/offer_events.cairo` | OfferActionCommitted event |
| `contracts/escrow/veil_escrow.cairo` | Sumber escrow legacy |
| `contracts/escrow/escrow_types.cairo` | Escrow struct + EscrowStatus |
| `contracts/escrow/escrow_creation_actions.cairo` | Logika pembuatan escrow |
| `contracts/escrow/escrow_payload.cairo` | Payload escrow |
| `contracts/escrow/escrow_validation.cairo` | Validasi escrow |
| `contracts/escrow/escrow_commitments.cairo` | Komitmen escrow |
| `contracts/deal_escrow/veil_deal_escrow.cairo` | Sumber deal escrow |
| `contracts/deal_escrow/deal_escrow_types.cairo` | Deal struct + DealStatus |
| `contracts/deal_escrow/deal_escrow_errors.cairo` | Error deal escrow |
| `contracts/deal_escrow/deal_escrow_events.cairo` | Event deal escrow |
| `contracts/deal_escrow/deal_escrow_interfaces.cairo` | Interface deal escrow |
| `contracts/claim_escrow/veil_claim_escrow.cairo` | Sumber claim escrow |
| `contracts/claim_escrow/claim_escrow_types.cairo` | Tipe claim |
| `contracts/claim_escrow/claim_escrow_commitments.cairo` | Komitmen claim |
| `contracts/claim_escrow/claim_escrow_errors.cairo` | Error claim |
| `contracts/claim_escrow/claim_escrow_events.cairo` | Event claim |
| `contracts/claim_escrow/claim_escrow_interfaces.cairo` | Interface claim |
| `contracts/settlement/veil_settlement_helper.cairo` | Sumber settlement helper |
| `contracts/settlement/settlement_types.cairo` | Tipe settlement |
| `contracts/settlement/settlement_events.cairo` | Event settlement |
| `contracts/settlement/settlement_interfaces.cairo` | Interface settlement |
| `contracts/settlement/settlement_validation.cairo` | Validasi settlement |
| `contracts/utils/constants.cairo` | Konstanta envelope dan chunk |
| `contracts/utils/errors.cairo` | Konstanta error |
| `contracts/utils/hashing.cairo` | Fungsi hashing |
| `contracts/utils/time.cairo` | Fungsi waktu |
| `contracts/utils/validation.cairo` | Fungsi validasi umum |
| `contracts/interfaces/privacy_pool_types.cairo` | OpenNoteDeposit |
| `contracts/interfaces/escrow_interfaces.cairo` | Interface escrow umum |
| `contracts/events/escrow_events.cairo` | Event escrow legacy |

---

## Bukti Test Fase 4B (Dipertahankan)

Test: `packages/veil-sdk/tests/phase4b-mock-proving.test.mjs`

Hasil: **4 passed, 0 failed, 0 skipped**

Hasil ini tetap valid sebagai verifikasi pipeline `CallMockProofProvider` dari level SDK hingga `Pool::compile_actions` dan decoding server actions. Target helper adalah versi lama yang dideploy, bukan sumber lokal saat ini.
