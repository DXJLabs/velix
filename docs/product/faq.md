# Frequently Asked Questions

This page answers common questions from users, grant reviewers, ecosystem teams, partners, and developers evaluating VEIL.

> **Current status:** VEIL is a pre-production private Deal Room for Starknet under active development.
>
> The product model, primary user journeys, interface direction, and several development components already exist. However, VEIL must not be described as production-ready until the final Privacy Pool-backed flow has been verified end to end on Starknet Sepolia.

---

## What is VEIL?

VEIL is a private Deal Room for coordinating onchain agreements on Starknet.

Inside one Deal Room, two parties can manage:

- private messages;
- offers and counter-offers;
- acceptance or rejection;
- payment memos;
- escrow coordination;
- delivery or proof references;
- deal activity;
- settlement context.

VEIL is designed to keep the conversation and decisions surrounding an onchain payment connected in one understandable product flow.

---

## What problem does VEIL solve?

Onchain payments are transparent and verifiable, but the context surrounding a deal may be sensitive.

Users may need to discuss:

- price;
- scope;
- deadlines;
- milestones;
- payment purpose;
- delivery conditions;
- escrow requirements;
- cancellation or release decisions.

Today, this information is often divided between messaging applications, documents, wallets, escrow interfaces, and block explorers.

VEIL brings those activities together inside one private Deal Room.

---

## Is VEIL only a private messaging application?

No.

Private messaging is one part of the product, but VEIL is designed for the complete deal-coordination process.

A normal private messenger may protect conversation content, but it does not necessarily provide:

- structured offers;
- active-term tracking;
- payment memo context;
- escrow progress;
- connected transaction activity;
- a completed-deal summary.

VEIL combines these capabilities around one agreement.

---

## Is VEIL an SDK?

No.

VEIL is a user-facing product.

The SDK, smart contracts, encryption layer, indexer, and Privacy Pool integration support the product, but they are not the main product experience.

Users should experience VEIL as a Deal Room, not as a collection of developer tools.

---

## What is a Deal Room?

A Deal Room is a private workspace for one agreement or counterparty relationship.

It keeps the important parts of a deal together, including:

- participants;
- messages;
- current offer;
- previous proposals;
- payment context;
- escrow progress;
- pending actions;
- completed activity.

A Deal Room should allow both participants to understand:

- what the deal is about;
- which terms are active;
- what has already been agreed;
- what action is required next;
- whether the deal is pending, active, completed, or cancelled.

---

## Who can use VEIL?

VEIL is intended for users and organizations that need private coordination around onchain payments.

Possible users include:

- freelancers and clients;
- buyers and sellers;
- marketplaces;
- contributors and project teams;
- grant recipients;
- vendors and organizations;
- treasury operators;
- OTC or business counterparties;
- wallets and payment applications;
- escrow providers.

These use cases describe the intended product direction. They must not be presented as production integrations until implemented and verified.

---

## What is Shield mode?

VEIL should not treat **Shield** as an optional communication mode.

Privacy is the default behavior of the Deal Room.

Users should not need to choose Shield before sending:

- a message;
- an offer;
- a counter-offer;
- an acceptance or rejection;
- a payment memo;
- an escrow coordination action.

The private execution path is the intended product path.

---

## What is Unshield?

**Unshield is a Wallet action, not a communication mode.**

Unshield means:

> Withdrawing funds from a private balance to a public Starknet wallet balance.

An Unshield withdrawal may create publicly visible wallet activity.

Unshield must not be used to describe:

- public messages;
- public offers;
- public counter-offers;
- public payment memos;
- public escrow coordination;
- a fallback when private execution fails.

---

## Can users send an Unshield message?

No.

VEIL does not provide an Unshield messaging mode.

All Deal Room messages are intended to remain private.

When the private path cannot complete, VEIL should stop the action and show an honest failure state rather than sending the message publicly.

---

## Can offers or counter-offers be public?

Not inside the intended VEIL product flow.

The following actions are private-only:

- creating an offer;
- revising an offer;
- submitting a counter-offer;
- accepting;
- rejecting;
- related negotiation context.

VEIL must not provide a public or Unshield negotiation option.

---

## Are payment memos private?

Private payment memos are a core part of the intended VEIL experience.

A memo may contain:

- invoice reference;
- milestone number;
- payment purpose;
- delivery stage;
- order reference;
- settlement note.

The memo should remain connected to the relevant Deal Room and payment flow without becoming ordinary public transaction text.

The final end-to-end private memo flow is still under development.

---

## Is escrow coordination private?

That is the intended product behavior.

VEIL is designed to keep escrow coordination connected to the private agreement, including:

- participant roles;
- deposit readiness;
- activation;
- delivery conditions;
- release;
- completion;
- cancellation.

Earlier escrow components may exist as development or legacy evidence, but they must not be treated as proof that the complete private escrow flow is production-ready.

---

## Does VEIL hold or custody user funds?

VEIL must not currently be described as providing production custody guarantees.

Existing escrow-related components may record workflow state or support development flows, but this does not automatically mean VEIL provides:

- audited custody;
- production asset release;
- guaranteed settlement;
- insurance;
- legal enforcement.

Any production custody or settlement claim requires separately verified implementation, testing, and security review.

---

## Does VEIL replace Starknet Privacy Pool?

No.

Privacy Pool provides the privacy infrastructure required for the final private execution path.

VEIL provides the user-facing product layer around that infrastructure.

At a high level:

- Privacy Pool supports the private protocol operations;
- VEIL provides the Deal Room experience;
- VEIL organizes messages, negotiation, payment context, and escrow coordination into understandable product flows.

---

## Does VEIL use the official Starknet Privacy SDK?

The official Starknet Privacy SDK is the source of truth for the final privacy runtime.

Its integration into the final VEIL product path is currently **in development**.

The documentation must not imply that the final official SDK-backed Sepolia flow is complete until there is verified end-to-end evidence.

---

## What is the direct encrypted helper?

The direct encrypted helper is an older VEIL implementation used for development and historical encrypted messaging demonstrations.

Its status is:

> **Legacy**

It may remain as historical evidence or a compatibility reference, but it is not the final production architecture.

VEIL must not automatically use the direct helper when the official private path fails.

---

## What happens when a private action fails?

VEIL should fail safely.

When a private action cannot complete, the product should:

- stop the action;
- preserve the draft when appropriate;
- show whether anything was submitted;
- avoid displaying false success;
- avoid automatically switching to a public route;
- provide a safe retry option.

The product must not weaken privacy merely to make an action appear successful.

---

## Does a transaction hash mean the action is complete?

Not necessarily.

A transaction hash may prove that a submission exists, but it does not automatically prove that:

- the transaction was accepted;
- the VEIL helper stored the intended ciphertext;
- the recipient discovered the action;
- the recipient decrypted the correct content;
- both devices display the same Deal Room state.

VEIL should use accurate product statuses such as:

- Preparing;
- Submitted;
- Waiting for confirmation;
- Confirmed;
- Available to recipient;
- Completed;
- Failed.

---

## Is VEIL production-ready?

No.

VEIL is currently pre-production and under active development.

It must not be described as production-ready until the final private Deal Room flow has been verified end to end.

At minimum, VEIL must prove that:

1. Alice and Bob use different participant accounts.
2. A private Deal Room relationship is established.
3. Alice submits a private action.
4. Public application data does not expose the private plaintext.
5. The Privacy Pool invokes the VEIL helper.
6. The encrypted payload is stored correctly.
7. Bob discovers the intended action.
8. Bob decrypts the exact original content locally.
9. Both participants see consistent deal state.
10. Duplicate or invalid actions fail safely.
11. No public or direct fallback is used.

---

## Has VEIL already been deployed to Sepolia?

VEIL has development and deployment evidence for existing components.

However, a deployed contract address does not by itself prove the complete final private Deal Room experience.

Deployment must be distinguished from:

- official SDK integration;
- accepted private submission;
- recipient discovery;
- recipient decryption;
- complete two-device E2E;
- production readiness.

The documentation should state exactly what each deployment or transaction proves.

---

## What does Completed mean in VEIL documentation?

**Completed** means a specific component, flow, interface, test, or research task exists and has evidence.

Completed does not automatically mean:

- production-ready;
- mainnet-ready;
- independently audited;
- complete end to end.

For example, a completed historical direct-helper test may still belong to the Legacy architecture.

---

## What does In Development mean?

**In Development** means the product flow is defined or partially implemented, but the final acceptance criteria have not yet been satisfied.

The official Privacy Pool-backed Deal Room runtime is currently in this category.

---

## What does Planned mean?

**Planned** means the capability is part of the intended product direction but does not yet have a verified implementation.

Examples may include:

- expanded settlement adapters;
- richer dispute references;
- marketplace integrations;
- contributor-platform integrations;
- production fee policy;
- reward programs;
- mainnet deployment.

---

## What does Legacy mean?

**Legacy** refers to an older implementation that remains as historical evidence, research, or temporary compatibility support but is not the final production architecture.

Examples include:

- direct helper messaging;
- public or direct communication modes;
- manual privacy-channel logic that the official SDK should manage;
- earlier public offer or escrow workflows presented as private-product behavior.

---

## Does VEIL guarantee complete privacy?

VEIL must not claim an absolute or universal privacy guarantee.

The intended architecture protects Deal Room content by keeping private information encrypted and limiting public systems to ciphertext and required public commitments.

However, some information may still be publicly observable depending on the final implementation, including:

- transaction timing;
- contract interaction;
- network activity;
- public wallet activity;
- Unshield withdrawals;
- public settlement actions.

The final privacy guarantees and limitations must be documented after the real implementation has been verified.

---

## Does VEIL hide illegal activity?

VEIL is not designed to remove responsibility between deal participants or to support illegal activity.

Its purpose is to reduce unnecessary exposure of legitimate sensitive information, such as:

- commercial terms;
- customer relationships;
- contributor arrangements;
- payment purposes;
- milestone details;
- business negotiations.

Participants remain responsible for following applicable laws, agreements, and organizational requirements.

---

## Does VEIL provide legal contracts or arbitration?

Not currently.

VEIL provides private communication and structured deal coordination.

It must not be presented as automatically providing:

- legally binding contract interpretation;
- court enforcement;
- arbitration;
- insurance;
- automatic dispute judgment;
- compliance certification.

These capabilities may require external providers or future integrations.

---

## Does VEIL verify real-world identity?

Not by default.

VEIL may allow users to identify counterparties through supported Starknet names, wallet addresses, or other account information.

A wallet address or `.stark` name does not automatically prove a person’s legal identity.

The product must not display “identity verified” unless it has verified a clearly defined property through a supported process.

---

## Can VEIL be integrated into other applications?

That is part of the long-term product direction.

Possible integrations include:

- wallets;
- marketplaces;
- payment applications;
- contributor platforms;
- DAO tools;
- escrow providers;
- organization and treasury systems.

VEIL may provide the private Deal Room layer while the partner application continues to manage its existing discovery, reputation, governance, or settlement functions.

No integration should be described as completed until working evidence exists.

---

## Does VEIL have a token or reward system?

Any fee, reward, point, token allocation, buyback, or burn model must remain marked as **Planned** unless it has been formally approved and implemented.

The product documentation must not present proposed economic values as current production behavior.

---

## Where can users see the status of a deal?

The Deal Room and Activity sections should provide the main status information.

Users should be able to see:

- current counterparty;
- active offer;
- latest negotiation action;
- payment memo status;
- escrow progress;
- pending approvals;
- confirmations;
- failures;
- completion or cancellation.

The product should not require users to reconstruct the deal manually from several unrelated pages.

---

## Where is Unshield shown in the product?

Unshield belongs only in the Wallet section.

The Wallet should explain:

- source private balance;
- destination public wallet balance;
- amount;
- asset;
- potential public visibility;
- current transaction status.

Unshield must not appear in Deal Room communication settings.

---

## What network does VEIL currently use?

Development and testing may use Starknet Sepolia.

Every screenshot, report, and transaction reference should state the network honestly.

Sepolia activity must not be presented as mainnet activity.

A local test must not be presented as a Sepolia result.

---

## How should VEIL be described today?

The recommended current description is:

> **VEIL is a pre-production private Deal Room for Starknet, designed for private communication, negotiation, payment context, and escrow coordination. The final official Privacy Pool-backed end-to-end runtime is under active development.**

Do not describe VEIL as:

- production-ready;
- mainnet-ready;
- independently audited;
- providing completed production custody;
- having completed real Sepolia E2E;

unless those claims become supported by verifiable evidence.

---

## Where should product reviewers start?

Product reviewers should read:

1. [Product Overview](README.md)
2. [Vision](vision.md)
3. [Problem](problem.md)
4. [Solution](solution.md)
5. [Core Features](core-features.md)
6. [Use Cases](use-cases.md)
7. [User Journey](user-journey.md)
8. [Roadmap](roadmap.md)

These pages explain the product before implementation details.

---

## Where should developers start?

Developers should first understand the product rules, especially:

- Deal Room actions are private-only;
- Unshield belongs only in Wallet withdrawal;
- the direct helper is Legacy;
- failed private actions must not fall back publicly;
- product status must remain honest.

After that, developers should read:

- [Architecture Documentation](../architecture/README.md)
- [Technical Documentation](../technical/README.md)

The product documentation defines the expected user behavior. The architecture and technical documentation explain how that behavior is implemented.
