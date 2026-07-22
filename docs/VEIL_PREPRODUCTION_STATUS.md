# VEIL Pre-Production Status

**Status:** Authoritative operational status companion  
**Assessment date:** 2026-07-16  
**Target:** Starknet Sepolia  
**Read with:** [`VEIL_ARCHITECTURE_LOCK.md`](./VEIL_ARCHITECTURE_LOCK.md)  
**Current verdict:** **BLOCKED**

This document records repository and deployment reality. The Architecture Lock defines the required design; this status file records which parts have actually been demonstrated. A build or mocked test passing is not equivalent to a live VEIL end-to-end proof.

## Executive Summary

The official privacy implementation is publicly inspectable at tag **RC.2**, commit **`9bfeb8d`**. Its standalone SDK build and **252 tests pass**. The live Sepolia deployments listed below were queried and their class hashes were verified. In the VEIL workspace, the latest coordinated audit reports the frontend build passing, **69 local SDK tests passing**, and **12 Cairo tests passing**.

VEIL nevertheless remains **BLOCKED** for pre-production. At the Phase 0 repository snapshot, VEIL had not integrated the official SDK into its runtime dependency path, the privacy adapter was a custom duck-typed boundary, and no real two-account Sepolia payment-plus-memo flow had been proven. The required claim/deal escrow separation, production-like discovery/indexing, private registry storage, capability-gated screening route, CI, deployment, rollback, and sanitized operational monitoring were also incomplete or absent.

## Evidence Ledger

| Evidence | Result | Scope and limitation |
|---|---|---|
| Official public source | **CONFIRMED** | Tag RC.2 at commit `9bfeb8d`; this is the compatibility reference, not proof that VEIL consumes it correctly. |
| Official SDK build | **PASS** | Standalone official SDK source builds. |
| Official SDK tests | **252 PASS** | Standalone official suite; not VEIL E2E. |
| Live Sepolia class hashes | **VERIFIED** | RPC evidence confirms the deployed address/class-hash pairs below. It does not prove that every deployment matches the locked VEIL behavior. |
| VEIL frontend build | **PASS** | Latest coordinated local run; the root TypeScript configuration does not cover every browser/API JavaScript path. |
| VEIL SDK tests | **69 PASS** | Latest coordinated local run; mocked adapters do not count as live privacy execution. |
| VEIL Cairo tests | **12 PASS** | Latest coordinated local run; coverage is below the Architecture Lock matrix. |
| Real Alice/Bob payment + encrypted memo | **NOT PROVEN** | Minimum product proof is missing. |
| Historical Phase 4D/4E attempts | **NO BROADCAST** | These reports are research history, not successful live transaction evidence. |

All pass counts above are the latest coordinated audit results. Re-run them from a clean checkout and retain the command output before any release decision.

## Verified Sepolia Deployments

| Component | Address | Verified class hash | Deployment transaction | Architectural interpretation |
|---|---|---|---|---|
| Privacy Pool | `0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5` | `0x030b8c540cf04d8ef0f4db2a9098d9cc0e35e83af1cb3325f5a4f40144b4b30b` | `0x04692acc8d3e586a65f394d952934acb9997f580f88781e30da4d39b1da5d3b0` | Verified deployment identity; compatibility still requires pinned ABI/version and E2E. |
| `VeilChannelHelper` | `0x052390845931a0c8d4735246d853a1a514c3cbf88cb1714937284814c5e57b23` | `0x7892efb93c77260c410d2e3e29cf6a28421d8e1ab0c688ffaf64304e7e47d97` | `0x0141b71a2dc7c5be0433e282533a64e9f92caf444d04dae5227fbe8e490e9fd5` | Deployment verified; canonical Pool execution remains unproven. |
| `VeilOffer` | `0x02f31ea76073dbf57f404513d2160fb0ca81d6d7432be594be10cca37441feab` | `0x04ac44039e5ea11daa8eb5396c88370d48086d6038258319bd66b6b85c2ae84b` | `0x0283f42a45500051c4c6ed613cc0e5a77bfdcc497bbfe199802062eb7293f1d9` | Deployment verified; replay protection and live lifecycle remain unproven. |

No verified Sepolia address was found for a private key registry, `VeilClaimEscrow`, or `VeilDealEscrow`. Never infer or invent these addresses.

## Phase 0 Repository Reality

### Confirmed working evidence

- The project builds in the latest coordinated local run.
- Existing VEIL SDK and Cairo suites pass at their current coverage levels.
- Direct encrypted messaging code exists and must remain labeled **Direct encrypted**.
- API routes and a basic event scanner exist.
- Deployed Sepolia component identities above can be checked on-chain.

### Partial or mismatched implementation

- At the Phase 0 snapshot, the official privacy SDK was absent from VEIL package manifests and the runtime used a custom duck-typed `privacySdk` interface. Standalone official SDK success does not close this integration gap.
- Privy provides authentication/account signing, but has not been proven to provide viewing-key custody, discovery, proving, FPI-screened Shield, and generic custom privacy actions.
- Runtime network selection could combine a mainnet RPC with Sepolia contract addresses. Paymaster behavior defaulted on without a fully verified proof-aware capability route.
- The application indexer scanned from block zero per request, used a fixed maximum range, had no durable database/cursor/reorg recovery, and accepted a raw channel identifier.
- Fake/demo state was bootstrapped in runtime paths, which can misrepresent readiness.
- The root type-check does not cover all frontend and API JavaScript paths.

### Missing operational controls

- One verified network manifest consumed by frontend, SDK, tests, scripts, and deployment tooling.
- Durable STRK20 discovery configuration and VEIL application indexer with incremental cursors and reorg recovery.
- Encrypted, namespaced client-side `PrivateRegistry` storage.
- CI release gates, environment validation, deployment instructions, rollback procedure, health checks, alerts, and sanitized structured logs.
- Complete contract/client/integration tests required by the Architecture Lock.

## Feature Status

| Feature | Status | Current evidence |
|---|---|---|
| Architecture source of truth | **CONFIRMED** | `VEIL_ARCHITECTURE_LOCK.md` exists. |
| Frontend build | **WORKING** | Latest coordinated local build passes. |
| Existing SDK/Cairo suites | **WORKING** | 69 SDK and 12 Cairo tests pass at current scope. |
| Official SDK source/build/tests | **WORKING STANDALONE** | RC.2 commit `9bfeb8d`; build and 252 tests pass. |
| Official SDK in VEIL runtime | **BLOCKED** | Not present in the Phase 0 runtime dependency path; integration and compatibility evidence required. |
| Privy account/signing | **PARTIAL** | Account capability does not imply STRK20 privacy capability. |
| Direct encrypted messages | **PARTIAL** | Fallback exists; live behavior and hardening must be revalidated. It is never labeled Shielded. |
| STRK20 registration/discovery | **UNVERIFIED** | No retained live Alice/Bob evidence. |
| Shield with FPI screening | **BLOCKED** | No verified screening-capable E2E route. |
| Private transfer / deposit + transfer / withdraw | **UNVERIFIED** | Architecture known; live VEIL execution not proven. |
| Payment + encrypted memo | **BLOCKED** | Required atomic two-account Sepolia proof is missing. |
| Pure shielded chat | **UNVERIFIED** | Keep the direct fallback; do not claim canonical shielded chat. |
| Private claim link | **BLOCKED** | Separate verified `VeilClaimEscrow` deployment/E2E missing. |
| Offer lifecycle | **UNVERIFIED** | Live transitions and replay protection not proven. |
| Deal escrow | **BLOCKED** | Separate locked `VeilDealEscrow` implementation/deployment/E2E missing. |
| Production-like discovery/indexing | **BLOCKED** | Durable cursor, pagination, database, and reorg recovery missing. |
| Pre-production operations | **BLOCKED** | CI, deploy/rollback, health, monitoring, and release evidence incomplete. |

## Release-Blocking Gates

The verdict remains **BLOCKED** until all Architecture Lock acceptance criteria pass, including at minimum:

1. Pin and integrate the verified official SDK/ABI/network combination without mixed incompatible release candidates.
2. Fail fast on chain, Pool, class-hash, account, wallet capability, screening, prover, discovery, and paymaster mismatches.
3. Remove fake success state from production paths and distinguish mocks from live evidence.
4. Implement and test the locked contract separation; deploy and verify `VeilClaimEscrow` and `VeilDealEscrow` where those features are enabled.
5. Keep secrets and private state client-side, replace raw discovery identifiers, encrypt and namespace the private registry, and sanitize logs/errors.
6. Complete the contract, SDK/client, integration, and two-device Sepolia scenarios in [`VEIL_E2E_TEST_PLAN.md`](./VEIL_E2E_TEST_PLAN.md).
7. Produce the minimum product proof: Alice pays Bob privately with one atomic encrypted memo, Bob discovers both locally, and no backend receives private material.
8. Add reproducible CI, environment validation, deployment, rollback, smoke tests, health checks, and non-sensitive monitoring.

Until those gates are evidenced, UI and release notes must use **BLOCKED**, **PARTIAL**, or **UNVERIFIED** accurately and must never claim that VEIL is pre-production ready or mainnet ready.
