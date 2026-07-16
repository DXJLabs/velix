# VEIL Architecture Lock

**Status:** Authoritative repository source of truth  
**Scope:** VEIL only  
**Target:** Starknet Sepolia pre-production  
**Protocol base:** STRK20 / Starknet Privacy Pool  

> This document is authoritative for VEIL. Do not replace this architecture with assumptions, stale implementations, generic privacy designs, or architecture from unrelated projects.

---

## 1. Product Definition

VEIL is a **private Starknet deal-room dapp** built on STRK20 / Starknet Privacy Pool.

VEIL provides:

- encrypted deal-room communication;
- private payments;
- encrypted payment memos;
- private claim links;
- private offers and negotiation;
- private escrow settlement;
- wallet, activity, and onboarding UX around those features.

VEIL is **not**:

- a privacy wallet;
- a new Privacy Pool;
- a Privacy Pool fork;
- a custom ZK proving system;
- a generic relayer;
- a generic DeFi router;
- CAREL;
- Agentic DeFi;
- an Arbitrum project;
- an iExec project;
- ChainEstate;
- any unrelated Cairo or DXJ Labs project.

Do not mix VEIL architecture with those projects.

---

## 2. Locked High-Level Architecture

### 2.1 Preferred route: Starknet Wallet API

```text
VEIL React frontend
→ starknet-start useStrk20 hooks or starknet.js WalletAccountV6
→ privacy-enabled wallet
→ wallet-managed keys, notes, proof, signature, and submission
→ Starknet Privacy Pool
→ VEIL anonymizer/helper contract
```

Use this route when the connected wallet truly supports the STRK20 Wallet API.

The wallet is responsible for:

- private viewing-key custody;
- note discovery;
- channel discovery;
- note selection;
- proof generation;
- proof-aware signing;
- transaction submission.

`useStrk20` is a React convenience wrapper. It is not a privacy engine.

`WalletAccountV6` is a wallet communication layer. It is not a privacy engine.

### 2.2 Advanced fallback: local Privacy SDK integration

```text
VEIL client device
→ createPrivateTransfers()
→ local ViewingKeyProvider
→ DiscoveryProvider
→ ProvingProvider
→ proof-aware account submission or compatible paymaster route
→ Starknet Privacy Pool
→ VEIL anonymizer/helper contract
```

This route is permitted when a compatible privacy-enabled wallet is unavailable or does not expose the required custom action.

Private state must remain client-side.

### 2.3 Privy boundary

Privy may provide:

- Google/email login;
- embedded Starknet account;
- account signing;
- product onboarding;
- profile and notification UX.

Privy must **not** be treated as a full STRK20 privacy wallet unless real capability detection and end-to-end tests prove support for:

- viewing-key custody;
- STRK20 registration;
- note discovery;
- proof generation;
- FPI-screened deposits;
- private transfer;
- withdraw;
- custom anonymizer invocation.

A Starknet signer alone does not imply STRK20 privacy support.

---

## 3. Privacy and Data Boundaries

The VEIL backend must never receive or store:

- wallet private keys;
- account signing secrets;
- private viewing keys;
- raw STRK20 channel keys;
- decrypted notes;
- private balance details;
- note ownership data;
- nullifier secrets;
- plaintext messages;
- plaintext payment memos;
- plaintext offer terms;
- plaintext escrow terms;
- claim-link secrets;
- plaintext `PrivateRegistry` data.

Private operations must remain wallet-side or device-side.

The VEIL backend may handle:

- verified public network configuration;
- supported Pool addresses and versions;
- invite metadata that does not contain secrets;
- optional notification metadata;
- optional paymaster integration;
- rate limiting;
- health checks;
- VEIL ciphertext event indexing.

Never log:

- viewing keys;
- claim secrets;
- decrypted payloads;
- decrypted notes;
- complete private registries;
- sensitive calldata;
- private balance snapshots.

Production telemetry and error reporting must be sanitized.

---

## 4. Required Contract Separation

The following responsibilities must remain separate.

### 4.1 `VeilChannelHelper`

Purpose:

- direct encrypted-message fallback;
- Privacy Pool encrypted payment memo;
- future canonical Privacy Pool message path;
- ciphertext event emission or bounded storage;
- conversation tag;
- payload commitment;
- chunk/event index;
- timestamp.

Required entry points:

#### `invoke()`

- direct encrypted fallback;
- not a Privacy Pool action;
- must be labeled **Direct encrypted** in the UI.

#### `privacy_invoke()`

- Privacy Pool `InvokeExternal` path;
- must only be treated as **Shielded** after real successful Pool execution;
- must return the exact `Span<OpenNoteDeposit>` type;
- non-custodial memo/message operations return an empty span.

Security requirements:

- authenticate the supported Privacy Pool caller where required;
- bounded ciphertext size;
- bounded chunk count;
- valid payload commitment;
- no plaintext;
- no unbounded arrays;
- no arbitrary external calls;
- no arbitrary target, selector, or calldata.

### 4.2 `VeilOffer`

Purpose:

- Create;
- Counter;
- Accept;
- Reject;
- Expire;
- ConvertToEscrow.

Requirements:

- strict state machine;
- domain-separated commitments;
- encrypted terms only;
- expiry validation;
- participant and authorization validation;
- replay and duplicate-transition protection;
- no arbitrary external target, selector, or calldata;
- supported Pool caller only for `privacy_invoke()`;
- exact events and getters required by frontend and indexer.

Pure Privacy Pool offer actions remain **UNVERIFIED** until replay protection and live E2E are proven.

### 4.3 `VeilClaimEscrow`

Purpose:

- official-style secret claim-link escrow;
- private funds for a recipient who is not registered yet.

Deposit flow:

```text
Pool transfers funds to escrow
→ escrow stores commitment entry
→ funds stay parked
→ returns empty Span<OpenNoteDeposit>
```

Claim flow:

```text
claimer provides secret
→ contract recomputes domain-separated commitment
→ verifies entry exists
→ verifies not claimed
→ marks claimed
→ approves exact amount to Pool
→ returns one OpenNoteDeposit
```

Requirements:

- pinned or explicitly supported Privacy Pool caller;
- domain-separated commitment;
- no secret stored during deposit;
- zero hash/token/amount checks;
- duplicate commitment rejection;
- double-claim protection;
- exact approval only;
- no unlimited allowance;
- claim secret remains client-side.

### 4.4 `VeilDealEscrow`

Purpose:

- VEIL buyer/seller deal escrow;
- separate from `VeilClaimEscrow`.

Expected lifecycle:

```text
Created
→ BuyerFunded
→ SellerFunded or Active
→ Released, Refunded, or Cancelled
```

Requirements:

- strict role validation;
- strict state transitions;
- deposit tracking;
- settlement exactly once;
- refund exactly once;
- expiry rules;
- no arbitrary calls;
- supported Pool caller only;
- exact amount accounting;
- exact approvals;
- private settlement through `OpenNoteDeposit` where supported;
- no reliance on frontend-provided amount without verifying actual funds;
- all state and token changes atomic;
- full negative-path tests.

Do not merge `VeilClaimEscrow` and `VeilDealEscrow` into one ambiguous contract.

Do not add a generic deal router for MVP or pre-production.

---

## 5. One InvokeExternal Rule

A Privacy Pool `apply_actions` transaction may contain at most one `InvokeExternal`.

Therefore:

- Payment + encrypted memo may invoke `VeilChannelHelper`.
- Offer actions may invoke `VeilOffer`.
- Claim-link escrow actions may invoke `VeilClaimEscrow`.
- Deal escrow actions may invoke `VeilDealEscrow`.

Do not construct a transaction that invokes multiple VEIL helper contracts.

Example:

```text
Transaction 1: Accept Offer
Transaction 2: Deposit into Deal Escrow
```

A two-step product flow is acceptable.

Do not hide this protocol limit behind an unsafe generic router.

---

## 6. STRK20 Registration

Registration occurs once per:

```text
account + Privacy Pool deployment
```

Supported approaches:

- explicit `.register()`;
- `autoRegister: true` for appropriate first-use flows.

Requirements:

- viewing key must be a `bigint`;
- validate the SDK-supported range;
- do not silently accept a string;
- namespace local privacy identity by chain ID, Pool address, account address, and SDK version;
- duplicate registration must be detected or handled safely;
- UI wording should be product-facing, such as **Setting up your private identity**.

Do not claim cross-device recovery works unless it is implemented and tested.

---

## 7. Shield / Deposit

Shield moves public ERC-20 tokens into the Pool and creates a private note.

It always requires two separate transactions.

### Transaction 1

```text
ERC-20 approve Privacy Pool
→ wait for confirmation
```

### Transaction 2

```text
build private deposit
→ generate proof
→ submit apply_actions
→ create private note
```

Rules:

- never batch approval and private deposit into one `account.execute`;
- use exact approval by default;
- detect existing allowance safely;
- preserve retry after successful approval;
- recompute `provingBlockId` after approval confirmation;
- use `autoSetup` where appropriate;
- use `surplusTo(account.address)`;
- token amounts use `bigint` in smallest token units;
- every deposit requires valid FPI screening;
- self-hosted proving does not bypass screening;
- failed deposits must not be labeled successful;
- output notes appear as **Maturing** before **Spendable**.

Direct Shield through Privy remains **UNVERIFIED** until a screening-capable E2E route succeeds.

---

## 8. Private Transfer

STRK20 notes are UTXOs and are consumed completely.

Example:

```text
input note 100
→ recipient note 60
→ sender change note 40
```

Requirements:

- discover notes locally;
- separate total, spendable, and maturing balances;
- only mature notes may be selected;
- use `surplusTo(activeSenderAddress)` whenever change may exist;
- default to SDK-supported naive note selection where appropriate;
- do not expose raw note IDs in normal UI;
- recipient must be registered;
- run `discoverRequirement` before proving;
- handle `Register`, `SetupChannel`, `SetupToken`, and `Ready` explicitly;
- Alice cannot register Bob;
- Alice→Bob and Bob→Alice are separate channels;
- token subchannels are token-specific;
- use explicit pre-flight for multi-recipient batches;
- do not treat discovery failure as zero balance.

When the recipient is not registered:

```text
stop normal private transfer
→ offer Invite Counterparty or Private Claim Link
```

---

## 9. Deposit + Transfer

After the separate approval transaction, VEIL may atomically compose:

```text
deposit amount
→ private transfer amount to recipient
→ private surplus back to sender
```

Requirements:

- the deposit must not pin its full amount to the sender before transfer;
- transfer consumes the temporary transaction balance;
- `surplusTo` receives the remainder;
- recipient must already be registered;
- recipient output and sender surplus notes become maturing notes;
- UI must not require a 10-block wait between the deposit and transfer inside the same batch.

Product label:

**Fund and Pay Privately**

Do not describe the public deposit edge as private.

---

## 10. Withdraw / Unshield

Withdraw spends private notes and sends public ERC-20 tokens to a public address.

Publicly visible:

- token;
- amount;
- recipient;
- timing.

Hidden:

- which private notes funded the withdrawal.

Requirements:

- input notes must be mature;
- partial withdrawal creates a new private change note;
- `surplusTo` defaults to the active account;
- inspect `ExecuteResult.warnings`;
- surface `USER_LINKAGE` before submission;
- require explicit confirmation for public linkage risk.

Correct product labels:

- **Withdraw to My Wallet**
- **Pay Public Address**

Never label a public-address withdrawal as a private payment.

---

## 11. Private Payment + Encrypted Memo

This is the primary shielded VEIL feature.

Target composition:

```text
UseNote
→ create recipient private note
→ create sender change note
→ one InvokeExternal to VeilChannelHelper
→ encrypted payment memo
→ one proof
→ one transaction
```

Requirements:

- payment and memo succeed or fail atomically;
- memo encryption occurs locally;
- helper stores or emits ciphertext only;
- helper returns the correct empty span for non-custodial memo logic;
- VEIL application indexer indexes ciphertext events;
- recipient decrypts locally;
- real Alice/Bob two-device Sepolia E2E must pass.

This feature has higher priority than pure shielded chat.

---

## 12. Pure Chat Status

Direct encrypted messaging remains an allowed fallback.

It must be labeled:

**Direct encrypted**

Do not label it:

**Shielded**

Pure Privacy Pool messaging remains **UNVERIFIED** until all of the following succeed:

- valid replay protection;
- valid WriteOnce-producing action pattern or officially supported alternative;
- builder support;
- generic `InvokeExternal` support;
- proof generation;
- submission;
- helper execution;
- recipient discovery;
- recipient decryption;
- real two-account Sepolia E2E.

Do not introduce fake zero-value note workarounds without official compatibility and successful E2E evidence.

Do not remove the working direct encrypted fallback before the canonical path is proven.

---

## 13. Application Encryption

STRK20 note encryption is not automatically general chat encryption.

VEIL application encryption must be:

- client-side;
- authenticated;
- domain-separated;
- versioned;
- independent across message, memo, offer, and escrow contexts.

Use versioned domains such as:

```text
VEIL_MESSAGE_KEY_V1
VEIL_MEMO_KEY_V1
VEIL_OFFER_KEY_V1
VEIL_ESCROW_KEY_V1
VEIL_CONVERSATION_TAG_V1
VEIL_PAYLOAD_COMMITMENT_V1
```

Do not:

- use a raw viewing key as an application encryption key;
- use a raw STRK20 channel key directly across multiple purposes;
- expose raw wallet addresses through conversation tags;
- invent unaudited cryptographic constructions;
- store plaintext on the server.

Use established authenticated encryption primitives already present in the codebase where appropriate.

---

## 14. Discovery Architecture

VEIL has two separate discovery systems.

### 14.1 STRK20 DiscoveryProvider

Responsible for:

- private notes;
- channels;
- subchannels;
- setup requirements;
- registry;
- cursor;
- private balance input data.

Development:

```text
ContractDiscoveryProvider
→ Pool through Starknet RPC
→ rate limited
```

Production:

```text
IndexerDiscoveryProvider
→ HTTP Discovery Service
→ pagination and reorg handling
```

Requirements:

- isolate SDK deep-import workarounds in one compatibility adapter;
- do not spread `@ts-expect-error` across the codebase;
- token `AddressMap` keys must be `bigint`;
- cursor values are provider-specific;
- do not reuse cursors across provider implementations;
- namespace registry/cursor by chain, Pool, account, provider, and SDK version;
- full scan must not run on every render;
- distinguish empty results from provider failure;
- implement incremental scans and refresh behavior.

### 14.2 VEIL Application Indexer

Responsible for:

- message ciphertext;
- payment memo ciphertext;
- offer events;
- escrow events;
- deal-room activity;
- cursor and reorg handling.

The STRK20 discovery provider does not replace the VEIL application indexer.

---

## 15. Private Registry Storage

`PrivateRegistry` contains sensitive privacy state.

Requirements:

- never send it to the backend;
- never send it to analytics;
- never log it;
- never mix registries between accounts, Pools, chains, providers, or SDK versions;
- use an appropriate local encrypted structured store;
- implement corruption and schema-version handling;
- allow rebuild from discovery when possible;
- never claim registry recovery can replace a lost viewing key.

Do not use plaintext `localStorage` as final pre-production storage for sensitive registry data.

---

## 16. Proving Configuration

For every private build:

```text
provingBlockId = currentBlock - 10
```

Requirements:

- always pass `provingBlockId`;
- re-fetch it after each waited transaction;
- never reuse a stale value across approval and deposit;
- preserve a reorg buffer;
- do not hardcode protocol proof-validity windows as permanent product assumptions;
- verify chain ID and Pool compatibility.

Submission rules:

- when `proofFacts` exist, include `proofFacts` and `proof`;
- when `proofFacts` are empty, omit both keys;
- never submit `proofFacts: []`;
- Invoke V3 requires `tip: 0n`;
- wait for transaction result;
- distinguish rejected, reverted, accepted, and finalized states.

Retry rules after submission failure:

1. call `transfers.invalidateProofNonceCache()`;
2. refresh relevant state;
3. refresh registry if needed;
4. compute a fresh `provingBlockId`;
5. rebuild;
6. generate a new proof;
7. resubmit.

Never retry by resubmitting the old `callAndProof` unchanged.

---

## 17. Screening

Every public deposit requires FPI screening.

Screening cannot be bypassed by:

- self-hosted prover;
- hosted prover without screening support;
- AVNU;
- custom SDK integration;
- direct Invoke V3.

Therefore:

- Shield must only be enabled on a screening-capable route;
- screening failure must be surfaced accurately;
- self-hosted proving alone does not make direct deposits production-ready.

Private operations using existing private notes do not automatically require a new deposit screening step.

---

## 18. Version and Network Compatibility

Do not guess compatibility.

Audit and document:

- privacy SDK version;
- starknet.js version;
- starknet-start version;
- proving service version;
- Pool contract address;
- Pool class hash;
- Pool ABI;
- target chain ID;
- deployed VEIL contract addresses;
- actual transaction format;
- FPI screening support;
- discovery endpoint compatibility.

Rules:

- pin exact dependency versions;
- do not use floating `latest` ranges for critical privacy dependencies;
- do not silently mix incompatible release candidates;
- source/tag, deployed ABI/class hash, and successful E2E evidence outrank stale narrative documentation;
- create one verified network configuration consumed by frontend, SDK, tests, scripts, and deployment tooling;
- never hardcode an unverified Sepolia or mainnet Pool address.

---

## 19. Wallet Capability Detection

Detect and classify:

- account connection;
- signing;
- STRK20 Wallet API support;
- registration support;
- Shield support;
- private transfer support;
- withdraw support;
- custom anonymizer invocation;
- wallet-side proof management;
- screening-capable deposit support.

UI behavior:

```text
Full supported privacy wallet
→ enable verified supported private features

Partial support
→ enable only proven capabilities

No STRK20 support
→ show unsupported privacy wallet state
→ do not silently downgrade and label it Shielded
```

Do not infer privacy capability merely because an account can sign Starknet transactions.

---

## 20. Paymaster and Submission

AVNU or another paymaster may be used only when the proof-aware submission path is compatible and tested.

Do not assume:

- every public approval can be sponsored;
- every proof-aware Invoke V3 can be sponsored;
- a paymaster automatically hides the sender;
- a paymaster removes FPI screening.

Maintain a direct proof-aware submission path for diagnostics where supported.

Distinguish:

- proving failure;
- screening failure;
- account signing failure;
- paymaster failure;
- Pool revert;
- stale nonce;
- stale proof;
- RPC failure.

---

## 21. Frontend UX Requirements

### Wallet page

Show:

- public balance;
- private total;
- spendable private balance;
- maturing private balance;
- current network;
- Pool status;
- wallet/privacy capability status;
- registration/private identity status.

Actions:

- Shield;
- Send Privately;
- Fund and Pay Privately;
- Withdraw;
- Pay Public Address;
- Private Claim Link.

### Recipient pre-flight

```text
Registered and Ready
→ Send Privately

Registered but setup missing
→ prepare channel/token route automatically

Not registered
→ Invite Counterparty
→ Create Private Claim Link
```

### Transaction progress

Expose real stages:

- checking wallet capability;
- checking registration;
- discovering notes;
- checking recipient;
- preparing channel;
- approving token;
- approval confirmed;
- requesting screening;
- generating proof;
- submitting;
- confirming;
- private output maturing;
- private output spendable.

Do not collapse all failures into `Transaction failed`.

### Privacy labels

Use:

- **Direct encrypted**;
- **Shielded payment memo**;
- **Shielded message** only after canonical E2E passes.

---

## 22. Centralized Error Model

At minimum, support:

```text
WALLET_NOT_CONNECTED
PRIVACY_WALLET_UNSUPPORTED
SENDER_NOT_REGISTERED
RECIPIENT_NOT_REGISTERED
CHANNEL_SETUP_REQUIRED
TOKEN_SETUP_REQUIRED
DISCOVERY_FAILED
DISCOVERY_RATE_LIMITED
REGISTRY_CORRUPTED
VIEWING_KEY_UNAVAILABLE
INVALID_VIEWING_KEY
INSUFFICIENT_PUBLIC_BALANCE
INSUFFICIENT_PRIVATE_BALANCE
PRIVATE_FUNDS_MATURING
NOTE_NOT_MATURE
NOTE_ALREADY_SPENT
APPROVAL_REJECTED
APPROVAL_FAILED
APPROVAL_NOT_CONFIRMED
SCREENING_REJECTED
SCREENING_UNAVAILABLE
PROVING_FAILED
PROOF_STALE
INVALID_PROOF_FACTS
PROOF_TOO_LARGE
INVALID_NONCE
PAYMASTER_FAILED
SUBMISSION_FAILED
POOL_VERSION_MISMATCH
MULTIPLE_EXTERNAL_INVOKES
USER_LINKAGE_WARNING
ESCROW_ALREADY_CLAIMED
INVALID_ESCROW_STATE
DECRYPTION_FAILED
```

Map technical errors to accurate product-facing messages without hiding the true cause.

---

## 23. Security Hardening Rules

Audit VEIL-owned code for:

- unrestricted `privacy_invoke` entry points;
- arbitrary external calls;
- arbitrary selector/target/calldata;
- unlimited approvals;
- stale allowances;
- reentrancy risk;
- unsafe state update ordering;
- double settlement;
- replay;
- commitment collisions;
- missing domain separation;
- unchecked `u256` to `u128` conversion;
- zero-value operations;
- storage spam;
- unbounded ciphertext;
- event data leaks;
- frontend trust of amount/state;
- plaintext logs;
- unsafe local storage;
- secrets in query parameters;
- secrets in analytics;
- leaked environment variables;
- unverified Pool addresses;
- chain mismatch;
- wallet/account mismatch;
- stale registry/cursor reuse;
- UI privacy mislabeling.

Use checks-effects-interactions where relevant.

For external token/protocol operations:

```text
snapshot output balance
→ execute operation
→ calculate actual delta
→ validate nonzero result
→ checked conversion
→ exact approval
→ exact OpenNoteDeposit
```

Do not re-audit or rewrite official Stwo, Virtual OS, Transaction Prover, Privacy Pool, official SDK, or official external tooling.

Review VEIL-owned contracts, adapters, integrations, configuration, frontend, indexer, and operational boundaries.

---

## 24. Infrastructure Scope

Pre-production VEIL should remain operationally lightweight.

Expected components:

- React frontend;
- minimal VEIL API;
- VEIL ciphertext/application indexer;
- database for public/ciphertext application data only;
- Starknet RPC;
- STRK20 Discovery Provider;
- proving endpoint;
- optional paymaster;
- monitoring with non-sensitive structured logs.

Do not create unnecessary microservices.

Do not store sensitive private state server-side.

Self-hosted prover is optional/fallback unless no compatible hosted or wallet route exists.

`ContractDiscoveryProvider` may be used for development and early Sepolia testing with rate limiting.

`IndexerDiscoveryProvider` is preferred for production-like environments.

---

## 25. Required Test Matrix

VEIL is not pre-production ready until the following pass.

### Contract tests

#### `VeilChannelHelper`

- valid direct encrypted invoke;
- valid privacy invoke;
- unauthorized caller;
- zero or invalid commitment;
- oversized ciphertext;
- chunk/index validation;
- event correctness;
- correct empty span.

#### `VeilOffer`

- create;
- counter;
- accept;
- reject;
- expire;
- invalid transition;
- duplicate transition;
- invalid expiry;
- unauthorized caller;
- malformed encrypted commitment.

#### `VeilClaimEscrow`

- deposit;
- duplicate commitment;
- zero token;
- zero amount;
- claim;
- wrong secret;
- missing commitment;
- double claim;
- unauthorized caller;
- exact approval;
- correct `OpenNoteDeposit`.

#### `VeilDealEscrow`

- complete happy path;
- buyer deposit;
- seller deposit;
- activate;
- release;
- refund;
- cancel;
- expiry;
- wrong participant;
- duplicate deposit;
- double release;
- double refund;
- release before active;
- wrong token;
- wrong amount;
- unauthorized Pool caller;
- balance accounting;
- exact allowance behavior.

### SDK/client tests

- viewing-key `bigint` validation;
- address `bigint` normalization;
- note maturity;
- total/spendable/maturing balance;
- discovery cursor namespace;
- registry version namespace;
- conditional proof-detail serialization;
- `tip: 0n`;
- `provingBlockId` refresh;
- nonce-cache invalidation;
- retry requires rebuild;
- wallet capability detection;
- direct versus shielded labeling;
- claim-secret URL handling;
- encryption domain separation;
- ciphertext round trip;
- payload commitment validation.

### Integration tests

- `ContractDiscoveryProvider`;
- `IndexerDiscoveryProvider` when available;
- provider switching without cursor reuse;
- registration;
- duplicate registration handling;
- recipient requirement detection;
- channel setup;
- token subchannel setup;
- private transfer;
- partial withdraw;
- separated deposit approval;
- screening failure handling;
- proof failure handling;
- stale nonce retry.

### Sepolia E2E

Use two separate accounts/devices.

Required scenarios:

1. Register Alice.
2. Register Bob.
3. Shield through a verified screening-capable route.
4. Discover private balance.
5. Transfer privately Alice→Bob.
6. Deposit + transfer.
7. Withdraw partially and create private change.
8. Payment + encrypted memo.
9. Claim-link deposit.
10. Bob registers or auto-registers and claims.
11. Double-claim rejection.
12. Offer lifecycle.
13. Deal escrow happy path.
14. Deal escrow invalid paths.
15. Direct encrypted fallback clearly labeled.
16. Failed submission followed by fresh rebuild and retry.
17. Indexer restart/reorg/cursor recovery where testable.

Pure shielded chat remains **BLOCKED** or **UNVERIFIED** unless a real successful E2E is produced.

---

## 26. Pre-Production Acceptance Criteria

VEIL may be classified **PRE-PRODUCTION READY** only when:

- this architecture source of truth exists;
- no unrelated project architecture is mixed in;
- contracts compile;
- contract tests pass;
- SDK/client tests pass;
- frontend builds without critical errors;
- API/indexer builds and runs;
- exact versions and addresses are documented;
- no secret/private state reaches the backend;
- wallet capabilities are detected honestly;
- direct messaging is labeled **Direct encrypted**;
- payment + memo real E2E succeeds;
- claim-link real E2E succeeds;
- private balance shows total/spendable/maturing correctly;
- retry logic rebuilds fresh proofs;
- FPI screening failures are handled correctly;
- known blockers are clearly documented;
- no fake or mocked success state appears in production UI;
- no placeholder transaction hashes or fabricated privacy statuses remain;
- no critical TODO is hidden;
- deployment and rollback instructions exist;
- environment validation fails fast;
- Sepolia smoke tests pass.

Pre-production does not mean mainnet ready.

Do not classify VEIL as mainnet ready without a separate focused security review, operational review, and mainnet compatibility verification.

---

## 27. Locked Implementation Order

### Phase 0 — Repository reality audit

Return:

- repository map;
- working features;
- architecture matches;
- architecture mismatches;
- unsupported assumptions;
- security/privacy violations;
- missing tests;
- missing infrastructure/config;
- exact repair plan;
- files to modify.

Mark each item:

```text
CONFIRMED
PARTIAL
BLOCKED
UNVERIFIED
MISSING
```

### Phase 1 — Architecture and configuration lock

- centralize versions, addresses, chain IDs, and endpoints;
- remove conflicting docs;
- add environment validation;
- add capability model;
- add feature-status model.

### Phase 2 — Privacy client foundation

- account adapter;
- viewing-key provider;
- local encrypted privacy profile;
- registry store;
- DiscoveryProvider adapter;
- note maturity;
- balance computation;
- proving orchestrator;
- submission and retry logic;
- typed error model.

### Phase 3 — Core financial flows

- register/autoRegister;
- Shield with separate approval;
- recipient requirements;
- private transfer;
- deposit + transfer;
- withdraw;
- warnings;
- honest UX states.

### Phase 4 — VEIL application contracts

- harden `VeilChannelHelper`;
- harden `VeilOffer`;
- implement/harden `VeilClaimEscrow`;
- harden `VeilDealEscrow`;
- complete contract tests.

### Phase 5 — Payment memo and indexing

- local memo encryption;
- payment + memo action composition;
- VEIL ciphertext indexer;
- local memo decryption;
- real two-account E2E.

### Phase 6 — Claim link

- secure secret generation;
- domain-separated commitment;
- client-only secret handling;
- safe claim URL fragment or officially safe equivalent;
- auto-register claim flow;
- E2E and double-claim test.

### Phase 7 — Offer and deal escrow UX

- offer state UX;
- counter/revise;
- accept/reject/expire;
- convert to escrow;
- buyer/seller deposits;
- release/refund/cancel;
- activity timeline.

### Phase 8 — Pre-production hardening

- remove debug logs;
- sanitize telemetry;
- verify environment handling;
- add monitoring;
- test indexer restart;
- test RPC/indexer failures;
- test unsupported-wallet states;
- run full build/test suite;
- produce final readiness report.

---

## 28. Locked Feature Status

| Feature | Status |
|---|---|
| STRK20 architecture | CONFIRMED |
| Starknet Wallet API recommended route | CONFIRMED |
| Advanced `createPrivateTransfers()` route | CONFIRMED |
| Register / autoRegister | CONFIRMED |
| Deposit / Shield protocol flow | CONFIRMED |
| Private transfer | CONFIRMED |
| Deposit + transfer | CONFIRMED |
| Withdraw | CONFIRMED |
| Channels and setup requirements | CONFIRMED |
| Note discovery | CONFIRMED |
| Discovery providers | CONFIRMED |
| Proving conventions | CONFIRMED |
| Official secret claim escrow pattern | CONFIRMED |
| Payment + encrypted memo architecture | STRONGLY SUPPORTED |
| Privy as full STRK20 wallet | UNVERIFIED |
| Direct Privy Shield | UNVERIFIED |
| Wallet API generic custom InvokeExternal | UNVERIFIED |
| Wallet-side generic VEIL encryption | UNVERIFIED |
| Pure shielded chat replay protection | UNRESOLVED |
| Real VEIL Alice/Bob Sepolia E2E | NOT YET PROVEN |

---

## 29. Non-Negotiable Working Rules

- Preserve working code unless evidence shows it is unsafe or incompatible.
- Do not silently delete the direct encrypted fallback.
- Do not invent APIs.
- Do not invent deployed addresses.
- Do not invent successful transactions.
- Do not mark mocked tests as live E2E.
- Do not hide blockers.
- Do not introduce unrelated features.
- Do not add a token, governance system, DAO, lending, swap, or generic DeFi feature.
- Do not perform broad rewrites without a concrete reason.
- Prefer small auditable modules.
- Pin dependencies exactly.
- Add comments only where they explain important security or compatibility constraints.
- Keep frontend product wording understandable.
- Keep technical details in logs and docs without leaking secrets.
- Ensure every failure state is recoverable or clearly explained.
- Run formatting, linting, type checking, contract compilation, tests, and frontend builds after each phase.
- Do not commit broken intermediate states.
- Use focused commits by phase when repository permissions allow.
- Never push secrets or populated environment files.

---

## 30. Minimum Product Proof

VEIL must not be called pre-production ready merely because it compiles.

The minimum product proof is a real two-account VEIL flow on Starknet Sepolia where:

- Alice and Bob have valid privacy identities;
- private funds are discovered correctly;
- Alice sends a private payment;
- the transaction includes an encrypted VEIL payment memo;
- Bob discovers the private note;
- Bob discovers and decrypts the memo locally;
- no backend sees viewing keys, notes, balances, or plaintext;
- the activity is labeled accurately in the frontend.

---

## 31. Required ENGINEERING.md Reference

Add this section near the top of `ENGINEERING.md`:

```md
## VEIL Source of Truth

Before auditing, planning, or modifying VEIL, read:

- `docs/VEIL_ARCHITECTURE_LOCK.md`

This document is authoritative for VEIL. Do not replace its architecture with assumptions, stale implementations, generic privacy designs, or architecture from unrelated projects.
```

If `ENGINEERING.md` does not exist, create it and include the section above.
