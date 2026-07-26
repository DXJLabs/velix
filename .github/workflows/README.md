# VEIL GitHub Actions Order

Workflow aktif harus tetap langsung berada di `.github/workflows/`.
Nomor pada nama file dan judul workflow menunjukkan urutan penggunaan.

## Otomatis

- `00-backend-ci.yml` — backend, API security, dan repository typecheck.

## Infrastruktur prover

1. `10-prover-hardware-test.yml`
2. `11-prover-generic-build-test.yml`
3. `12-prover-image-build.yml`

Image prover yang sudah valid tidak perlu dibangun ulang untuk setiap pengujian.

## Jalur utama VEIL

1. `20-contract-helper-build-deploy.yml`
2. `30-privacy-recipient-register.yml`
3. `40-privacy-shielded-message-proof.yml`
4. `50-privacy-two-party-message.yml`
5. `51-privacy-two-party-repeat.yml`
6. `52-privacy-two-party-reply.yml`
7. `60-backend-durable-message-proof-e2e.yml`

Setelah jalur utama ini lulus, pekerjaan dapat dilanjutkan ke integrasi frontend dan UX Deal Room.

## Integrasi AVNU

AVNU tetap dipertahankan dan bukan legacy. Jalur ini dikerjakan setelah jalur utama VEIL stabil.

1. `90-avnu-identity-preflight.yml`
2. `91-avnu-paymaster-preflight.yml`
3. `92-avnu-pool-compatibility.yml`
4. `93-avnu-deposit-screening-proof.yml`
5. `94-avnu-register-identities.yml`
6. `95-avnu-helper-deploy.yml`
7. `96-avnu-private-message.yml`
