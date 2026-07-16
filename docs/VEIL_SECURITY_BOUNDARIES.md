# VEIL Security Boundaries

**Status:** Authoritative security companion  
**Scope:** VEIL-owned frontend, adapters, contracts, API, indexers, configuration, and operations  
**Architecture:** [`VEIL_ARCHITECTURE_LOCK.md`](./VEIL_ARCHITECTURE_LOCK.md)  
**Operational status:** [`VEIL_PREPRODUCTION_STATUS.md`](./VEIL_PREPRODUCTION_STATUS.md)

This document converts the Architecture Lock into enforceable trust and data boundaries. Official Stwo, Virtual OS, Transaction Prover, Privacy Pool, SDK, and external tooling are dependencies to pin and integrate; this review boundary does not authorize VEIL to fork or rewrite them.

## 1. Trust Model

```text
PRIVATE CLIENT ZONE
  User + wallet/private-capability provider
  VEIL client + local SDK fallback
  viewing keys, discovered notes, private registry, plaintext, claim secrets
                    |
                    | minimum reviewed protocol requests only
                    v
EXTERNAL PROTOCOL/SERVICE ZONE
  Starknet RPC | Privacy Pool | prover | screening | optional paymaster
                    |
                    | public chain data and bounded ciphertext events
                    v
PUBLIC APPLICATION ZONE
  VEIL API | application indexer | public/ciphertext database | monitoring
```

The backend, indexer, RPC, prover, screening service, paymaster, analytics, and monitoring systems are not trusted with VEIL plaintext or client privacy state. Transport encryption and authentication protect transit/access; they do not make those systems valid secret stores.

## 2. Component Responsibilities

### Wallet API route

The preferred route uses a privacy-enabled Starknet wallet to hold viewing keys, discover notes/channels, build proofs, sign, and submit. VEIL must detect each capability explicitly. Wallet connection or Starknet signing alone is insufficient.

### Local SDK route

The advanced fallback performs viewing-key, discovery, registry, note selection, proof, and encryption work on the client device. Compatibility adapters must isolate unavoidable SDK deep imports. Private state must not be proxied through a VEIL API.

### Privy

Privy may provide authentication, embedded account/signing, onboarding, profile, and notifications. Treat it as a full STRK20 wallet only after capability detection and real E2E prove viewing-key custody, registration, discovery, proving, screened deposits, private transfer, withdraw, and custom anonymizer invocation.

### VEIL API and paymaster integration

The API may serve verified public configuration, non-secret invite/notification metadata, health, rate limiting, and a narrowly defined optional paymaster route. It must not be a generic transaction/signing/proving proxy. A paymaster neither hides a public sender automatically nor replaces FPI screening.

### STRK20 discovery

`ContractDiscoveryProvider` or `IndexerDiscoveryProvider` discovers protocol notes, channels, subchannels, setup requirements, registry input, and private-balance input data for the client. Its registry/cursor namespace is private and specific to chain, Pool, account, provider, and SDK version.

### VEIL application indexer

The separate application indexer processes only public event metadata and bounded VEIL ciphertext for messages, payment memos, offers, escrows, and deal-room activity. It owns durable public cursors, pagination, idempotency, and reorg recovery. It does not discover or calculate user private balances.

### VEIL contracts

- `VeilChannelHelper`: direct ciphertext fallback and the one-helper path for atomic private payment + memo.
- `VeilOffer`: strict encrypted offer lifecycle.
- `VeilClaimEscrow`: secret-claim escrow with an unstored client secret and exact private output.
- `VeilDealEscrow`: separate buyer/seller deal state machine.

Never merge claim and deal escrow into an ambiguous contract or add a generic external-call router.

## 3. Data Classification

| Class | Examples | Permitted locations | Prohibited handling |
|---|---|---|---|
| **Secret** | signing keys, viewing keys, raw channel keys, nullifier/claim secrets, note ownership material | Privacy-capable wallet or protected client memory/storage only | Backend, indexer, analytics, logs, URLs, screenshots, support exports |
| **Private plaintext** | decrypted notes, private balances, messages, memos, offers, escrow terms, plaintext `PrivateRegistry` | Client memory; encrypted structured client storage only when persistence is required | Server persistence, telemetry, crash reports, console logs, public events |
| **Confidential ciphertext** | encrypted message/memo/offer/escrow payloads | Client, bounded contract events/storage, VEIL application indexer/database | Decrypting server-side, unbounded payloads, treating ciphertext as harmless for access/rate limits |
| **Public verified configuration** | chain ID, Pool/VEIL addresses, class hashes, ABIs, pinned versions | Versioned manifest, clients, API, tests, deployment tooling | Unverified hardcoding, mainnet/Sepolia mixing, floating critical versions |
| **Public chain/application metadata** | transaction hash, block, event index, bounded conversation tag/commitment, non-secret invite state | Chain, application indexer/database, sanitized monitoring | Tags that expose raw addresses/keys, sensitive calldata, fabricated transaction state |

Data minimization applies even to public/ciphertext classes. Store only what a defined feature and retention policy needs.

## 4. Secrets That Must Never Reach the Backend

- wallet private keys or signing secrets;
- private viewing keys or raw STRK20 channel keys;
- decrypted notes, ownership data, nullifier secrets, or private balance details;
- plaintext messages, payment memos, offer terms, or escrow terms;
- claim-link secrets;
- plaintext or complete `PrivateRegistry` records;
- proof/witness material or sensitive calldata beyond the minimum required by a directly reviewed external protocol route.

Claim secrets must be created and consumed client-side. Do not put secrets in query parameters, server-rendered routes, invite metadata, analytics, support links, or notification payloads. If a URL transport is used, use a reviewed client-only mechanism that does not send the secret in HTTP requests, and test browser/history/preview leakage.

## 5. Client Storage Boundary

`PrivateRegistry` and related private cursors require an encrypted structured store; plaintext `localStorage` is not acceptable for pre-production.

Namespace records by at least:

```text
chain ID + Pool address + account address + provider identity + SDK version + schema version
```

The storage implementation must provide authenticated encryption using an established primitive already reviewed for the codebase, schema migration, corruption detection, atomic updates, explicit account disconnect behavior, and rebuild from discovery where possible. Do not claim that registry reconstruction can recover a lost viewing key. Never reuse a registry or cursor after any namespace component changes.

Minimize the lifetime of decrypted values in memory. Do not mirror secret state into global debug stores, Redux/devtools, browser console output, DOM attributes, service-worker caches, clipboard history, or unencrypted backups.

## 6. Application Encryption Boundary

STRK20 note encryption is not a general VEIL messaging cipher. Message, memo, offer, escrow, conversation-tag, and payload-commitment purposes must be independent, authenticated, versioned, and domain-separated:

```text
VEIL_MESSAGE_KEY_V1
VEIL_MEMO_KEY_V1
VEIL_OFFER_KEY_V1
VEIL_ESCROW_KEY_V1
VEIL_CONVERSATION_TAG_V1
VEIL_PAYLOAD_COMMITMENT_V1
```

Do not use a raw viewing key as an application key, reuse a raw channel key across purposes, expose raw addresses in conversation tags, or invent a new unaudited cipher/KDF. Enforce bounded ciphertext size and chunk count, valid commitments, authenticated decryption, replay/index rules, and explicit version rejection.

Decryption failure is not an empty message. It must produce `DECRYPTION_FAILED` without logging ciphertext plus key material or plaintext context.

## 7. Transaction and Proof Boundary

### One external invocation

A Pool `apply_actions` transaction contains at most one `InvokeExternal`. The selected VEIL target and selector are feature-specific and allowlisted; user-controlled arbitrary target/selector/calldata is forbidden. A flow needing two helpers uses two explicit transactions.

### Deposit boundary

Shield always separates:

1. exact ERC-20 approval to the verified Pool, confirmed on-chain;
2. refreshed state/block, FPI screening, new private build/proof, and `apply_actions` submission.

Never batch approval with deposit. Never use an unlimited allowance by default. Calculate actual token deltas where external operations are involved and use checked conversions.

### Proof submission

- Use a fresh `provingBlockId = currentBlock - 10` for every build and refresh after a waited transaction.
- Include `proofFacts` and `proof` only when facts exist; never serialize `proofFacts: []`.
- Use `tip: 0n` for Invoke V3.
- Distinguish rejected, reverted, accepted, and finalized states.
- After failure, invalidate the proof nonce cache, refresh state/registry, rebuild at a fresh block, generate a new proof, and resubmit. Never replay an old `callAndProof` unchanged.

The proving route must be version-pinned and documented. Send only the protocol-required payload directly to the reviewed provider; do not copy it through VEIL logs, analytics, or generic backend endpoints.

### Screening boundary

Every public deposit requires FPI screening. Disable Shield if the detected route cannot prove screening support. Self-hosting, a paymaster, AVNU, custom integration, or direct Invoke V3 cannot bypass this gate. Existing-note private operations do not automatically require a new deposit screening step.

## 8. Contract Security Boundaries

Every VEIL-owned contract must enforce:

- the supported Privacy Pool caller on `privacy_invoke` where required;
- exact entry point, target, token, amount, role, and state constraints;
- checks-effects-interactions and atomic state/token updates;
- domain-separated commitments and replay/duplicate-transition protection;
- no arbitrary calls, unbounded arrays/ciphertext, plaintext, zero-value spam, or unchecked narrowing conversions;
- exact approvals and allowance cleanup/verification; never unlimited approval;
- event fields limited to required public metadata and ciphertext;
- exact `Span<OpenNoteDeposit>` behavior.

For token/protocol output, snapshot the balance, execute, calculate and validate the actual nonzero delta, perform checked conversion, approve exactly, and construct the exact private output. Never trust a frontend-supplied amount without checking funds received.

`VeilClaimEscrow` must store only a domain-separated commitment, reject duplicates, mark a valid claim before the external interaction, and prevent double claim. `VeilDealEscrow` must enforce roles, lifecycle, exact accounting, one-time settlement/refund, and expiry independently. A legacy generic `VeilEscrow` does not satisfy either boundary by name alone.

## 9. Logging, Telemetry, and Error Handling

Use structured allowlisted fields rather than serializing request bodies, wallet/provider objects, transactions, or thrown SDK objects wholesale.

Allowed examples:

```text
request ID, service/version, chain ID, public contract address,
public transaction hash, block number, event type/index,
sanitized error code, duration, retry count, health state
```

Never log private material listed above, authorization headers/cookies, populated environment values, complete calldata/proofs, full registries, or private balance snapshots. Redaction must be recursive and tested against nested objects, arrays, alternate key names, error causes, and string interpolation. Production source maps, error reporting, session replay, and analytics require a privacy review and field allowlist.

Map errors to the centralized codes in the Architecture Lock. Keep screening, proving, signing, paymaster, Pool revert, stale nonce/proof, discovery, and RPC failures distinct. Error UI may be understandable, but it must not fabricate success or hide the actual failure class.

## 10. Network and Supply-Chain Boundary

- Pin exact critical dependency versions and lockfile integrity.
- Pin and verify chain ID, Pool/VEIL addresses, class hashes, ABIs, transaction format, prover/screening/discovery compatibility, and deployed contract callers.
- Consume one verified network manifest everywhere; fail closed on mismatch.
- Do not mix release candidates silently or use floating `latest` versions.
- Keep secrets out of source, committed `.env` files, build artifacts, client bundles, CI output, and deployment manifests.
- Treat RPC, prover, discovery, screening, paymaster, and package registries as separate dependencies with explicit health/timeouts and minimum permissions.

## 11. Phase 0 Gaps Requiring Repair

The Phase 0 snapshot identified these unresolved boundaries. They remain blockers until implementation and tests demonstrate otherwise:

| Gap | Risk | Required disposition |
|---|---|---|
| Official SDK absent from the then-current VEIL runtime path; custom duck-typed adapter used | API/version mismatch and false capability assumptions | Pin the verified source/ABI combination, isolate compatibility code, and prove live integration. |
| Mainnet RPC could be paired with Sepolia addresses | Wrong-chain signing, loss, or misleading UI | Single verified manifest plus fail-fast chain/class-hash checks. |
| Paymaster defaulted on through a broad proxy boundary | Arbitrary or incompatible submission and inaccurate privacy assumptions | Narrow allowlisted proof-aware API, explicit capability detection, direct diagnostic path. |
| Application indexer accepted a raw channel identifier | Correlation/private-channel exposure | Send only a reviewed domain-separated application tag; never raw STRK20 channel keys. |
| Indexer rescanned a bounded block-zero range without durable cursor/reorg recovery | Missed/duplicate events and false history | Durable database cursor, pagination, idempotency, safe rollback/replay. |
| Log redaction was shallow | Nested secrets could reach logs/error reporting | Allowlisted structured logging and recursive redaction tests. |
| Conversation-tag derivation used a predictable non-cryptographic FNV-style construction | Address correlation/collision risk | Replace with the reviewed versioned domain-separated construction and compatibility migration. |
| No encrypted private registry implementation | Privacy state loss, plaintext persistence, or namespace mixing | Authenticated encrypted structured client store with schema/corruption handling. |
| Fake/demo state was bootstrapped in runtime paths | Fabricated privacy status or transaction success | Remove from production startup; isolate explicit demo/test mode. |
| No complete CI/deploy/rollback/monitoring controls | Unreproducible or unsafe release | Add deterministic gates, environment checks, smoke/rollback rehearsal, sanitized health/alerts. |

Do not repair these gaps by weakening labels or moving private state to the backend.

## 12. Security Release Gate

An enabled feature must satisfy all of the following:

- its wallet/local capability route is detected and live-tested;
- chain, Pool, ABI, class hash, SDK, prover, screening, discovery, and submission compatibility are pinned and verified;
- secret and plaintext flows stay inside the client boundary;
- contract targets, selectors, callers, state transitions, sizes, amounts, and approvals are constrained;
- logs, analytics, URLs, database rows, and evidence artifacts pass leak inspection;
- negative, replay, retry, reorg, and two-account E2E cases pass;
- UI labels match reality: **Direct encrypted** is not **Shielded**;
- rollback and incident procedures are exercised.

If any required control is missing, disable the affected action and record it as **BLOCKED** or **UNVERIFIED**. A successful build, mock, proof generation, or transaction submission alone does not cross the security gate.
