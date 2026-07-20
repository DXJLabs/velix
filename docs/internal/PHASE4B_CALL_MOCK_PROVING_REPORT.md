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
| VeilChannelHelper | `0x052390845931a0c8d4735246d853a1a514c3cbf88cb1714937284814c5e57b23` |

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
4. **Invoke** — memanggil VeilChannelHelper

Verifikasi:

- Exactly satu Invoke menargetkan VeilChannelHelper.
- Tidak ada Deposit.
- Tidak ada Withdraw.
- Tidak ada Unshield.
- Tidak ada TransferFrom.
- Tidak ada TransferTo.
- Tidak ada Offer.
- Tidak ada Escrow.

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
POOL_ABI_SURFACE_VERIFIED=true
POOL_EXACT_RC0_IDENTITY_VERIFIED=false
STATIC_INVOKE_V3_VERIFIED=true
CALL_MOCK_COMPILE_ACTIONS_VERIFIED=true
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
- Shield tetap dinonaktifkan.
- Fase 5 belum dimulai.
- Tidak ada perubahan pada Cairo contracts, frontend, atau dependency.
