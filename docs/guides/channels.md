# Deal Rooms

Deal Rooms are the primary workspaces in VEIL.

Each Deal Room represents one private agreement or one clearly defined deal context between two participants.

A Deal Room keeps the complete relationship between communication and settlement context in one place, including:

- participants;
- private messages;
- active offer;
- previous negotiation history;
- private payment memo;
- escrow progress;
- delivery references;
- pending actions;
- completed activity.

The filename remains `channels.md` for repository compatibility, but the user-facing product term is **Deal Room**.

> **Current status:** VEIL is in pre-production.
>
> This guide describes the intended Deal Room experience. A flow must not be presented as production-ready until the final Privacy Pool-backed two-party experience has been verified end to end.

## Purpose of a Deal Room

A wallet transaction can show that value moved, but it does not explain the complete agreement behind that transaction.

A private message application may protect a conversation, but it does not necessarily show:

- which offer is currently active;
- which terms were accepted;
- what a payment represents;
- whether escrow is ready;
- who must act next;
- whether the deal was completed or cancelled.

A VEIL Deal Room brings those parts together.

The user should be able to open one Deal Room and immediately understand:

- who the counterparty is;
- what the agreement is about;
- which terms are active;
- what has already happened;
- what action is required next;
- whether the deal is waiting, active, completed, cancelled, or failed.

## Deal Room List

The Deal Room list is the main place where users find their current and previous agreements.

Each list item should show enough information to understand the room without opening it.

A Deal Room item may display:

- counterparty name or shortened address;
- deal title or purpose;
- latest activity;
- active deal status;
- unread activity;
- pending action;
- last updated time;
- network when relevant.

### Example

```text
Landing Page Development
Counterparty: 0x04ab...93f2
Status: Offer awaiting your response
Last activity: 8
