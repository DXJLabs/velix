# Solution

VEIL provides a private Deal Room where two parties can communicate, negotiate, attach payment context, coordinate escrow, and follow the progress of an onchain agreement from one place.

Instead of separating a deal across messaging applications, wallets, spreadsheets, escrow interfaces, and block explorers, VEIL keeps the important context connected inside a single private workspace.

Each Deal Room represents one agreement or ongoing relationship between two counterparties.

Inside that room, participants can understand:

- who they are dealing with;
- what the agreement is about;
- which terms are currently active;
- what has already been accepted or rejected;
- what payment or escrow action is expected next;
- which actions are waiting for confirmation;
- what has already been completed.

VEIL is designed to make private onchain coordination easier to understand without requiring users to manage the underlying privacy infrastructure themselves.

## One Private Workspace for the Entire Deal

A real deal is not only a payment.

It may include:

- initial discussion;
- pricing;
- deadlines;
- offer revisions;
- acceptance or rejection;
- milestone information;
- payment purpose;
- escrow conditions;
- delivery references;
- settlement progress.

VEIL connects these actions inside one Deal Room so participants do not need to reconstruct the agreement from several unrelated applications.

The Deal Room becomes the shared private source of context for both parties.

## How VEIL Solves the Problem

VEIL addresses the current fragmented workflow through five connected product layers:

1. private communication;
2. structured negotiation;
3. private payment context;
4. escrow coordination;
5. unified deal activity.

These layers are presented as one user experience rather than separate technical products.

## Private Communication

Participants can exchange messages related to the agreement without intentionally publishing the conversation as ordinary public transaction metadata.

Messages can be used to discuss:

- scope;
- price;
- deadlines;
- delivery requirements;
- revisions;
- payment expectations;
- escrow conditions;
- next actions.

Private messaging is the default and required behavior inside a Deal Room.

VEIL must not present a public or Unshield messaging option.

When the private execution path is unavailable, the product should stop the action and clearly explain the problem instead of silently sending the message through a public or legacy route.

## Structured Offer Negotiation

Ordinary chat makes it difficult to determine which terms are currently valid.

VEIL turns negotiation into a structured product flow.

A participant can:

- create an offer;
- define the relevant terms;
- submit a counter-offer;
- revise a proposal;
- accept an offer;
- reject an offer;
- view its status;
- see whether it has expired or been replaced.

The Deal Room should clearly identify the active proposal so both participants understand which terms are being considered.

Offer activity must remain private.

VEIL must not expose a public offer mode or an Unshield negotiation option.

## Private Payment Memo

A transaction amount alone may not explain why a payment exists.

VEIL allows participants to attach private payment context to the deal.

A payment memo may describe:

- invoice reference;
- milestone number;
- payment purpose;
- delivery stage;
- order reference;
- service period;
- settlement note.

The memo remains connected to the relevant Deal Room and payment flow.

This helps participants understand the meaning of a payment without relying on public notes, screenshots, or separate documents.

Payment memos are private-only.

## Escrow Coordination

VEIL provides a shared workflow for coordinating escrow between counterparties.

The Deal Room should help both parties understand:

- which agreement the escrow belongs to;
- who is expected to deposit;
- whether each side is ready;
- whether the escrow has been activated;
- which conditions must be satisfied;
- whether delivery has been acknowledged;
- whether funds are ready for release;
- whether the escrow was completed or cancelled.

VEIL does not treat escrow as an isolated balance screen.

Escrow progress remains connected to the messages, offer, payment context, and activity history that explain why the escrow exists.

All escrow coordination actions must remain private.

A public or Unshield escrow coordination mode must not be offered.

## Unified Deal Activity

VEIL combines important Deal Room events into one understandable activity history.

The activity view may include:

- new messages;
- offer creation;
- counter-offers;
- acceptance or rejection;
- payment memo preparation;
- escrow progress;
- confirmation states;
- transaction references;
- completion or failure states.

This allows participants to follow the agreement without searching through separate pages or applications.

The activity view should distinguish clearly between:

- prepared;
- awaiting approval;
- submitted;
- waiting for confirmation;
- accepted onchain;
- discovered by the recipient;
- completed;
- failed;
- cancelled.

The product must not display a successful state before the required confirmation has actually occurred.

## Clear Deal State

One of VEIL’s most important responsibilities is helping both parties understand the current state of the agreement.

At any time, users should be able to answer:

- What are we currently agreeing to?
- Which offer is active?
- Has the other party responded?
- Is a payment memo ready?
- Is escrow waiting for a deposit?
- Has an action been confirmed?
- What must happen next?
- Has the deal been completed?

VEIL should reduce ambiguity rather than reproduce the confusion of an unstructured chat history.

## Privacy by Default

Privacy is a core product rule, not an optional mode.

The following actions must use the private Deal Room flow:

- messages;
- offers;
- counter-offers;
- offer revisions;
- accept actions;
- reject actions;
- payment memos;
- escrow coordination;
- delivery references;
- settlement context.

Users should not be asked to choose between Shield and Unshield for these activities.

Private execution is the only intended product behavior.

## Meaning of Unshield

The term **Unshield** is used only in the Wallet.

It means withdrawing funds from a private balance to a public Starknet wallet balance.

Unshield does not mean:

- send a public message;
- create a public offer;
- publish a payment memo;
- negotiate publicly;
- coordinate escrow publicly;
- downgrade a failed private action to a direct transaction.

This distinction must remain consistent across the entire VEIL product and documentation.

## Product Experience

VEIL should hide unnecessary technical complexity from ordinary users.

A participant should not need to understand:

- proof generation;
- contract selectors;
- encryption internals;
- privacy registries;
- transaction compilation;
- indexer architecture.

The product should translate those technical processes into understandable states such as:

- Preparing private action;
- Waiting for wallet approval;
- Submitting;
- Waiting for confirmation;
- Confirmed;
- Available to recipient;
- Failed safely.

Technical details remain important for developers and reviewers, but they should not dominate the normal user experience.

## Main Product Capabilities

### Deal Rooms

A private workspace dedicated to one agreement or counterparty relationship.

### Private Messaging

Encrypted communication connected directly to the deal context.

### Offer and Counter-Offer Flow

Structured negotiation that makes the active terms and response status clear.

### Private Payment Memos

Payment context that remains connected to the relevant agreement.

### Escrow Coordination

A shared view of readiness, deposits, conditions, release, completion, and cancellation.

### Deal Activity

One timeline for the important communication and coordination events.

### Wallet Context

A view of account, network, balances, pending actions, and withdrawal controls.

### Counterparty Invitation

A flow for finding or inviting another participant through a supported identity or wallet address.

## Example Deal Flow

A typical VEIL agreement should work as follows:

1. Alice connects her Starknet account.
2. Alice finds Bob through a supported name or wallet address.
3. Alice opens a private Deal Room.
4. Alice and Bob discuss the work and expected payment.
5. Alice creates an offer containing the proposed terms.
6. Bob reviews the offer and submits a counter-offer.
7. Alice accepts the revised terms.
8. A private payment memo records the purpose of the payment.
9. Both parties coordinate the escrow requirements.
10. The Deal Room shows the progress of each required action.
11. Settlement occurs through the supported onchain flow.
12. Alice and Bob retain a clear private history of the agreement.

The user experience should feel like completing one coherent deal, not operating several disconnected blockchain tools.

## Who Benefits From VEIL

VEIL can support workflows such as:

- freelancers working with clients;
- buyers and sellers;
- private marketplace transactions;
- milestone-based service agreements;
- contributor and grant payments;
- organizations paying vendors;
- treasury operations;
- OTC counterparties;
- ecosystem applications requiring private deal coordination.

The same Deal Room model can be reused across different transaction types because the underlying problem is similar: participants need privacy, context, and a clear agreement state.

## What Makes VEIL Different

VEIL is not only a private messenger.

A private messenger protects communication but does not structure the agreement or connect it to payment and escrow progress.

VEIL is not only a wallet.

A wallet can sign and submit transactions but usually does not manage negotiation, terms, or private deal context.

VEIL is not only an escrow interface.

An escrow interface may manage deposits and release but does not necessarily preserve the negotiation and payment context that created the escrow.

VEIL combines these experiences around one private Deal Room.

Its product value comes from keeping communication, decisions, payment context, and coordination connected.

## Safe Failure Behavior

VEIL must fail safely.

When the required private path cannot complete, the product must:

- stop the action;
- preserve the draft where appropriate;
- explain that the action was not privately submitted;
- avoid displaying a false success state;
- avoid switching automatically to a public route;
- allow the user to retry after the problem is resolved.

Privacy must not be weakened merely to make an action appear successful.

## Current Product Status

VEIL’s Deal Room concept, product direction, primary user journeys, negotiation model, payment memo flow, escrow coordination flow, and interface structure have been defined.

Historical encrypted messaging and existing contract components provide development evidence, but they do not represent the final production architecture.

The final Privacy Pool-backed product flow remains in development.

Until the complete real Sepolia end-to-end flow has been verified, VEIL must be described as:

> **A pre-production private Deal Room for Starknet, under active development.**

The solution is defined at the product level, but production readiness still requires verified private submission, ciphertext-only public data, recipient discovery, local decryption, safe failure behavior, and no public communication fallback.
