# Laporan Fase 4D — VeilChannelHelper Isolated Build dan Test

**Tanggal:** 2026-07-20
**Branch:** `phase4/privacy-prover-boundary`
**Commit test:** `249cb477c0b5ab0de2e91f57c3d235e73e2813d5`
**Pesan commit:** `test(cairo): cover rewritten VeilChannelHelper`

---

## Ringkasan

VeilChannelHelper yang ditulis ulang berhasil dikompilasi secara terisolasi dan lulus semua 20 test terfokus tanpa kegagalan atau yang dilewati.

---

## Versi Alat

| Alat | Versi |
|---|---|
| Scarb | 2.16.1 |
| Cairo | 2.16.1 |
| Sierra | 1.7.0 |
| snforge | 0.57.0 |
| Node.js | v24.10.0 |
| starknet.js | 9.4.2 |

---

## Sumber Helper Saat Ini

`contracts/messaging/veil_channel_helper.cairo`

---

## Test Terfokus

`tests/test_veil_channel_helper.cairo`

---

## Build Terisolasi

**Perintah:**
```
cd /tmp/veil-channel-helper-isolated && scarb build
```

**Hasil:**
```
   Compiling veil_channel_helper v0.1.0 (/tmp/veil-channel-helper-isolated/Scarb.toml)
    Finished `dev` profile target(s) in 17 seconds
```

**Status:** BUILD SUCCEEDED

---

## Eksekusi Test Terfokus

**Paket sementara:** `/tmp/veil-channel-helper-isolated-test`

**Perintah:** `scarb test`

**Hasil:**
```
Collected 20 test(s) from veilc package
Running 20 test(s) from tests/
Tests: 20 passed, 0 failed, 0 ignored, 0 filtered out
```

---

## Cakupan Test

| Area | Test |
|---|---|
| Konstruktor | Privacy Pool tersimpan, menolak alamat nol |
| Otorisasi | privacy_invoke hanya untuk Pool yang dikonfigurasi |
| Penolakan pemanggil | Pemanggil selain Pool ditolak |
| Validasi payload | Envelope version, locator, commitment, chunk count, panjang calldata |
| Kejadian duplikat | Locator duplikat ditolak, commitment duplikat ditolak |
| Getter | Pesan yang tidak ada ditolak, chunk di luar batas ditolak |
| Batas | 64 chunk maksimum diterima, status commitment konsisten |
| Event | MessageCommitted emit dengan locator dan commitment yang benar |

Secara rinci:

1. constructor menyimpan Privacy Pool
2. constructor menolak zero Privacy Pool
3. privacy_invoke terotorisasi menyimpan pesan valid
4. privacy_invoke memancarkan event MessageCommitted
5. pemanggil tidak terotorisasi ditolak
6. header calldata terpotong ditolak
7. envelope version salah ditolak
8. zero message_locator ditolak
9. zero payload_commitment ditolak
10. zero chunk_count ditolak
11. chunk_count melebihi 64 ditolak
12. chunk ciphertext hilang ditolak
13. commitment tidak valid ditolak
14. duplicate message_locator ditolak
15. commitment reuse dengan chunk berbeda ditolak
16. catatan pertama tidak berubah setelah duplikat ditolak
17. get_message menolak locator yang hilang
18. get_payload_chunk menolak indeks di luar batas
19. batas 64 chunk maksimum diterima
20. status commitment konsisten setelah penyimpanan

---

## Semantik Test Lama yang Dihapus

| Semantik Lama | Alasan Penghapusan |
|---|---|
| `invoke()` | Tidak ada di sumber saat ini |
| `conversation_tag` | Sumber saat ini menggunakan `message_locator` |
| `event_index` | Tidak ada getter berbasis event index |
| `VeilTimelineEvent` | Tipe tidak ada di sumber saat ini |
| `TimelineCommitmentStored` | Event digantikan oleh `MessageCommitted` |
| `TIMELINE_PAYLOAD_DOMAIN` | Konstanta digantikan oleh `VEIL_MESSAGE_COMMITMENT_DOMAIN` |
| Alamat helper lama yang dideploy | Bukan target sumber saat ini |

---

## Artefak yang Dihasilkan

| Artefak | Path |
|---|---|
| Sierra contract class | `target/dev/veil_channel_helper_VeilChannelHelper.contract_class.json` (132,554 bytes) |
| CASM compiled class | `target/dev/veil_channel_helper_VeilChannelHelper.compiled_contract_class.json` (99,276 bytes) |

### Verifikasi ABI

| Entrypoint/Event | Status |
|---|---|
| `privacy_invoke` | ✓ Present |
| `invoke` | ✓ Absent |
| `MessageCommitted` | ✓ Present |
| `TimelineCommitmentStored` | ✓ Absent |

---

## Class Hash Lokal

| Properti | Nilai |
|---|---|
| Local class hash | `0x35d26edfba322a472f717d57654b31d9bab13c681e18ef1bd616f613d4b6665` |
| Old deployed class hash | `0x7892efb93c77260c410d2e3e29cf6a28421d8e1ab0c688ffaf64304e7e47d97` |
| Match? | **Tidak** — helper yang dideploy adalah versi lama yang berbeda |

Helper yang dideploy di Sepolia (`0x05239084...`) menggunakan class hash lama dengan skema `conversation_tag`/`event_index` dan event `TimelineCommitmentStored`. Sumber lokal saat ini menggunakan skema `message_locator`/`payload_commitment` dengan event `MessageCommitted`. Keduanya adalah kontrak yang berbeda.

---

## Blokir yang Tersisa

| Blokir | Status |
|---|---|
| Audit keamanan helper | Belum lengkap — review sumber selesai, audit independen belum |
| Helper dideploy | Belum — helper saat ini belum dideploy ke Sepolia |
| Eksekusi runtime helper | Belum diverifikasi — tidak ada transaksi live |
| CallMockProofProvider terhadap helper baru | Belum diulang — membutuhkan deployment helper baru |
| Full Cairo build repository | Masih diblokir oleh modul Offer/Escrow yang tidak terkait |
| Real prover | Ditangguhkan untuk infrastruktur VPS/cloud |
| Fase 5 | Belum dimulai |

---

## Status

```
HELPER_CURRENT_TEST_FILE_UPDATED=true
HELPER_ISOLATED_BUILD_VERIFIED=true
HELPER_ISOLATED_TEST_VERIFIED=true
HELPER_TESTS_COLLECTED=20
HELPER_TESTS_PASSED=20
HELPER_TESTS_FAILED=0
HELPER_LOCAL_CLASS_HASH_AVAILABLE=true
HELPER_LOCAL_CLASS_HASH=0x35d26edfba322a472f717d57654b31d9bab13c681e18ef1bd616f613d4b6665

HELPER_SOURCE_DEPLOYMENT_MATCH_VERIFIED=false
HELPER_SOURCE_REVIEW_COMPLETED=true
HELPER_SECURITY_AUDIT_COMPLETED=false
HELPER_RUNTIME_EXECUTION_VERIFIED=false
PRIVATE_INVOKE_HELPER_EXECUTION_VERIFIED=false
FULL_CAIRO_BUILD_VERIFIED=false

CALL_MOCK_PROOF_VERIFIED=false
LOCAL_PROVER_VERIFIED=false
REAL_PROOF_VERIFIED=false
BROADCAST_VERIFIED=false
SHIELD_ENABLED=false
FASE_5_STARTED=false
```

---

## Batasan

- Dokumen ini tidak mengklaim production ready.
- Audit keamanan independen belum dilakukan.
- Helper belum dideploy ke Sepolia.
- Eksekusi runtime belum diverifikasi.
- Real proof belum dihasilkan.
- Integrasi kanonikal belum lengkap.
- Fase 5 belum dimulai.
