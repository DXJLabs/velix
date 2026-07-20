# Laporan Fase 4B — Call-Mock Proving

**Tanggal:** 2026-07-20
**Branch:** `phase4/privacy-prover-boundary`
**Base commit:** `b20f3bd3eedcc9bb42a86c467978aad913e51a46`

---

## Test

- File: `packages/veil-sdk/tests/phase4b-mock-proving.test.mjs`
- Hasil: **4 passed, 0 failed, 0 skipped**

---

## Kontrak Sepolia

| Komponen | Alamat |
|---|---|
| Privacy Pool | `0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5` |
| Pool class hash | `0x30b8c540cf04d8ef0f4db2a9098d9cc0e35e83af1cb3325f5a4f40144b4b30b` |
| Helper target (lama, dideploy) | `0x052390845931a0c8d4735246d853a1a514c3cbf88cb1714937284814c5e57b23` |
| Helper class hash (dideploy) | `0x7892efb93c77260c410d2e3e29cf6a28421d8e1ab0c688ffaf64304e7e47d97` |

**Klarifikasi:** Helper yang menjadi target Invoke adalah versi lama yang sudah dideploy, BUKAN sumber lokal saat ini (`contracts/messaging/veil_channel_helper.cairo`). Lihat [`docs/internal/audits/PHASE4C_SMART_CONTRACT_REALITY_AUDIT.md`](./audits/PHASE4C_SMART_CONTRACT_REALITY_AUDIT.md) untuk perbandingan lengkap.

---

## Struktur Transaksi

- Invoke Transaction V3
- calldata length: 17
- signature length: 2

---

## Server Actions Ter-decode

Hasil `compile_actions` dari Pool (didecode menggunakan ABI resmi SDK):

1. **WriteOnce** — replay protection, registrasi viewing key
2. **WriteOnce** — replay protection, marker channel
3. **EmitViewingKeySet** — event, viewing key tercatat on-chain
4. **Invoke** — memanggil helper lama yang dideploy

Verifikasi:

- Exactly satu Invoke menargetkan helper lama yang dideploy.
- Tidak ada Deposit.
- Tidak ada Withdraw.
- Tidak ada Unshield.
- Tidak ada TransferFrom.
- Tidak ada TransferTo.
- Tidak ada Offer.
- Tidak ada Escrow.

**Batasan:** Fase 4B tidak memverifikasi eksekusi helper, storage writes, penerimaan payload, event yang diemisi helper, atau kesamaan helper lama dengan sumber lokal saat ini.

---

## Batas Pembuktian

`CallMockProofProvider` **tidak menghasilkan proof STARK/ZK yang sebenarnya**.
Komponen ini memanggil `Pool::compile_actions` melalui Sepolia RPC dan membangun `proofFacts` serta output pesan menggunakan implementasi test resmi dari SDK.

Tahap prover asli ditangguhkan secara sengaja karena komputasi VPS/cloud yang sesuai belum tersedia.

---

## Deferred Infrastructure Gate

Persyaratan sebelum proving asli dapat dilanjutkan:

- VPS atau cloud compute yang sesuai
- Docker tersedia
- Image transaction prover resmi yang dipin berdasarkan digest
- CPU dan RAM yang mencukupi
- Tidak ada wallet secret produksi
- Akun/state testing ephemeral yang dimiliki integrator

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

---

## Batasan

- Tidak ada broadcast transaksi.
- Tidak ada pemanggilan `apply_actions`.
- Tidak ada eksekusi helper yang diverifikasi.
- Tidak ada verifikasi storage writes atau event helper.
- Tidak ada verifikasi penerimaan payload oleh helper.
- Tidak ada verifikasi kesamaan helper lama dengan sumber lokal saat ini.
- Payer gas dan perilaku submission tidak diverifikasi oleh audit ini.
- Shield tetap dinonaktifkan.
- Fase 5 belum dimulai.
- Tidak ada perubahan pada Cairo contracts, frontend, atau dependency.
- Lihat [`docs/internal/audits/PHASE4C_SMART_CONTRACT_REALITY_AUDIT.md`](./audits/PHASE4C_SMART_CONTRACT_REALITY_AUDIT.md) untuk audit realitas lengkap.
