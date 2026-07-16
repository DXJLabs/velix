# VEIL Application Indexer Boundary

Source: [`api/indexer/messages.js`](../../api/indexer/messages.js)

## Implemented RPC bridge

`GET /api/indexer/messages` is a bounded, stateless bridge over Starknet
Sepolia events. It is not the durable production application indexer.

The endpoint:

- accepts only a client-derived, nonzero `conversationTag` felt;
- rejects `channelId` / `channel_id` and does not derive FNV-style tags;
- starts at the verified helper deployment transaction block;
- scans a bounded block page and a bounded number of raw/ciphertext events;
- signs cursors and binds them to chain, helper, and conversation tag;
- scans only behind a configurable confirmation depth;
- verifies the previous cursor anchor and returns `rollbackFromBlock` when a
  reorg is detected;
- verifies the page-tip block hash before and after materialization;
- verifies the domain-separated ciphertext commitment;
- supports the hardened minimal `TimelineCommitmentStored` event by reading
  bounded ciphertext fields through `get_event` / `get_payload_chunk`;
- reports helper provenance only when both reviewed provenance/replay readers are
  present; the current verified deployment lacks those readers and is returned
  as `unverified-helper-provenance` with no fabricated Shielded mode;
- treats pre-minimal legacy event shapes as `unverified-legacy`;
- never parses ciphertext as plaintext and never accepts private discovery
  state, viewing keys, registries, notes, balances, witnesses, or proof data.

Request fields are `conversationTag`, optional `cursor`, optional `limit`
(1-10), and optional `pageBlocks` (1-5000). Clients must keep and send
`nextCursor`, deduplicate by `eventKey`, and on `reorg.detected === true`
delete accumulated public/ciphertext rows at or after `rollbackFromBlock`
before applying the replayed page.

## Server configuration

- `STARKNET_RPC_URL`: reviewed HTTPS Sepolia RPC. The verified manifest URL is
  used when it is absent.
- `STARKNET_CHAIN_ID`: must resolve to `SN_SEPOLIA`.
- `VEIL_INDEXER_CURSOR_SECRET`: independent random secret of at least 32 bytes;
  required for every cursor.
- `VEIL_INDEXER_CONFIRMATIONS`: 2-64, default 12.
- `VEIL_INDEXER_REORG_OVERLAP`: 12-256, default 32.

The helper address and deployment transaction come from
`config/veil-sepolia.js`. Environment overrides are accepted only when they
match that manifest exactly. `VEIL_INDEXER_FROM_BLOCK=0` is no longer used.

## Pre-production blocker

A production VEIL application indexer still requires an external durable
database and worker with idempotent event keys, transactional cursor updates,
restart tests, retention policy, metrics, and rollback/replay jobs. The
serverless in-memory rate limiter is defense in depth only; a distributed edge
rate limit is still required. Do not claim indexer restart E2E or production
history completeness from this RPC bridge.
