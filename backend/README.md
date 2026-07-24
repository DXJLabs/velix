# VEIL Backend

This directory contains reusable server-side boundaries for private messaging. It does not replace `packages/veil-sdk`, hold viewing keys, encrypt plaintext, sign user transactions, or submit arbitrary Starknet calls.

## Responsibilities

- `services/prover`: configure and call the pinned official transaction prover through the existing SDK `TransactionProverClient`.
- `services/discovery`: bounded Starknet RPC reads, raw helper-event discovery, and canonical payload-commitment verification.
- `config/backend-env.ts`: server-only Sepolia, Pool, helper, RPC, discovery, and prover configuration.
- `tests/messaging-e2e.test.ts`: mocked end-to-end validation of the backend boundaries.

## API endpoints

- `POST /api/messaging/prepare`: authenticated, bounded proof preparation. Accepts a canonical request and a signed Invoke V3 transaction. It rejects plaintext and private-key fields and never broadcasts.
- `GET /api/messaging/proving-status`: pinned prover health and compatibility status.
- `GET /api/messaging/transaction-status?transactionHash=0x...`: bounded Sepolia transaction-receipt status.
- `GET /api/indexer/messages`: existing ciphertext timeline indexer. It remains unchanged during this backend introduction.

## Required server environment

- `VEIL_PROVER_URL` or `VEIL_TRANSACTION_PROVER_URL`
- `VEIL_DISCOVERY_URL`
- `STARKNET_RPC_URL` (optional; reviewed Sepolia default exists)
- `VEIL_PRIVACY_POOL_ADDRESS` (optional; pinned Sepolia default exists)
- `VEIL_CHANNEL_HELPER_ADDRESS` (optional; pinned Sepolia default exists)
- Privy server credentials already required by authenticated API routes

Run locally with:

```bash
npm run test:backend
npm run test:api
npm run typecheck
```
