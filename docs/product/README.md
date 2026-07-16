# VEIL Product Documentation

VEIL is a private deal room built for people who need to communicate, negotiate, attach payment context, and coordinate escrow on Starknet without exposing sensitive deal information by default.

This section explains VEIL from the perspective of users, grant reviewers, ecosystem partners, potential adopters, and other non-technical readers.

Technical implementation details such as the Starknet Privacy SDK, proof generation, Outside Execution, contract interfaces, encryption, and indexer architecture are documented separately in the architecture and technical sections.

> **Product status:** Pre-production / in development.
>
> VEIL's product direction, core user journeys, and interface flows are already defined. However, VEIL must not be described as production-ready until the complete Privacy Pool flow succeeds end to end on Starknet Sepolia, including private submission, ciphertext storage, recipient discovery, and local decryption.

## What Is VEIL?

VEIL is a private workspace for coordinating an agreement between two parties.

Each agreement takes place inside a **Deal Room** where participants can:

- exchange private messages;
- discuss the scope and terms of a deal;
- create offers and counter-offers;
- accept or reject proposed terms;
- attach a private memo to a payment;
- coordinate escrow progress;
- review the history and current status of the deal.

VEIL is not intended to be only a private chat application.

The product connects private communication with the actions needed to move a deal from discussion to agreement and eventually to settlement.

## Why VEIL Exists

Onchain payments provide transparent and verifiable settlement, but the surrounding business context may be sensitive.

A transaction can reveal more than the amount transferred. It may expose:

- who is working with whom;
- what price was negotiated;
- the purpose of the payment;
- delivery deadlines;
- milestone information;
- commercial relationships;
- the timing and progress of an agreement.

Today, this information is commonly divided across messaging applications, wallets, spreadsheets, payment references, and blockchain explorers.

VEIL brings that context into one private Deal Room so both parties can understand what has been discussed, agreed upon, completed, or still requires action.

## Product Positioning

VEIL is a user-facing product, not merely an SDK, smart contract, or privacy infrastructure experiment.

The SDK, contracts, helper, encryption layer, indexer, and Privacy Pool integration exist to support the Deal Room experience.

The product promise is:

- keep sensitive deal communication private;
- keep negotiation and payment context together;
- make active terms easy to understand;
- coordinate escrow without relying on scattered tools;
- provide a clear timeline of important actions;
- reduce the amount of blockchain knowledge required from users.

## Core Product Rule

All deal communication and coordination inside VEIL is private-only.

This applies to:

- messages;
- payment memos;
- offers;
- counter-offers;
- offer revisions;
- accept actions;
- reject actions;
- escrow coordination;
- delivery and settlement references.

Users must not be presented with a public or Unshield mode for these actions.

## Meaning of Unshield

**Unshield is not a communication mode.**

The term is used only in the Wallet section when a user withdraws funds from a private balance to a public Starknet wallet balance.

It must not be used for:

- messages;
- offers;
- payment memos;
- negotiation;
- escrow coordination;
- Deal Room activity.

## Intended Audience

This product documentation is written for:

| Audience | Purpose |
|---|---|
| Users | Understand what VEIL does and how a Deal Room works |
| Grant reviewers | Understand the problem, solution, innovation, maturity, and roadmap |
| Ecosystem teams | Understand how VEIL can support private Starknet activity |
| Partners | Understand possible integrations and use cases |
| Potential adopters | Evaluate whether VEIL fits their payment or coordination workflow |
| Product contributors | Maintain consistent product terminology and user journeys |

Developers who need implementation details should continue to the architecture and technical documentation after understanding the product context.

## Documentation Order

Read the product documentation in this order:

1. [Vision](vision.md)  
   The long-term product direction and the experience VEIL aims to create.

2. [Problem](problem.md)  
   The privacy and coordination problems faced by people conducting onchain deals.

3. [Solution](solution.md)  
   How VEIL addresses those problems through private Deal Rooms.

4. [Core Features](core-features.md)  
   The main product capabilities and the current status of each feature.

5. [Use Cases](use-cases.md)  
   Examples of users, organizations, and workflows that could benefit from VEIL.

6. [User Journey](user-journey.md)  
   The expected flow from connecting a wallet to completing a deal.

7. [Screenshots](screenshots.md)  
   The visual materials required for documentation, demos, grants, and presentations.

8. [FAQ](faq.md)  
   Answers to common questions from users, reviewers, and partners.

9. [Roadmap](roadmap.md)  
   A clear separation between completed work, active development, planned features, and legacy components.

## Product Status Definitions

VEIL documentation uses four status labels.

### Completed

A product flow, interface component, contract component, or test has been implemented and has specific evidence.

Completed does not automatically mean production-ready.

### In Development

The product direction or implementation exists, but the complete acceptance criteria have not yet been satisfied.

Most of the final Privacy Pool-backed Deal Room flow is currently in this category.

### Planned

The feature or integration is part of the intended product direction but does not yet have a verified implementation.

### Legacy

An older implementation remains available as historical evidence or a temporary compatibility path, but it is not the final production architecture.

The direct encrypted helper path belongs in this category.

## Current Product Reality

VEIL currently has:

- a defined private Deal Room product concept;
- documented messaging, negotiation, payment memo, escrow, wallet, and activity flows;
- interface prototypes;
- existing helper, offer, and escrow components;
- historical encrypted onchain messaging demonstrations;
- ongoing integration work with the official Starknet Privacy SDK and Privacy Pool.

VEIL does not yet claim:

- production readiness;
- complete real Sepolia end-to-end privacy;
- production custody of user funds;
- completed private settlement;
- independent security audit;
- mainnet readiness.

These claims must remain unavailable until they are supported by verifiable implementation and testing evidence.
