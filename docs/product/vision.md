# Vision

VEIL’s vision is to make private onchain deals as natural, understandable, and complete as ordinary digital agreements.

Today, people may settle payments onchain, but the actual deal usually happens elsewhere. Terms are discussed in messaging applications, payment purposes are recorded manually, revisions are scattered across conversations, and escrow progress is difficult to follow.

This creates a fragmented experience:

- communication happens in one application;
- negotiation happens across multiple messages;
- payment happens in a wallet;
- transaction records appear in an explorer;
- delivery proof is stored somewhere else;
- sensitive business context may be exposed or lost.

VEIL aims to replace this fragmented process with a single private Deal Room.

Inside one Deal Room, two parties should be able to move from the first conversation to a completed agreement without exposing sensitive deal information and without losing the relationship between communication, decisions, and settlement.

## The Future VEIL Is Building

VEIL is building toward a future where a private onchain deal can follow one clear flow:

1. Two parties open a private Deal Room.
2. They discuss the purpose, scope, price, deadline, and conditions.
3. One party creates an offer.
4. The other party accepts, rejects, or submits a counter-offer.
5. Both parties can see which terms are currently active.
6. A private payment memo records the purpose of the payment.
7. Escrow progress, delivery references, and release conditions remain connected to the same deal.
8. Settlement happens onchain.
9. Both parties retain a clear private history of what was discussed, agreed, and completed.

The user should not need to reconstruct the deal from separate chat messages, wallet transactions, spreadsheets, and blockchain explorers.

## Product Vision

VEIL should become the private coordination layer for onchain agreements.

The product is designed for situations where payment alone is not enough and both parties need private context around the transaction.

This includes:

- freelance and service agreements;
- buyer and seller negotiations;
- private marketplace transactions;
- contributor and grant payments;
- milestone-based work;
- treasury and vendor payments;
- OTC and partner settlements;
- other agreements where terms, identity, timing, or payment purpose should not be publicly exposed.

VEIL is not intended to hide illegal activity or remove accountability between participants.

Its purpose is to prevent sensitive deal information from being exposed to unrelated public observers while preserving a clear and verifiable workflow for the parties involved.

## What VEIL Should Feel Like

VEIL should feel like a secure workspace for completing a deal, not like a collection of blockchain tools.

A user should immediately understand:

- who the counterparty is;
- what the deal is about;
- what terms are currently proposed;
- which offer is active;
- what action requires attention;
- whether both parties are ready;
- what payment or escrow step comes next;
- what has already been completed.

The product should reduce technical complexity rather than expose it.

Users should not need to understand proof systems, encryption internals, contract selectors, or transaction construction to coordinate a private deal.

## Privacy as the Default

Privacy is not an optional mode inside a VEIL Deal Room.

The following actions are intended to remain private:

- messages;
- offers;
- counter-offers;
- revisions;
- accept and reject actions;
- payment memos;
- escrow coordination;
- delivery references;
- settlement context.

VEIL must not ask users to choose between private and public communication for these actions.

The term **Unshield** is reserved only for withdrawing funds from a private balance to a public wallet balance.

## Product Principles

### One Deal, One Context

Messages, terms, payment references, escrow progress, and activity should remain connected to the same Deal Room.

### Privacy Without Confusion

Privacy should be the normal product behavior, not an advanced option hidden behind technical settings.

### Clear Active State

Users should always know which offer, condition, or action is currently valid.

### No Silent Downgrade

When the private execution path is unavailable, VEIL should not silently send the action through a public or legacy route.

The product should stop and show an honest error.

### Verifiable Progress

Users should be able to distinguish between:

- an action being prepared;
- waiting for confirmation;
- accepted onchain;
- discovered by the recipient;
- completed;
- failed.

### Honest Product Status

VEIL must clearly separate:

- what already works;
- what is still being developed;
- what is planned;
- what belongs to the legacy implementation.

## Long-Term Product Goal

The long-term goal is for VEIL to become reusable private deal infrastructure across the Starknet ecosystem.

Wallets, marketplaces, payment applications, contributor platforms, and organizations should be able to use VEIL’s Deal Room model without rebuilding private communication and negotiation workflows from the beginning.

VEIL should provide the product layer that connects:

- private conversation;
- structured agreement;
- payment context;
- escrow coordination;
- onchain settlement.

The final experience should make private onchain coordination feel like a complete product rather than a collection of disconnected transactions.

## Current Position

VEIL has defined its Deal Room model, primary user journeys, negotiation flow, payment memo flow, escrow coordination flow, and interface direction.

The final Privacy Pool-backed runtime is still in development.

Until the complete real Sepolia end-to-end flow is verified, VEIL should be described as:

> **Pre-production private Deal Room infrastructure under active development.**

The vision is established, but production readiness must be proven through working private execution, ciphertext-only public data, recipient discovery, local decryption, and safe failure behavior.
