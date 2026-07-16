# Core Features

VEIL combines private communication, structured negotiation, payment context, and escrow coordination inside one Deal Room.

The product is designed around a simple principle:

> A deal should remain understandable from the first conversation to the final settlement without exposing sensitive coordination to unrelated public observers.

This page explains the main product capabilities of VEIL and the current status of each feature.

## Feature Status

VEIL uses the following status labels:

| Status | Meaning |
|---|---|
| **Completed** | The feature or component exists and has specific implementation or test evidence |
| **In Development** | The product flow is defined or partially implemented, but the final acceptance criteria have not yet been completed |
| **Planned** | The feature is part of the intended product but does not yet have a verified implementation |
| **Legacy** | An older implementation exists but is not part of the final production architecture |

A feature may have a completed interface or prototype while its final private execution path remains in development.

---

## 1. Deal Room

**Status: In Development**

A Deal Room is the central workspace for one agreement or counterparty relationship.

Instead of spreading a deal across chat applications, wallets, spreadsheets, escrow pages, and block explorers, VEIL keeps the relevant context together.

A Deal Room may contain:

- private messages;
- active and previous offers;
- counter-offers;
- acceptance and rejection activity;
- payment memos;
- escrow progress;
- delivery or proof references;
- transaction references;
- pending actions;
- completed actions;
- failed or cancelled actions.

The Deal Room should help both participants answer:

- What is this deal about?
- Who is the counterparty?
- Which offer is currently active?
- What has already been agreed?
- What action requires attention?
- Is payment or escrow waiting for confirmation?
- What must happen next?
- Has the agreement been completed?

### Product Requirement

The Deal Room must not expose a public communication mode.

All communication and coordination inside the room is intended to remain private.

---

## 2. Counterparty Search and Invitation

**Status: In Development**

Users need a clear way to find or invite the person they want to deal with.

The product flow should support:

- searching by supported Starknet name;
- entering a wallet address;
- checking whether the counterparty can participate;
- generating an invitation link;
- showing when an invitation is waiting;
- showing when the counterparty has joined;
- confirming that the correct participant entered the Deal Room.

The interface should avoid presenting raw technical identifiers unless they are necessary.

Users should be able to recognize their counterparty through understandable account information while still being able to verify the underlying wallet address.

### Expected States

The invitation flow may show states such as:

- Counterparty found;
- Invitation created;
- Waiting for counterparty;
- Counterparty joined;
- Identity ready;
- Invitation expired;
- Invitation failed.

---

## 3. Private Messaging

**Status: In Development**

Private messaging allows participants to discuss the agreement inside the same workspace where offers, payment context, and escrow progress are managed.

Messages may be used to discuss:

- scope;
- price;
- deadlines;
- revisions;
- delivery requirements;
- payment expectations;
- escrow conditions;
- next actions.

Messaging is not an optional privacy mode.

All Deal Room messages are intended to use the private execution path.

VEIL must not offer:

- public messages;
- Unshield messages;
- automatic fallback to a direct public transaction;
- a silent downgrade when private execution fails.

### User Experience

The messaging interface should clearly distinguish between:

- draft;
- waiting for wallet approval;
- preparing private action;
- submitting;
- waiting for confirmation;
- available to recipient;
- failed;
- retry required.

A message must not appear as successfully delivered before the required confirmation and retrieval steps have completed.

### Legacy Note

VEIL has a historical direct encrypted helper implementation.

That path is useful as development evidence, but it is not the final production messaging architecture.

---

## 4. Offer Negotiation

**Status: In Development**

Offer negotiation turns an unstructured conversation into a clear agreement flow.

A participant should be able to:

- create an offer;
- define the proposed terms;
- set an expiry when appropriate;
- review the offer before submitting it;
- submit a counter-offer;
- revise a proposal;
- accept an offer;
- reject an offer;
- see whether an offer has expired;
- see whether an offer was replaced by a newer proposal.

The Deal Room must clearly identify which offer is currently active.

Older offers should remain visible as part of the history, but they must not be confused with the current proposal.

### Offer Information

Depending on the deal type, an offer may include:

- asset;
- amount;
- price;
- quantity;
- deadline;
- milestone;
- delivery requirement;
- expiry;
- escrow requirement;
- additional private terms.

### Privacy Rule

The following actions are private-only:

- offer creation;
- counter-offer;
- offer revision;
- acceptance;
- rejection;
- expiry-related coordination.

VEIL must not provide an Unshield offer mode.

---

## 5. Private Payment Memo

**Status: In Development**

A payment memo records why a payment is being prepared or made.

A token amount and transaction hash may prove that a transfer happened, but they do not explain its business purpose.

A private payment memo may contain:

- invoice reference;
- milestone number;
- order reference;
- service period;
- delivery stage;
- payment purpose;
- settlement note;
- internal reference;
- additional context agreed by both parties.

The memo should remain connected to the relevant Deal Room and payment action.

### Product Value

Private payment memos help participants avoid relying on:

- public transaction notes;
- screenshots;
- external spreadsheets;
- separate chat messages;
- manually matched transaction hashes.

### Privacy Rule

Payment memos are private-only.

There must be no public memo mode and no Unshield memo option.

---

## 6. Escrow Coordination

**Status: In Development**

Escrow coordination helps two parties follow the steps required before funds can be released.

The product should make it clear:

- which agreement the escrow belongs to;
- who is acting as buyer and seller;
- what each party must provide;
- whether deposits are required;
- whether each deposit has been confirmed;
- whether the escrow is active;
- what release conditions apply;
- whether delivery has been acknowledged;
- whether settlement is ready;
- whether the escrow was completed or cancelled.

### Expected Escrow Flow

A typical escrow flow may include:

1. Escrow terms prepared.
2. Both parties review the conditions.
3. Required deposits are identified.
4. Buyer deposit is confirmed.
5. Seller deposit is confirmed when applicable.
6. Escrow becomes active.
7. Delivery or milestone progress is recorded.
8. Release conditions are reviewed.
9. Funds are released or the escrow is cancelled.
10. Final status is recorded in Deal Room activity.

### Product Requirement

The interface should show the responsibility of each participant clearly.

Users should not need to guess:

- who has already deposited;
- who still needs to act;
- whether the escrow is active;
- whether release is currently allowed;
- why an escrow was cancelled.

### Privacy Rule

Escrow coordination is private-only.

There must be no Unshield escrow coordination mode.

### Legacy Note

VEIL contains earlier public/stateful escrow components.

They may remain as historical implementation evidence, but they must not be presented as proof that the final private escrow coordination flow is complete.

---

## 7. Proof and Delivery References

**Status: Planned / In Development**

Some agreements require evidence that a task, product, or milestone has been delivered.

VEIL should allow participants to attach references related to:

- delivery confirmation;
- milestone completion;
- invoice;
- order;
- document;
- content hash;
- repository contribution;
- external proof location.

The purpose is not necessarily to store full private files onchain.

The product should preserve a meaningful reference to the evidence while avoiding unnecessary public exposure of the underlying business information.

### Product Requirement

A reference must remain connected to:

- the relevant Deal Room;
- the offer or milestone it supports;
- the payment or escrow action it affects.

Future versions may provide richer verification and dispute-reference flows.

---

## 8. Deal Activity

**Status: In Development**

The Activity view combines the important events of a Deal Room into one timeline.

It may include:

- message activity;
- invitation updates;
- offer creation;
- counter-offers;
- acceptance;
- rejection;
- payment memo activity;
- escrow preparation;
- deposit confirmation;
- escrow activation;
- release;
- settlement;
- cancellation;
- transaction references;
- failures and retries.

### Activity States

VEIL should use clear and honest states such as:

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

- “Completed” when an action is only locally prepared;
- “Delivered” when only submission has occurred;
- “Confirmed” before the required receipt exists;
- “Private” when the final private path was not actually used.

### Product Value

The Activity view gives both parties a shared understanding of what happened and what still requires attention.

---

## 9. Wallet

**Status: In Development**

The Wallet section gives users a clear view of the account and funds connected to VEIL.

It may display:

- connected account;
- wallet or account source;
- Starknet network;
- public wallet balance;
- private balance readiness;
- pending wallet actions;
- transaction references;
- withdrawal controls;
- logout or disconnect action.

The Wallet should not be mixed with the Deal Room communication interface.

Its purpose is to help users understand the financial state related to their account.

### Meaning of Unshield

The term **Unshield** is used only in the Wallet.

Unshield means:

> Withdraw funds from a private balance to a public Starknet wallet balance.

Unshield does not mean:

- send a public message;
- create a public offer;
- publish a payment memo;
- coordinate escrow publicly;
- retry a failed private action through a direct route.

### User Confirmation

Before an Unshield withdrawal, the product should clearly explain that:

- funds will move to a public wallet balance;
- the resulting onchain activity may be publicly visible;
- the action is different from private Deal Room communication.

---

## 10. Settings

**Status: In Development**

Settings allow users to manage their VEIL experience without weakening the private-only model.

Settings may include:

- notification preferences;
- account information;
- connected wallet information;
- session management;
- network information;
- security controls;
- display preferences;
- transaction confirmation preferences;
- logout or disconnect controls.

### Settings That Must Not Exist

VEIL should not provide settings such as:

- default public messaging;
- Unshield communication mode;
- public offer mode;
- public escrow coordination mode;
- automatic fallback from private to public execution.

Privacy for Deal Room actions is a product rule, not a user preference that can be disabled.

---

## 11. Safe Failure and Recovery

**Status: In Development**

Private actions may fail because of:

- wallet rejection;
- network problems;
- proof generation failure;
- transaction rejection;
- unavailable service;
- expired request;
- recipient discovery problems;
- contract validation failure.

VEIL must handle these failures honestly.

When an action cannot complete privately, the product should:

- stop the action;
- preserve the draft when appropriate;
- explain what failed in understandable language;
- avoid displaying a false success state;
- avoid automatically switching to a public route;
- allow the user to retry safely.

Privacy must not be weakened merely to make the interface appear functional.

---

## 12. Two-Party Deal Experience

**Status: In Development**

VEIL is designed for a real two-party experience.

The final product must demonstrate that:

- Alice can create or open a Deal Room;
- Bob can join the same Deal Room;
- both participants see the correct counterparty;
- Alice can send a private action;
- Bob can discover and read the action;
- Bob can respond;
- both parties see consistent offer and escrow status;
- Activity reflects the correct sequence;
- private information is not exposed through public product metadata.

A single-device interface demonstration is not enough to prove the complete Deal Room experience.

---

## Privacy Is Not a Separate Feature

VEIL does not treat privacy as an optional feature that users enable for selected actions.

Privacy is the default behavior of the Deal Room itself.

Therefore, the final product does not include separate feature sections called:

- Shield Mode;
- Unshield Mode for communication;
- Direct public messaging;
- Public negotiation.

The intended rule is:

| Action | Product behavior |
|---|---|
| Message | Private-only |
| Offer | Private-only |
| Counter-offer | Private-only |
| Accept or reject | Private-only |
| Payment memo | Private-only |
| Escrow coordination | Private-only |
| Delivery reference | Private-only |
| Wallet withdrawal from private balance | Unshield |

---

## Current Product Reality

VEIL currently has:

- a defined Deal Room product model;
- messaging, negotiation, payment memo, escrow, wallet, and activity flows;
- existing interface work;
- historical encrypted messaging evidence;
- existing helper, offer, and escrow components;
- ongoing migration toward the final official Privacy Pool-backed runtime.

VEIL does not yet claim:

- production readiness;
- complete private execution for every feature;
- real Sepolia end-to-end success for the final architecture;
- production custody or settlement guarantees;
- completed independent security review;
- mainnet readiness.

Until the final private flow is verified end to end, VEIL should be described as:

> **A pre-production private Deal Room for Starknet under active development.**
