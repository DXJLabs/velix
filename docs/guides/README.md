# Product Guides

These guides explain how users interact with VEIL as a private Deal Room on Starknet.

They focus on product behavior, user decisions, action states, and safe recovery.

They intentionally avoid low-level details such as:

- SDK APIs;
- ABI structures;
- cryptographic parameters;
- prover configuration;
- raw calldata;
- contract storage internals;
- indexer implementation.

Those details belong in the [Technical Documentation](../technical/README.md).

> **Current status:** VEIL is in pre-production.
>
> The guides describe the intended product experience. A flow must not be presented as production-ready until its final Privacy Pool-backed implementation has passed real two-party end-to-end verification.

## What Users Can Do in VEIL

A VEIL Deal Room allows two counterparties to:

- communicate privately;
- create and revise offers;
- accept or reject terms;
- attach private payment memos;
- coordinate escrow;
- add delivery or proof references;
- review pending and completed activity;
- manage their Starknet account and Wallet.

The product should feel like one connected deal workflow rather than a collection of unrelated blockchain actions.

## Guides

| Guide | What it explains |
| --- | --- |
| [Deal Rooms](channels.md) | How users find counterparties, open a Deal Room, understand its status, and keep one agreement organized. |
| [Messaging](messaging.md) | How private messages are prepared, submitted, received, retried, and displayed safely. |
| [Negotiation](negotiation.md) | How users create offers, submit counter-offers, accept, reject, revise, and identify the active agreement. |
| [Payment Memo](payment-memo.md) | How private payment context is connected to an offer, milestone, or settlement action. |
| [Escrow](escrow.md) | How participants review roles, deposits, readiness, activation, delivery, release, completion, and cancellation. |
| [Activity](activity.md) | How users understand drafts, approvals, submissions, confirmations, recipient availability, failures, and completed actions. |
| [Wallet](wallet.md) | How users review account information, network, balances, Wallet actions, and Unshield withdrawals. |
| [Settings](settings.md) | How users manage sessions, notifications, account controls, network information, and display preferences. |

## Recommended Reading Order

New users should read the guides in this order:

1. [Deal Rooms](channels.md)
2. [Messaging](messaging.md)
3. [Negotiation](negotiation.md)
4. [Payment Memo](payment-memo.md)
5. [Escrow](escrow.md)
6. [Activity](activity.md)
7. [Wallet](wallet.md)
8. [Settings](settings.md)

This order follows the normal product journey:

```text
Connect account
→ find or invite counterparty
→ open Deal Room
→ communicate privately
→ negotiate terms
→ attach payment context
→ coordinate escrow
→ review activity
→ manage Wallet
