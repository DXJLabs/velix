# Product Roadmap

This roadmap explains how VEIL progresses from its current pre-production state toward a complete private Deal Room product on Starknet.

The roadmap is organized by product maturity rather than by marketing deadlines.

Every item is classified as:

- **Completed**
- **In Development**
- **Planned**
- **Legacy**

A completed interface, prototype, contract, or local test does not automatically mean the complete product is production-ready.

> **Current product status:** Pre-production / active development.
>
> VEIL must not be described as production-ready until the final private Deal Room flow has succeeded end to end on Starknet Sepolia and the result can be verified from both participant sides.

---

# Product Goal

VEIL is being built as a private Deal Room where two parties can:

- communicate privately;
- negotiate offers;
- submit counter-offers;
- accept or reject terms;
- attach private payment memos;
- coordinate escrow;
- follow deal activity;
- connect settlement context to the agreement.

All Deal Room communication and coordination is private-only.

The term **Unshield** is reserved only for withdrawing funds from a private balance to a public Starknet wallet balance.

VEIL does not provide an Unshield mode for:

- messages;
- offers;
- counter-offers;
- accept or reject actions;
- payment memos;
- escrow coordination;
- delivery references.

---

# 1. Completed Product Foundations

The following foundations have already been established.

## Product Positioning

**Status: Completed**

VEIL has been defined as:

> A private Deal Room for communication, negotiation, payment context, and escrow coordination on Starknet.

The product is no longer positioned as only:

- encrypted chat;
- a smart-contract demonstration;
- an SDK wrapper;
- an isolated escrow interface.

The Deal Room is the central product model.

## Primary User Flows

**Status: Completed**

The main user journeys have been defined for:

- connecting an account;
- finding or inviting a counterparty;
- opening a Deal Room;
- sending private messages;
- creating an offer;
- submitting a counter-offer;
- accepting or rejecting terms;
- preparing a payment memo;
- coordinating escrow;
- reviewing activity;
- managing wallet actions.

These journeys may still change during implementation and testing, but the primary product direction is established.

## Interface Foundation

**Status: Completed / In Development**

VEIL has interface work covering major product areas such as:

- Home;
- Deal Rooms;
- messaging;
- offers;
- payment;
- escrow;
- activity;
- wallet;
- settings.

The existence of an interface does not prove that every underlying private action has completed end to end.

## Existing Contract and Application Components

**Status: Completed as development components**

Existing components include:

- messaging helper functionality;
- offer-related components;
- escrow-related components;
- timeline and activity structures;
- account and wallet integration work;
- indexer experiments;
- encryption and privacy research.

Some components belong to earlier architecture and must not automatically be presented as final production components.

## Historical Encrypted Messaging Evidence

**Status: Completed as Legacy evidence**

VEIL has historical encrypted onchain messaging work using the direct helper path.

This demonstrates development progress, but the direct helper is not the final production architecture.

It must be classified as:

> **Legacy — retained for historical evidence and compatibility testing.**

It must not be used as an automatic fallback when the official private path fails.

---

# 2. Current Development Phase

The current phase focuses on replacing legacy assumptions with the final official Privacy Pool-backed product path.

## Official Privacy Runtime Integration

**Status: In Development**

VEIL is integrating the official Starknet Privacy SDK as the source of truth for the final private runtime.

The official runtime is responsible for the privacy operations required to establish and use private participant relationships.

At the product level, this work should result in understandable user states such as:

- Preparing private Deal Room;
- Waiting for approval;
- Establishing private connection;
- Waiting for confirmation;
- Private Deal Room ready;
- Private action failed.

Users should not need to understand the internal proof, registry, key, or transaction-construction process.

## Final Private Messaging Flow

**Status: In Development**

The target flow must prove that:

1. Alice opens or prepares a private Deal Room with Bob.
2. Alice submits a private message.
3. The message is processed through the official privacy path.
4. Publicly observable application data does not contain the plaintext message.
5. Bob discovers the intended private action.
6. Bob decrypts and reads the original message locally.
7. Both devices display accurate action states.

A sender-side success message alone is not enough.

## Private Negotiation Flow

**Status: In Development**

The following actions must use the final private Deal Room path:

- offer creation;
- counter-offer;
- offer revision;
- acceptance;
- rejection;
- expiry-related coordination.

The final product must ensure that both participants see:

- the same active offer;
- the same status;
- the correct action available to each side;
- previous proposals as history rather than active terms.

## Private Payment Memo Flow

**Status: In Development**

Payment memos must remain connected to:

- the correct Deal Room;
- the correct counterparty;
- the accepted offer or milestone;
- the related payment or settlement action.

The product must not offer a public memo or Unshield memo mode.

## Private Escrow Coordination

**Status: In Development**

The product is being developed to support private coordination of:

- escrow preparation;
- participant roles;
- deposit readiness;
- activation;
- delivery progress;
- release conditions;
- completion;
- cancellation.

Earlier public or stateful escrow components must not be treated as proof that the final private coordination flow is complete.

## Ciphertext-Only Discovery

**Status: In Development**

The application’s discovery and indexing layer must handle only public information required to locate encrypted Deal Room activity.

It must not receive or store:

- viewing keys;
- private channel keys;
- application encryption keys;
- plaintext messages;
- plaintext offers;
- plaintext payment memos;
- plaintext escrow terms.

Decryption must occur only in the intended participant’s local runtime.

## Honest Product Status

**Status: In Development**

All screens must distinguish accurately between states such as:

- Draft;
- Preparing;
- Waiting for approval;
- Submitted;
- Waiting for confirmation;
- Confirmed;
- Available to recipient;
- Completed;
- Failed;
- Cancelled;
- Expired.

The interface must not display:

- Delivered when only submitted;
- Completed when only locally prepared;
- Private when a legacy or public path was used;
- Sepolia success when only a local test passed;
- production-ready when acceptance gates remain incomplete.

---

# 3. Near-Term Product Milestones

## Milestone 1 — Official Local Two-Party Flow

**Status: In Development**

The first milestone is a complete local two-party private messaging flow using the official Privacy Pool architecture.

The expected result is:

1. Alice and Bob use separate participant environments.
2. A private participant relationship is established.
3. Alice submits a typed private message.
4. The VEIL helper stores the encrypted payload.
5. Bob discovers and decrypts the exact message.
6. Repeated submission of the same protected action is rejected safely.
7. No legacy direct fallback is used.

This milestone proves functional integration but does not prove real network production readiness.

## Milestone 2 — Deal Room Product Integration

**Status: Planned after Milestone 1**

After the official private flow is proven, the product interface will be connected to the verified runtime.

This includes:

- Deal Room setup;
- message submission;
- recipient discovery;
- accurate message states;
- failure and retry handling;
- two-device consistency;
- removal of legacy communication options from active product flows.

## Milestone 3 — Private Negotiation Actions

**Status: Planned**

The verified runtime will be extended to support typed private actions for:

- offer creation;
- counter-offer;
- offer revision;
- acceptance;
- rejection.

The active-offer state must remain consistent between Alice and Bob.

## Milestone 4 — Private Payment Memo

**Status: Planned**

Payment memo actions will be connected to:

- accepted terms;
- milestone context;
- payment review;
- Deal Room activity;
- recipient discovery.

## Milestone 5 — Private Escrow Coordination

**Status: Planned**

Escrow coordination will be migrated into the verified private Deal Room action model.

The product must prove that both participants see consistent:

- roles;
- requirements;
- readiness;
- progress;
- completion or cancellation state.

## Milestone 6 — Ciphertext-Only Activity and Indexing

**Status: Planned**

The activity system will be updated so that:

- public services index only encrypted records and public commitments;
- the recipient performs local discovery and decryption;
- the server does not interpret private Deal Room meaning;
- old event assumptions are removed;
- activity states match actual transaction and recipient status.

---

# 4. Real Sepolia End-to-End Milestone

**Status: Planned / required before production claims**

After the local official runtime works, VEIL must complete a real Starknet Sepolia end-to-end test.

The test must involve at least two distinct participant environments.

## Required Sepolia Flow

The test must prove:

1. Alice connects a supported Starknet Sepolia account.
2. Bob connects a different supported Starknet Sepolia account.
3. Alice prepares a private Deal Room with Bob.
4. The required private setup transaction is accepted.
5. Alice submits a private Deal Room action.
6. The official Privacy Pool processes the action.
7. The Privacy Pool invokes the VEIL helper.
8. The helper stores ciphertext and an appropriate public commitment.
9. Publicly observable application data does not contain private plaintext.
10. Bob discovers the incoming action.
11. Bob decrypts the original action locally.
12. Alice and Bob see consistent Deal Room status.
13. A duplicate or invalid submission fails safely.
14. No direct helper fallback is used.

## Required Evidence

The test report should contain only safe and verifiable evidence such as:

- network;
- component versions;
- contract addresses;
- transaction hashes;
- accepted receipt status;
- helper event reference;
- encrypted payload size;
- recipient discovery result;
- decryption success as a boolean;
- duplicate-rejection result;
- redacted timing information.

The report must not expose:

- private keys;
- viewing keys;
- channel keys;
- application encryption keys;
- plaintext private actions in logs;
- private registries;
- raw proof requests or responses;
- authentication secrets.

## Sepolia Result Labels

The result must use one of these labels:

- **WORKS**
- **PARTIAL**
- **BLOCKED**

A blocked or partial result must not be rewritten as a successful production test.

---

# 5. Product Experience Hardening

**Status: Planned**

After the final private action path works, VEIL will focus on making the full product reliable and understandable.

## Deal Room Clarity

Improve:

- counterparty identity presentation;
- active-offer visibility;
- pending action indicators;
- unread activity;
- next-action guidance;
- completed deal summaries;
- consistent status across devices.

## Safe Failure and Recovery

Every private action must:

- preserve drafts where appropriate;
- show whether anything was submitted;
- avoid false success;
- avoid automatic public fallback;
- provide a safe retry path;
- explain failure in understandable language.

## Two-Device Consistency

Alice and Bob must see consistent:

- counterparty information;
- active offer;
- message history;
- payment memo state;
- escrow progress;
- activity timeline.

## Wallet Separation

The Wallet must remain separate from Deal Room communication.

The term **Unshield** may appear only for:

> Withdrawing funds from a private balance to a public wallet balance.

## Mobile and Desktop Experience

The primary product journey should work clearly on:

- mobile devices;
- desktop browsers;
- two-device demonstrations.

Important actions must not depend on a layout that is only understandable on one screen size.

---

# 6. Documentation and Demonstration Milestones

## Product Screenshots

**Status: Planned**

Capture real product screenshots for:

- Home;
- account connection;
- Deal Room list;
- counterparty invitation;
- private messaging;
- offer creation;
- counter-offer;
- accepted agreement;
- payment memo;
- escrow progress;
- activity;
- wallet;
- safe failure;
- Alice and Bob two-device results.

Screenshots must not imply capabilities that are not working.

## Two-Device Demo Video

**Status: Planned**

The final demonstration should show:

1. Alice opens or creates the Deal Room.
2. Bob joins from another account or device.
3. Alice sends a private action.
4. Bob receives and reads it.
5. Bob responds.
6. Both participants see the same active offer.
7. Payment memo or escrow progress is shown.
8. Activity reflects accurate confirmation states.

## Current Status Documentation

**Status: In Development**

Maintain one clear status page that distinguishes:

- completed work;
- active development;
- planned features;
- legacy components;
- local test results;
- Sepolia results;
- known blockers.

This prevents README, product pages, SDK documentation, and deployment documentation from making contradictory claims.

---

# 7. Security and Readiness Phase

**Status: Planned**

## Security Review

Review at minimum:

- private action boundaries;
- encryption usage;
- key handling;
- replay protection;
- recipient discovery;
- indexer boundaries;
- transaction-state handling;
- logging;
- wallet authorization;
- failure behavior;
- escrow authorization.

## Independent Audit

A formal independent audit should be completed before meaningful production custody or mainnet claims are made.

The audit scope may include:

- smart contracts;
- application privacy boundaries;
- official SDK integration;
- wallet and relayer interaction;
- indexer behavior;
- escrow and settlement logic.

## Operational Readiness

Before public production use, VEIL should have:

- supported deployment configuration;
- monitoring;
- incident response process;
- version compatibility policy;
- recovery procedures;
- clear user warnings;
- known limitation documentation;
- test-account separation;
- secret-management policy.

---

# 8. Settlement and Ecosystem Expansion

**Status: Planned**

These items come after the core private Deal Room flow is stable.

## Settlement Adapters

Support selected settlement paths without turning VEIL into a general exchange or wallet replacement.

Possible future settlement integration may include:

- supported token transfers;
- milestone settlement;
- escrow release;
- partner payment execution.

No adapter should be documented as supported until it is implemented and tested.

## Marketplace Integration

Allow marketplaces to use VEIL for:

- private buyer–seller negotiation;
- order-specific Deal Rooms;
- private payment memos;
- escrow coordination;
- delivery references.

## Wallet and Payment Application Integration

Allow supported applications to open or connect to a VEIL Deal Room around a payment.

## Contributor and Grant Platform Integration

Support private coordination around:

- assignments;
- milestones;
- delivery;
- approval;
- payment context.

## Organization and Treasury Integration

Explore workflows for:

- vendor payments;
- contributor payments;
- recurring service agreements;
- operational settlement context.

These integrations must preserve the distinction between private operational context and any public accountability required by the organization.

---

# 9. Longer-Term Product Direction

**Status: Planned**

## Richer Delivery References

Improve support for references connected to:

- milestone completion;
- documents;
- repositories;
- invoices;
- digital deliverables;
- external evidence.

## Dispute Context

Allow participants to preserve private context related to:

- missed deadlines;
- rejected delivery;
- cancellation;
- release disagreement;
- supporting references.

VEIL must not claim automatic arbitration or legal enforcement unless those systems are separately implemented.

## Reusable Deal Templates

Potential templates may include:

- freelance milestone;
- marketplace sale;
- vendor agreement;
- contributor payment;
- grant milestone;
- digital-goods delivery.

Templates should simplify user experience without weakening privacy or forcing unsuitable terms.

## Multiple Deals With the Same Counterparty

Allow users to maintain separate Deal Rooms for different agreements with the same counterparty so terms and activity do not become mixed.

## Partner Integration Guides

Create clear guides for wallets, marketplaces, contributor platforms, and escrow providers after the integration interfaces are stable.

## Mainnet Preparation

Mainnet preparation begins only after:

- real Sepolia E2E succeeds;
- security review is complete;
- critical issues are resolved;
- operational readiness exists;
- supported component versions are confirmed;
- user-facing limitations are documented.

---

# 10. Legacy Retirement Plan

**Status: Planned**

The legacy direct helper path must not remain an invisible production fallback.

After the official private runtime is verified:

1. remove direct/public communication choices from active UI;
2. stop active product flows from calling the direct helper;
3. retain historical evidence in legacy documentation;
4. update examples and tests;
5. clearly label any compatibility-only code;
6. prevent accidental use by new product features.

Legacy code should only be deleted after:

- replacement behavior is proven;
- dependencies are identified;
- migration impact is documented;
- historical reports are preserved.

---

# Production Readiness Gate

VEIL may only be described as production-ready when all required items below are satisfied.

## Private Communication

- [ ] Official private participant setup succeeds.
- [ ] Alice submits a private message.
- [ ] Bob discovers and decrypts the exact message.
- [ ] Public application data contains no message plaintext.
- [ ] No direct fallback is used.

## Negotiation

- [ ] Offer creation is private.
- [ ] Counter-offer is private.
- [ ] Accept and reject actions are private.
- [ ] Both parties see the same active offer.
- [ ] Expired and replaced offers are handled correctly.

## Payment Memo

- [ ] Memo content remains private.
- [ ] Memo is connected to the correct Deal Room and agreement.
- [ ] Both parties see consistent memo state.

## Escrow Coordination

- [ ] Escrow coordination actions are private.
- [ ] Both parties see consistent roles and progress.
- [ ] Release and cancellation permissions are enforced.
- [ ] Product status matches actual onchain state.

## Discovery and Indexing

- [ ] Indexer receives ciphertext-only public information.
- [ ] Indexer receives no viewing key.
- [ ] Indexer receives no private channel key.
- [ ] Indexer receives no plaintext Deal Room action.
- [ ] Recipient decryption occurs locally.

## Security

- [ ] Duplicate actions are rejected safely.
- [ ] Private material is absent from logs.
- [ ] Failed private actions do not fall back publicly.
- [ ] Wallet authorization is verified.
- [ ] Independent security review is completed for the intended production scope.

## Product Experience

- [ ] Mobile and desktop flows work.
- [ ] Alice and Bob see consistent deal state.
- [ ] Pending, confirmed, completed, and failed states are accurate.
- [ ] No false delivery or success labels exist.
- [ ] Unshield appears only in Wallet withdrawal.

## Network Evidence

- [ ] Final real Sepolia E2E passes.
- [ ] Transaction and recipient evidence is documented.
- [ ] Deployment addresses are verified.
- [ ] Component versions are compatible.
- [ ] Mainnet deployment has a separate reviewed plan.

Until these requirements are satisfied, the correct product description remains:

> **VEIL is a pre-production private Deal Room for Starknet under active development.**

---

# Roadmap Summary

| Phase | Main Outcome | Status |
|---|---|---|
| Product foundation | Deal Room concept, core flows, interface direction | Completed |
| Legacy encrypted path | Historical direct helper evidence | Legacy |
| Official privacy runtime | Final private participant and action path | In Development |
| Private messaging | Alice sends, Bob discovers and decrypts | In Development |
| Negotiation | Private offer, counter, accept, and reject | Planned |
| Payment memo | Private payment context connected to agreement | Planned |
| Escrow coordination | Private two-party escrow progress | Planned |
| Ciphertext-only activity | Public indexing without private keys or plaintext | Planned |
| Real Sepolia E2E | Verified two-party network flow | Planned |
| Product hardening | Accurate states, safe failure, mobile and desktop | Planned |
| Security review | Contract and application privacy review | Planned |
| Ecosystem integration | Wallet, marketplace, contributor, and partner flows | Planned |
| Mainnet readiness | Reviewed and operational production release | Planned |

---

# Final Roadmap Principle

VEIL should progress through verified product milestones rather than marketing claims.

The order is:

```text
Prove one private action
→ connect it to the Deal Room
→ verify both participants
→ expand to structured negotiation
→ add payment memo
→ add private escrow coordination
→ prove real Sepolia E2E
→ harden product and security
→ integrate partners
→ prepare mainnet
