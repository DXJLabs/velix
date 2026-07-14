# User Journey

This document describes the intended end-to-end experience of two people using VEIL to coordinate a private onchain deal.

The journey follows two example participants:

- **Alice**, who creates the Deal Room and proposes an agreement;
- **Bob**, who joins the Deal Room and responds to the proposal.

The exact type of deal may vary. It could represent freelance work, a private purchase, a milestone payment, a marketplace transaction, or another agreement requiring private communication and settlement context.

> **Current status:** This document describes the intended product experience.
>
> VEIL remains in pre-production. Individual interface components and historical implementations may exist, but the complete final Privacy Pool-backed journey must not be described as production-ready until it has passed real end-to-end verification.

---

## Journey Overview

A complete VEIL journey should allow two parties to:

1. connect their Starknet accounts;
2. find or invite each other;
3. open a private Deal Room;
4. establish a private communication relationship;
5. discuss the agreement;
6. create and negotiate offers;
7. accept the final terms;
8. attach private payment context;
9. coordinate escrow when required;
10. follow confirmations and pending actions;
11. complete settlement;
12. retain a clear private history of the deal.

The user should experience this as one connected workflow rather than a collection of unrelated blockchain actions.

---

## 1. Enter VEIL

Alice opens VEIL and sees a clear explanation of the product:

> A private Deal Room for communication, negotiation, payment context, and escrow coordination on Starknet.

Before connecting an account, Alice should understand:

- what VEIL is;
- which actions are intended to remain private;
- that VEIL is currently pre-production;
- which network the application is using;
- that privacy is the default behavior inside a Deal Room.

The opening experience should not begin with SDK terminology, proof systems, contract addresses, or other implementation details.

### Expected Interface

The entry page may show:

- product value proposition;
- current network;
- product status;
- supported account options;
- primary action to enter the application;
- links to documentation and project information.

---

## 2. Connect Account

Alice connects a supported Starknet account.

The application should clearly display:

- the connected account;
- shortened wallet address;
- account or wallet source;
- active Starknet network;
- readiness status;
- any action required before creating a Deal Room.

Alice should not need to understand the technical account implementation.

### Expected States

The connection flow may show:

- Not connected;
- Connecting;
- Waiting for approval;
- Connected;
- Unsupported network;
- Account not ready;
- Connection failed.

A connection failure must not be shown as successful.

---

## 3. Find or Invite a Counterparty

Alice chooses to start a new deal.

She searches for Bob using a supported identity, such as:

- a `.stark` name;
- a Starknet wallet address;
- another identity method supported by VEIL.

Before continuing, the interface should help Alice verify that she selected the correct counterparty.

### When Bob Is Available

If Bob can already participate, Alice sees:

- Bob’s recognizable account information;
- shortened wallet address;
- readiness state;
- an action to open or request a Deal Room.

### When Bob Is Not Yet Available

Alice can create an invitation.

The invitation flow should show:

- invitation link;
- invitation status;
- expiry information when applicable;
- an option to copy or share the invitation;
- a clear waiting state.

### Expected Invitation States

- Counterparty found;
- Invitation created;
- Waiting for counterparty;
- Counterparty joined;
- Invitation expired;
- Invitation cancelled;
- Invitation failed.

The interface must not claim that Bob has joined before his participation is actually confirmed.

---

## 4. Bob Joins the Deal Room

Bob opens the invitation and connects his own Starknet account.

Before joining, Bob should be able to review:

- who invited him;
- which account will participate;
- the network being used;
- that the Deal Room communication is private-only;
- any relevant product warning or pre-production status.

Bob confirms that he wants to join.

Alice then sees that Bob has joined and that the Deal Room is ready for both participants.

### Product Requirement

Both Alice and Bob must see the correct counterparty.

The product should avoid situations where:

- one participant sees an outdated address;
- the Deal Room opens with an unknown participant;
- the invitation status differs between devices;
- one side sees “ready” while the other side has not joined.

---

## 5. Open the Private Deal Room

After both participants are ready, Alice and Bob enter the same Deal Room.

The Deal Room should provide one clear view of:

- counterparty;
- deal title or purpose;
- recent messages;
- active offer;
- payment memo status;
- escrow status;
- pending actions;
- recent activity.

The interface should make it clear that this room belongs to one agreement or one specific counterparty relationship.

### Empty Deal Room State

When a Deal Room is new, VEIL may guide the participants to:

- send the first message;
- describe the purpose of the deal;
- create an offer;
- invite the counterparty if they have not joined;
- review account readiness.

The empty state should help users begin the deal rather than show an unexplained blank screen.

---

## 6. Establish Private Communication

Before normal Deal Room actions begin, VEIL may need to prepare the private communication relationship between Alice and Bob.

This process should be represented in simple product language.

The user may see states such as:

- Preparing private Deal Room;
- Waiting for wallet approval;
- Establishing private connection;
- Waiting for confirmation;
- Private Deal Room ready;
- Setup failed.

The interface should not require ordinary users to understand viewing keys, channel keys, registries, or proof construction.

### Safe Behavior

If private setup fails:

- the Deal Room must not silently switch to public communication;
- no message should be sent through a legacy direct route automatically;
- the draft should be preserved where possible;
- the user should receive an honest retry option.

---

## 7. Discuss the Deal

Alice sends Bob a private message describing the proposed agreement.

For example:

> “I need the landing page completed before 30 July. The payment is 500 STRK in two milestones.”

Bob receives the message and replies inside the same Deal Room.

They may discuss:

- scope;
- price;
- deadline;
- milestones;
- revisions;
- delivery requirements;
- payment expectations;
- escrow conditions.

### Message States

A private message may move through several states:

- Draft;
- Waiting for approval;
- Preparing;
- Submitted;
- Waiting for confirmation;
- Available to recipient;
- Failed;
- Retry required.

VEIL must not display “Delivered” merely because Alice prepared or submitted the action.

The state should reflect what has actually happened.

### Privacy Rule

There is no public message option.

Alice and Bob must not be shown:

- Shield versus Unshield selection;
- public message mode;
- direct fallback option;
- “send anyway publicly” after a privacy failure.

---

## 8. Create an Offer

After discussing the initial terms, Alice creates a structured offer.

The offer may contain:

- deal title;
- asset;
- amount;
- scope;
- deadline;
- milestone;
- delivery requirement;
- expiry;
- escrow requirement;
- additional private terms.

Before submitting, Alice sees a review screen showing the proposal clearly.

### Offer Review

Alice should be able to confirm:

- who will receive the offer;
- which Deal Room it belongs to;
- the proposed amount;
- the deadline;
- the relevant conditions;
- whether escrow is required.

After Alice submits the offer, Bob sees it inside the Deal Room.

### Offer States

- Draft;
- Preparing;
- Open;
- Countered;
- Accepted;
- Rejected;
- Expired;
- Replaced;
- Failed.

Only one proposal should be presented as the active offer at a time.

Older offers may remain visible in the history, but they must not be confused with the current terms.

---

## 9. Counter, Accept, or Reject

Bob reviews Alice’s offer.

He has three primary choices:

### Accept

Bob agrees with the proposed terms.

The Deal Room records the agreement and clearly shows that the offer has been accepted.

### Counter

Bob proposes different terms.

For example, he may change:

- price;
- deadline;
- quantity;
- milestone;
- delivery requirement;
- escrow condition.

The counter-offer becomes the new active proposal.

Alice can then review and respond.

### Reject

Bob declines the proposal.

The Deal Room should show that the offer is no longer active and may allow the participants to continue discussing alternatives.

### Privacy Rule

All of these actions are private-only:

- counter-offer;
- acceptance;
- rejection;
- revision;
- related negotiation messages.

There is no Unshield negotiation mode.

---

## 10. Confirm the Active Agreement

When one proposal is accepted, the Deal Room should clearly summarize the active agreement.

Both Alice and Bob should see the same information:

- agreed parties;
- amount;
- asset;
- deadline;
- milestone;
- delivery requirement;
- escrow requirement;
- current status;
- next expected action.

This summary should reduce the need to search through the message history.

### Product Requirement

The accepted agreement must be visually different from:

- drafts;
- rejected offers;
- expired offers;
- previous counter-offers.

Both participants should immediately understand which terms are currently valid.

---

## 11. Add a Private Payment Memo

Before payment or escrow activity, Alice or Bob may create a private payment memo.

The memo explains what the payment represents.

It may include:

- invoice reference;
- milestone number;
- payment purpose;
- order reference;
- service period;
- delivery stage;
- settlement note.

### Memo Review

Before submission, the user should see:

- recipient;
- amount when relevant;
- related offer;
- related milestone;
- memo content;
- Deal Room identity.

The memo remains connected to the agreement.

### Privacy Rule

Payment memos are private-only.

The product must not offer:

- public memo;
- Unshield memo;
- automatic conversion
