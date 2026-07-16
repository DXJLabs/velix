# VEIL End-to-End Test Plan

**Status:** Required pre-production evidence plan  
**Target:** Starknet Sepolia  
**Architecture:** [`VEIL_ARCHITECTURE_LOCK.md`](./VEIL_ARCHITECTURE_LOCK.md)  
**Current readiness:** See [`VEIL_PREPRODUCTION_STATUS.md`](./VEIL_PREPRODUCTION_STATUS.md)

This plan defines live evidence for VEIL. Unit tests, mocked providers, local contract tests, successful proof generation without submission, and explorer screenshots without recipient-side discovery do not count as end-to-end success.

## 1. Test Principles

- Use two genuinely separate accounts and client profiles, **Alice** and **Bob**. Do not share a viewing key, private registry, discovery cursor, or local storage namespace.
- Run against the exact pinned Sepolia chain, Privacy Pool, SDK, ABI, class hashes, prover, discovery provider, and VEIL deployments from the verified network manifest.
- Test the preferred privacy-wallet route and local SDK fallback separately. Record the detected capability matrix before enabling any action.
- Every public deposit must use an FPI-screening-capable route. A self-hosted prover, paymaster, or direct Invoke V3 does not waive screening.
- Build with `provingBlockId = currentBlock - 10`; refresh it after every waited transaction.
- Preserve privacy in evidence. Never capture viewing keys, claim secrets, note plaintext, private registry contents, plaintext messages/memos/terms, complete sensitive calldata, or private balance snapshots in shared logs.
- Mark each run **PASS**, **FAIL**, **BLOCKED**, or **NOT RUN**. Never convert a blocked/mock result into a pass.

## 2. Preconditions and Environment Gate

Before scenario execution, record and validate:

| Item | Required evidence |
|---|---|
| Source | VEIL commit, clean/dirty state, official SDK tag RC.2 and commit `9bfeb8d` or an explicitly reviewed successor |
| Network | Starknet Sepolia chain ID and RPC health |
| Privacy protocol | Pool address, live class hash, pinned ABI, SDK and starknet.js versions |
| VEIL contracts | Address, live class hash, ABI, deployment transaction, and supported Pool caller for each enabled contract |
| Proving | Endpoint/version, health, proof format, and compatibility |
| Screening | FPI provider/route, health, and explicit deposit support |
| Discovery | Provider type, endpoint, pagination/reorg capability, and namespaced cursor schema |
| Application indexer | Health, indexed start/cursor, database migration, reorg policy, and ciphertext-only handling |
| Wallets | Alice/Bob addresses and detected capabilities, without exporting secret material |
| Submission | Proof-aware direct route and, if enabled, tested paymaster capability |
| Client storage | Encrypted `PrivateRegistry`, schema version, corruption handling, and isolation namespaces |

The test runner must stop before a private action if chain, Pool class hash, ABI, SDK, prover, screening, account, or wallet capability does not match. Production/test UI must not silently fall back and continue under a stronger privacy label.

## 3. Required Evidence Bundle

Store one sanitized bundle per run:

```text
evidence/<UTC-run-id>/
  manifest.json
  capability-matrix.json
  commands-and-results.txt
  transactions.json
  scenario-results.json
  sanitized-client-logs/
  sanitized-indexer-logs/
  screenshots/
  rollback-result.md
```

For every on-chain step, `transactions.json` must contain the scenario ID, public transaction hash, expected contract, receipt status, finality status, block number/hash, and observed public event names. It must not contain proofs, private notes, viewing keys, secrets, or decrypted application payloads. Screenshots must be reviewed and redacted before sharing.

## 4. Baseline Verification

Run from a clean checkout using the repository-pinned commands:

1. Dependency integrity/install check.
2. Formatting and linting.
3. Full type checking, including frontend, API, indexer, and SDK paths.
4. Frontend/API/indexer production builds.
5. Cairo compilation and complete contract test matrix.
6. SDK/client and integration tests with both success and failure paths.
7. Environment validation and service health checks.

Record exact commands, versions, exit codes, and summaries. Existing counts such as 252 official SDK tests, 69 VEIL SDK tests, and 12 Cairo tests are baselines only; a changed suite must report its new count and cannot silently skip tests.

## 5. Live Sepolia Scenarios

### E2E-01 — Alice registration

1. Connect Alice and record detected wallet/privacy capabilities.
2. Register once for the exact account + Pool deployment using a valid `bigint` viewing key held client-side.
3. Confirm the transaction and locally discover Alice's privacy identity.
4. Attempt duplicate registration and verify safe/idempotent handling.
5. Restart the client and confirm the correctly namespaced identity is recovered without backend private state.

**Pass:** Registration is confirmed on-chain and rediscovered locally; duplicate handling is safe; no secret reaches API/indexer/telemetry.

### E2E-02 — Bob registration and isolation

Repeat E2E-01 on Bob's separate device/profile. Verify that Alice's registry/cursor cannot appear in Bob's namespace and that Alice cannot register Bob.

### E2E-03 — Shield through screening

1. Select an exact token amount in smallest-unit `bigint` form.
2. Submit an exact ERC-20 approval to the Privacy Pool and wait for confirmation.
3. Re-fetch chain state and a fresh `provingBlockId`.
4. Request and verify FPI screening through the declared capable route.
5. Build, prove, sign, and submit the private deposit as a second transaction using `surplusTo(Alice)`.
6. Observe the output as **Maturing**, then **Spendable** after the protocol maturity condition.

**Pass:** Two distinct confirmed transactions exist, screening is evidenced without leaking its sensitive payload, and the local balance progresses through total/maturing/spendable accurately. Approval + deposit in one `account.execute` is a failure.

### E2E-04 — Discovery and balance semantics

Restart Alice's client and perform incremental discovery. Verify total, spendable, and maturing balances against locally discovered notes. Simulate provider failure and confirm it is reported as failure rather than zero balance. Verify refresh does not rescan from genesis or reuse another provider's cursor.

### E2E-05 — Alice to Bob private transfer

1. Alice runs `discoverRequirement` for Bob and the token.
2. Handle `Register`, `SetupChannel`, `SetupToken`, or `Ready` explicitly.
3. Select only mature inputs, build a Bob output and Alice change using `surplusTo(Alice)`, prove, submit, and confirm.
4. Bob incrementally discovers the recipient note locally; Alice discovers the change locally.
5. Repeat Bob to Alice to prove directional channels are independent.

**Pass:** Both recipients discover correct maturing/spendable outcomes without backend note ownership or balance data. Raw note IDs do not appear in normal UI or shared evidence.

### E2E-06 — Fund and Pay Privately

After a separately confirmed approval, compose one private transaction that consumes a deposit amount, creates Bob's private output, and sends private surplus to Alice. Bob must already be registered. Verify the UI does not require an artificial maturity wait inside the same composed batch and does not describe the public deposit edge as private.

### E2E-07 — Partial withdrawal and linkage warning

Use mature private inputs to withdraw only part of their value to Alice's public wallet. Verify:

- `ExecuteResult.warnings` is inspected;
- `USER_LINKAGE` is shown before signing and requires explicit confirmation;
- public token, amount, recipient, and timing are described accurately;
- private change is created via `surplusTo(Alice)` and progresses from maturing to spendable;
- the action is labeled **Withdraw to My Wallet**, not private payment.

Repeat with a third public recipient under the label **Pay Public Address**.

### E2E-08 — Atomic private payment + encrypted memo

This is the minimum product proof and the highest-priority scenario.

1. With mature Alice notes and Bob ready, encrypt a versioned memo locally under `VEIL_MEMO_KEY_V1`.
2. Build one action set containing note consumption, Bob's private payment output, Alice's private change, and exactly one `InvokeExternal` to `VeilChannelHelper`.
3. Generate one proof, submit one transaction, and confirm finality.
4. Verify the helper emits/stores only bounded ciphertext, commitment, conversation tag, index, and allowed public metadata.
5. Bob independently discovers the payment note and indexed ciphertext, then decrypts the memo locally.
6. Demonstrate atomic failure by forcing the helper call to fail in a controlled test and confirming neither payment nor memo succeeds.

**Pass:** One finalized transaction proves atomic payment + memo; Bob locally discovers and decrypts both; no backend receives keys, notes, private balances, or plaintext. A mocked helper, proof-only run, or sender-only result is not a pass.

### E2E-09 — Private claim link

1. Alice generates the claim secret locally and shares it through a client-only, non-logged channel; never place it in a query parameter or backend record.
2. Deposit through the Pool into the separate `VeilClaimEscrow` using a domain-separated commitment, exact token/amount, and no stored secret.
3. Bob registers or auto-registers, claims with the secret, and locally discovers the resulting private note.
4. Verify wrong secret, missing commitment, duplicate commitment, zero token/amount, and double claim are rejected.
5. Verify exact approval only and one correct `OpenNoteDeposit` on a valid claim.

### E2E-10 — Offer lifecycle

Run Create → Counter → Accept and separate Reject/Expire paths using encrypted terms only. Verify participants, authorization, expiry, domain separation, duplicate/replay rejection, exact events/getters, supported Pool caller, and no arbitrary target/selector/calldata. Record Pool-based actions as **UNVERIFIED** until the actual privacy invocation finalizes and is rediscovered.

### E2E-11 — Deal escrow happy path

Using the separate `VeilDealEscrow`, exercise Created → BuyerFunded → SellerFunded/Active → Released. Verify roles, actual balance deltas, exact accounting/approvals, atomic state/token changes, settlement once, and private `OpenNoteDeposit` output where supported.

### E2E-12 — Deal escrow negative paths

Verify wrong participant/token/amount, duplicate deposits, release before Active, double release/refund, unauthorized Pool caller, invalid cancellation, expiry boundary, and reentrant/replayed settlement all fail without partial state or allowance residue.

### E2E-13 — Direct encrypted fallback and labels

Execute the direct `VeilChannelHelper.invoke()` path, confirm ciphertext-only behavior and recipient local decryption, and verify every screen/activity entry says **Direct encrypted**. It must never say **Shielded**, even when the account transaction succeeds.

### E2E-14 — Fresh proof retry

Force a post-build submission failure. Verify the client invalidates the proof nonce cache, refreshes state/registry as needed, computes a fresh `provingBlockId`, rebuilds, creates a new proof, and only then resubmits. Reusing the old `callAndProof` is a failure.

### E2E-15 — Indexer restart, cursor, and reorg

1. Index message/memo/offer/escrow events incrementally and paginate beyond one response window.
2. Restart the indexer/database and resume from its durable cursor without a genesis rescan or duplicates.
3. Inject or observe a test reorg and verify rollback to a safe block, removal/reconciliation of orphaned events, and deterministic replay.
4. Switch discovery provider and confirm provider-specific cursors are not reused.
5. Verify raw STRK20 channel keys, viewing keys, plaintext, proofs, and private balances never enter the indexer.

### E2E-16 — Capability and service failures

Individually exercise unsupported privacy wallet, chain mismatch, Pool/class-hash mismatch, missing viewing key, corrupted registry, RPC outage/rate limit, discovery failure, screening rejection/unavailability, proving failure, account rejection, stale nonce/proof, paymaster failure, Pool revert, and indexer outage. Each must map to the centralized error model and an accurate recoverable UI state.

### E2E-17 — One `InvokeExternal` enforcement

Attempt to compose actions targeting two VEIL helpers. The builder/client and contract path must reject with `MULTIPLE_EXTERNAL_INVOKES`. Validate supported one-helper flows separately. Multi-step product flows such as Accept Offer followed by Deal Escrow deposit must remain two transactions.

## 6. Security Observation Checklist

For every scenario, inspect browser storage, network requests, API/indexer/database records, structured logs, analytics payloads, error reports, URLs, and screenshots. Fail the run if any contain:

- signing or viewing keys;
- raw STRK20 channel keys;
- decrypted notes or ownership data;
- private balance details or snapshots;
- plaintext messages, memos, offer/escrow terms, or claim secrets;
- plaintext `PrivateRegistry` content;
- unredacted sensitive calldata, proofs, or environment secrets.

Also verify bounded ciphertext/chunks, payload commitments, domain separation, exact allowances, supported Pool callers, chain/account consistency, and honest direct-versus-shielded labels.

## 7. Exit Criteria

The live suite passes only when:

- all enabled contract, client, integration, and operational prerequisites pass;
- E2E-01 through E2E-17 either pass or a feature is explicitly disabled and marked **BLOCKED/UNVERIFIED** in product UI and status docs;
- E2E-08 passes without exception;
- E2E-09 passes before claim links are enabled;
- E2E-11 and E2E-12 pass before deal escrow is enabled;
- no critical privacy leak, fake success state, placeholder hash, hidden TODO, or unexplained skipped test remains;
- sanitized evidence can reproduce every claim;
- deployment, Sepolia smoke test, monitoring check, and rollback rehearsal pass.

Pure shielded chat remains **BLOCKED** or **UNVERIFIED** until its own real two-account canonical Pool E2E succeeds. Passing direct encrypted messaging does not change that status.
