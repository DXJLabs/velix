# Problem

Onchain settlement is transparent and verifiable, but the information surrounding a deal is often private.

A blockchain transaction may only show an address, token, amount, and timestamp. However, those details can still reveal much more when connected with public messages, repeated interactions, wallet histories, or known identities.

For many users, the most sensitive part of a transaction is not only the amount being transferred. It is the context around it:

- who is working with whom;
- what product or service is being purchased;
- what price was negotiated;
- why a payment is being made;
- which milestone has been completed;
- when delivery is expected;
- whether a dispute or delay exists;
- what conditions must be satisfied before funds are released.

Existing onchain payment flows do not provide a complete private environment for managing this context.

## A Deal Is More Than a Payment

Most real transactions begin long before funds are transferred.

Two parties usually need to:

1. identify each other;
2. discuss the purpose of the deal;
3. negotiate price and conditions;
4. revise terms;
5. agree on deadlines or milestones;
6. record the purpose of the payment;
7. coordinate escrow or delivery;
8. confirm completion;
9. settle the payment.

A wallet can perform the final transfer, but it does not manage the full relationship between those actions.

As a result, users are forced to coordinate one deal across multiple disconnected tools.

## Fragmented Deal Coordination

A typical crypto-native deal may be divided across:

- a messaging application for discussion;
- a document or spreadsheet for terms;
- a wallet for payment;
- an escrow interface for deposits;
- a file-sharing service for delivery evidence;
- a block explorer for transaction verification.

Each tool contains only part of the truth.

This creates several problems:

- participants may disagree about which terms are current;
- important decisions become buried in chat history;
- payment references may not clearly explain what was paid for;
- offer revisions may be difficult to track;
- escrow progress may require repeated manual confirmation;
- transaction history is separated from the conversation that caused it;
- one party may understand the deal differently from the other.

The problem is not only privacy. It is also the absence of one clear and consistent deal state.

## Public Metadata Can Reveal Sensitive Relationships

Even when message content is encrypted elsewhere, public transaction activity may expose sensitive business information.

Observers may be able to infer:

- that two wallets are repeatedly working together;
- when negotiations ended;
- when a delivery or milestone was completed;
- how much a service provider charges;
- which organizations pay a specific contributor;
- when a company is working with a new vendor;
- whether a deal was delayed, cancelled, or disputed;
- how frequently a treasury pays a particular recipient.

Individually, one transaction may appear harmless.

Across multiple transactions, addresses, timestamps, amounts, and public actions can reveal a detailed relationship graph.

For freelancers, businesses, marketplaces, contributors, treasuries, and OTC counterparties, this information may be commercially sensitive.

## Private Chat Alone Does Not Solve the Problem

Users can already discuss deals through private messaging applications.

However, private chat is usually disconnected from onchain execution.

A message saying:

> “This payment is for the second development milestone”

does not automatically remain connected to the final transaction.

A negotiated price in a chat may differ from the amount eventually transferred.

An accepted offer may be buried beneath newer messages.

An escrow release may occur without a clear connection to the delivery condition that justified it.

Private messaging protects conversation content, but it does not create a structured relationship between:

- the conversation;
- the active offer;
- the payment memo;
- the escrow state;
- the transaction;
- the final outcome.

## Wallets Alone Do Not Solve the Problem

Wallets are designed primarily to manage accounts, assets, signatures, and transactions.

They generally do not provide a private workspace for:

- discussing terms;
- tracking offer revisions;
- identifying the active agreement;
- attaching private business context;
- coordinating both sides of an escrow;
- reviewing the complete history of a deal.

A wallet may confirm that a transaction happened, but not why it happened or which agreement it completed.

## Traditional Escrow Interfaces Are Often Isolated

Escrow can reduce counterparty risk, but escrow interfaces frequently focus only on deposits, release, and cancellation.

The negotiation that created the escrow usually happens somewhere else.

This can leave users asking:

- Which offer created this escrow?
- What exactly must be delivered?
- Has the other party confirmed the same conditions?
- What evidence supports release?
- Was the deadline changed?
- Which payment memo belongs to this escrow?
- Why was the escrow cancelled?

Without connected private coordination, escrow becomes another separate tool rather than part of a complete deal workflow.

## Users Must Choose Between Privacy and Clarity

Current workflows often force users into an uncomfortable trade-off.

They can use public onchain actions that are easier to verify but expose sensitive context.

Or they can move important information into private offchain applications, where it becomes disconnected from the settlement record.

This creates two incomplete outcomes:

### Public but overexposed

The deal is easier to observe and verify, but sensitive relationships, amounts, timing, and activity may become visible.

### Private but fragmented

The discussion remains private, but the agreement, payment, escrow, and transaction history are spread across separate systems.

Users need both:

- privacy for sensitive deal context;
- clarity about the current state of the agreement.

## Common User Pain

### Freelancers and Service Providers

A freelancer may not want every client relationship, rate, milestone, and payment schedule to be publicly visible.

They also need a clear record of:

- agreed scope;
- revisions;
- milestone completion;
- payment purpose;
- release status.

### Clients and Buyers

A client needs confidence that:

- the active offer is clear;
- both parties accepted the same terms;
- delivery conditions are recorded;
- payment or escrow activity matches the agreement.

### Sellers and Marketplaces

A seller may need to coordinate price, delivery, proof, and settlement without exposing customer relationships or negotiation history.

### Contributors and Grant Recipients

Contributor payments may contain sensitive information about assignments, milestones, internal budgets, or team relationships.

### Organizations and Treasuries

Organizations may need to coordinate vendor and contributor payments while avoiding unnecessary exposure of operational relationships.

### OTC and Business Counterparties

Larger counterparties may not want negotiation timing, settlement activity, pricing, or recurring relationships visible to unrelated observers.

## The Cost of the Current Experience

The fragmented and overexposed experience can lead to:

- accidental disclosure of business relationships;
- unclear or outdated terms;
- payment disputes;
- incorrect escrow releases;
- duplicated work;
- missed deadlines;
- inconsistent records;
- dependence on manual screenshots and chat searches;
- reduced confidence in onchain business workflows.

The more valuable or complex the deal becomes, the more serious these problems become.

## The Product Gap

There is a missing product layer between private communication and onchain settlement.

Users need one place where they can privately coordinate:

- messages;
- offers;
- counter-offers;
- acceptance or rejection;
- payment memos;
- escrow conditions;
- delivery references;
- settlement progress.

That workspace must keep the complete deal understandable to its participants without exposing sensitive context to unrelated public observers.

This is the product gap VEIL is designed to address.

## What VEIL Must Solve

VEIL must make it possible for two parties to move through a deal without repeatedly switching between unrelated applications.

The product must provide:

- one private Deal Room for each agreement;
- a clear view of the active terms;
- private communication by default;
- structured offer and counter-offer flows;
- private payment context;
- understandable escrow progress;
- one activity history for the complete deal;
- honest transaction and confirmation states;
- no silent downgrade to a public communication path.

VEIL is not solving only the privacy of a token balance.

It is solving the privacy, clarity, and continuity of the entire deal surrounding an onchain payment.
