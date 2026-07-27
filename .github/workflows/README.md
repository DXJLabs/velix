# VEIL GitHub Actions Order

Workflow aktif tetap langsung berada di `.github/workflows/`.

Nomor memakai format `kelompok.urutan` supaya fungsi setiap workflow mudah dibaca.
Teks `#1`, `#2`, dan seterusnya yang muncul setelah judul di halaman GitHub
adalah nomor run otomatis dari GitHub Actions, bukan workflow duplikat.

## 1 — Pemeriksaan repository

- `1.1-backend-ci.yml` — backend, API security, dan repository typecheck.

## 2 — Infrastruktur prover

1. `2.1-prover-hardware-test.yml`
2. `2.2-prover-generic-build-test.yml`
3. `2.3-prover-image-build.yml`

Image prover yang sudah valid tidak perlu dibangun ulang untuk setiap pengujian.

## 3 — Kontrak messaging

1. `3.1-contract-helper-build-deploy.yml`

## 4 — Identitas Privacy Pool

1. `4.1-privacy-recipient-register.yml`

Registrasi bersifat idempotent:
- identitas belum ada → buat proof dan daftarkan;
- public key sudah cocok → selesai tanpa menjalankan prover;
- public key berbeda → gagal tertutup.

## 5 — Shielded messaging

1. `5.1-privacy-shielded-message-proof.yml` — self-message proof.
2. `5.2-privacy-two-party-message.yml` — pesan pertama Wallet A ke Wallet B.
3. `5.3-privacy-two-party-repeat.yml` — pesan lanjutan dua arah `a-to-b` atau `b-to-a`.

Workflow reply B ke A yang terpisah dihapus karena fungsi tersebut sudah dicakup oleh
`5.3-privacy-two-party-repeat.yml`.

## 6 — Backend proving orchestration

1. `6.1-backend-durable-message-proof-e2e.yml`

Setelah jalur utama ini lulus, pekerjaan dapat dilanjutkan ke integrasi frontend
dan UX Deal Room.

## 9 — Integrasi AVNU

AVNU tetap dipertahankan dan bukan legacy.

1. `9.1-avnu-identity-preflight.yml`
2. `9.2-avnu-paymaster-preflight.yml`
3. `9.3-avnu-pool-compatibility.yml`
4. `9.4-avnu-deposit-screening-proof.yml`
5. `9.5-avnu-register-identities.yml`
6. `9.6-avnu-helper-deploy.yml`
7. `9.7-avnu-private-message.yml`
