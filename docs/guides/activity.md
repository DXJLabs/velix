# Activity

Activity gives users one place to review pending actions, recent events, failures, and completed progress across their VEIL Deal Rooms.

It helps users answer:

- What requires my attention?
- Which counterparty or Deal Room is involved?
- What has already been submitted?
- What is still waiting for confirmation?
- Which action failed?
- What happened most recently?
- Where should I continue the deal?

Activity is a navigation and status layer.

It does not replace the full context available inside each Deal Room.

> **Current status:** VEIL is in pre-production.
>
> Activity states must reflect the evidence that actually exists. A submitted transaction must not automatically be displayed as delivered, available to the recipient, or completed.

## Purpose

A user may participate in several Deal Rooms at the same time.

Without a combined Activity view, the user may forget:

- an offer waiting for response;
- an escrow deposit that still requires action;
- a payment memo waiting for review;
- a failed private message that needs retry;
- a delivery reference waiting for acknowledgment;
- a release action waiting for confirmation.

Activity surfaces these items without forcing the user to open every Deal Room manually.

## Activity Overview

The Activity page should separate information into clear groups.

Recommended groups include:

- Requires your action;
- Waiting for counterparty;
- Waiting for confirmation;
- Failed actions;
- Recent activity;
- Completed activity.

The exact interface may use tabs, filters, grouped sections, or a timeline.

The important requirement is that users can distinguish urgent work from ordinary history.

## Activity Item

Each Activity item should provide enough context to understand the event.

It may show:

- Deal Room title;
- counterparty;
- action type;
- current status;
- participant responsible for the next action;
- time;
- short local summary;
- network when relevant;
- action to open the related Deal Room.

### Example

```text
Landing Page Development
Counterparty: 0x04ab...93f2
Action: Counter-offer received
Status: Requires your response
Time: 8 minutes ago
