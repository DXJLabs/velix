# Product Screenshots

This document defines the screenshot set required to present VEIL clearly to users, grant reviewers, ecosystem teams, partners, and potential adopters.

The screenshots should explain the product experience before introducing technical architecture.

They must show VEIL as a private Deal Room for:

- communication;
- negotiation;
- payment context;
- escrow coordination;
- deal activity;
- wallet management.

> **Current status:** Final product screenshots have not yet been committed.
>
> Until real product evidence is available, placeholder images, mock transactions, or incomplete flows must not be presented as production results.

---

## Purpose of This Screenshot Set

The screenshot set should help a reader understand:

1. what VEIL is;
2. how two counterparties start a Deal Room;
3. how they communicate privately;
4. how offers and counter-offers work;
5. how payment memos remain connected to a deal;
6. how escrow progress is presented;
7. how important actions appear in one activity history;
8. where Wallet actions, including Unshield withdrawal, are located;
9. which parts of the product are completed, in development, planned, or legacy.

Screenshots should communicate the product without requiring the reader to understand:

- SDK APIs;
- proof generation;
- contract selectors;
- ABI structures;
- encryption internals;
- registry management;
- prover requests;
- raw calldata.

Technical diagrams and implementation screenshots belong in the architecture or technical documentation, not in this product screenshot set.

---

## Screenshot Status Labels

Each screenshot in the documentation should use one of the following statuses:

| Status | Meaning |
|---|---|
| **Required** | The screenshot is part of the minimum product presentation set |
| **Optional** | Useful supporting material but not required for the first complete set |
| **Blocked** | Cannot be captured honestly because the related product flow is not yet working |
| **Ready** | Captured from the actual product and reviewed for sensitive information |
| **Legacy** | Shows an older implementation and must not be presented as the final architecture |

A screenshot must not be marked **Ready** if it only shows a static mockup while its caption implies that the full action succeeded.

---

# Required Screenshot Set

## 1. Home Page

**Priority:** Required  
**Suggested filename:** `veil-home.png`

### Purpose

Introduce VEIL and explain its product value immediately.

A reviewer should understand from this screenshot that VEIL is a private Deal Room, not only a private messenger, wallet, SDK, or smart-contract experiment.

### The Screenshot Should Show

- VEIL name and branding;
- concise product positioning;
- private Deal Room value proposition;
- primary action to enter or connect;
- current Starknet network;
- product status when appropriate;
- links to documentation, GitHub, and official project channels.

### Recommended Product Message

The page should communicate a message similar to:

> Private communication, negotiation, payment context, and escrow coordination in one Starknet Deal Room.

### Must Not Show

- “Shielded Coming Soon”;
- Shield/Unshield communication mode selection;
- unsupported production claims;
- raw contract addresses as the main product message;
- SDK methods or source-code snippets;
- unrelated products from the team.

---

## 2. Account Connection

**Priority:** Required  
**Suggested filename:** `veil-connect-account.png`

### Purpose

Show how a user enters VEIL and connects a supported Starknet account.

### The Screenshot Should Show

- available connection methods;
- selected account or wallet source;
- shortened account address;
- current network;
- connection or readiness status;
- understandable success or error state.

### Useful States to Capture

- account selection;
- connected and ready;
- unsupported network;
- account not ready.

### Must Not Show

- private key;
- seed phrase;
- signing secret;
- viewing key;
- raw session secret;
- full authentication token;
- internal environment variables.

---

## 3. Channel or Deal Room List

**Priority:** Required  
**Suggested filename:** `veil-deal-room-list.png`

### Purpose

Show how users find active agreements and recent counterparty activity.

Although the underlying product may still use the term `channel` internally, the user-facing screenshot should prioritize the term **Deal Room**.

### The Screenshot Should Show

- Deal Room list;
- recognizable counterparty;
- shortened wallet address or supported name;
- latest activity;
- unread or pending state;
- deal status;
- last updated time;
- action to open a room or start a new deal.

### Recommended Status Examples

- Waiting for counterparty;
- Negotiation active;
- Offer awaiting response;
- Escrow pending;
- Completed;
- Action failed.

### Must Not Show

- public/private communication toggle;
- Unshield room type;
- raw private channel key;
- internal registry identifiers.

---

## 4. Find or Invite Counterparty

**Priority:** Required  
**Suggested filename:** `veil-invite-counterparty.png`

### Purpose

Explain how Alice starts a Deal Room with Bob.

### The Screenshot Should Show

- search by supported `.stark` name;
- wallet address input;
- counterparty result;
- shortened verified address;
- invitation link option;
- waiting state when the counterparty has not joined.

### Additional Screenshot Recommended

**Suggested filename:** `veil-counterparty-joined.png`

This screenshot should show:

- the invited user has joined;
- both parties are ready;
- the Deal Room can be opened;
- the correct counterparty is displayed.

### Honest State Requirement

Do not display:

- “Counterparty joined” before Bob actually connects;
- “Identity verified” unless the product has verified the supported identity property;
- “Private channel established” based only on a local UI state.

---

## 5. New Deal Room

**Priority:** Required  
**Suggested filename:** `veil-new-deal-room.png`

### Purpose

Show the initial state of a Deal Room before messages or offers exist.

### The Screenshot Should Show

- counterparty identity;
- Deal Room title or purpose;
- private communication indication;
- empty conversation state;
- actions to send a message or create an offer;
- clear guidance for beginning the agreement.

### Good Empty-State Message

A useful message may explain:

> Start by discussing the deal or creating a private offer.

### Must Not Show

- a Shield/Unshield selector;
- public message button;
- automatic direct fallback;
- technical privacy setup details as the main interface.

---

## 6. Private Messaging

**Priority:** Required  
**Suggested filename:** `veil-private-messaging.png`

### Purpose

Show Alice and Bob communicating inside the same Deal Room.

### The Screenshot Should Show

- messages from both participants;
- clear sender distinction;
- message time;
- understandable delivery or confirmation state;
- counterparty information;
- access to related offer, payment, or escrow sections.

### Recommended Message States

- Preparing;
- Waiting for approval;
- Submitted;
- Confirmed;
- Available to recipient;
- Failed;
- Retry required.

### Important Requirement

The screenshot must not display a message as fully delivered merely because:

- it was prepared locally;
- the wallet approved it;
- a transaction hash was created;
- submission started.

The status must reflect the actual verified stage.

### Must Not Show

- public message mode;
- Unshield message option;
- plaintext private data inside developer logs;
- full encryption keys;
- fake “private” success without evidence.

---

## 7. Create Offer

**Priority:** Required  
**Suggested filename:** `veil-create-offer.png`

### Purpose

Show how one participant turns a conversation into a structured proposal.

### The Screenshot Should Show

- recipient or counterparty;
- asset;
- amount;
- price or quantity when relevant;
- deadline;
- milestone or delivery terms;
- expiry when supported;
- escrow requirement;
- private additional terms;
- review or confirmation action.

### Product Requirement

The screen should make it clear that the offer belongs to the current Deal Room.

The user should not need to guess:

- who will receive it;
- which agreement it applies to;
- whether the offer is private;
- what happens after submission.

### Must Not Show

- Shield/Unshield offer choice;
- public offer mode;
- unsupported fee values;
- a successful offer state before confirmation.

---

## 8. Active Offer

**Priority:** Required  
**Suggested filename:** `veil-active-offer.png`

### Purpose

Show the currently active terms of the agreement.

### The Screenshot Should Show

- offer creator;
- recipient;
- amount and asset;
- deadline or milestone;
- current status;
- expiry when applicable;
- action required from the recipient;
- Accept, Reject, and Counter actions where appropriate.

### Important Visual Requirement

The active offer must be visually distinguishable from:

- older offers;
- rejected offers;
- expired offers;
- replaced counter-offers;
- drafts.

The product should never make two different proposals appear active at the same time.

---

## 9. Counter-Offer

**Priority:** Required  
**Suggested filename:** `veil-counter-offer.png`

### Purpose

Show how the recipient proposes revised terms.

### The Screenshot Should Show

- original proposal summary;
- revised fields;
- changed amount, deadline, or condition;
- counter-offer creator;
- new active status;
- actions available to the other participant.

### Product Value

The screenshot should demonstrate that VEIL provides structured negotiation rather than forcing users to interpret revisions from ordinary chat messages.

### Privacy Rule

Counter-offers are private-only.

No Unshield or public counter-offer option should appear.

---

## 10. Accepted Agreement

**Priority:** Required  
**Suggested filename:** `veil-accepted-agreement.png`

### Purpose

Show that both parties now share one clear understanding of the accepted terms.

### The Screenshot Should Show

- accepted status;
- parties;
- amount and asset;
- deadline;
- milestone;
- escrow requirement;
- payment memo status;
- next required action.

### Important Requirement

The accepted agreement should not be represented only by a chat message saying “accepted.”

It should appear as a structured summary that both participants can review.

---

## 11. Private Payment Memo

**Priority:** Required  
**Suggested filename:** `veil-payment-memo.png`

### Purpose

Show how payment context remains connected to the agreement.

### The Screenshot Should Show

- memo content;
- payment purpose;
- related offer or milestone;
- recipient;
- amount when applicable;
- review state;
- action to confirm or submit.

### Example Memo Content

A non-sensitive demonstration may use:

> Payment for milestone 2: frontend integration and responsive layout.

### Must Not Show

- Shield/Unshield memo selection;
- public memo mode;
- real confidential customer data;
- unsupported claim that payment already completed.

---

## 12. Payment Review

**Priority:** Optional  
**Suggested filename:** `veil-payment-review.png`

### Purpose

Show the user reviewing deal and payment context before approving an action.

### The Screenshot Should Show

- counterparty;
- payment amount;
- asset;
- related accepted offer;
- private memo preview;
- fees only when real and verified;
- expected wallet action;
- current network.

### Important Requirement

Do not display invented:

- application fee;
- gas subsidy;
- reward points;
- token reward;
- settlement cost.

Only show values supported by the current implementation.

---

## 13. Escrow Preparation

**Priority:** Required  
**Suggested filename:** `veil-escrow-preparation.png`

### Purpose

Show how participants review escrow terms before activation.

### The Screenshot Should Show

- buyer and seller roles;
- related accepted offer;
- required deposits;
- asset and amount;
- release conditions;
- cancellation conditions;
- deadline when applicable;
- participant readiness.

### Product Requirement

Both parties should be able to understand:

- why escrow is required;
- what each person must do;
- which agreement created the escrow;
- when activation can occur.

---

## 14. Escrow Deposit Progress

**Priority:** Required  
**Suggested filename:** `veil-escrow-deposits.png`

### Purpose

Show the responsibilities and progress of both participants.

### The Screenshot Should Show

A clear state such as:

| Participant | Required action | Status |
|---|---|---|
| Buyer | Deposit payment amount | Confirmed |
| Seller | Deposit collateral | Waiting |

The actual product does not need to use this exact table, but the information must be easy to understand.

### Must Not Show

- escrow as active before all required conditions are confirmed;
- ambiguous “Deposit complete” without identifying the participant;
- Unshield escrow option.

---

## 15. Active Escrow

**Priority:** Required  
**Suggested filename:** `veil-active-escrow.png`

### Purpose

Show an escrow after activation.

### The Screenshot Should Show

- active status;
- accepted agreement summary;
- deposit status;
- delivery or milestone state;
- release conditions;
- next required participant action;
- relevant payment memo;
- recent escrow activity.

### Product Value

The screenshot should demonstrate that escrow remains connected to the negotiation and deal context rather than appearing as an isolated balance page.

---

## 16. Delivery or Proof Reference

**Priority:** Optional  
**Suggested filename:** `veil-delivery-reference.png`

### Purpose

Show how participants attach a reference related to delivery or milestone completion.

### The Screenshot Should Show

- reference type;
- related milestone;
- description;
- attachment or external reference status;
- submitting participant;
- recipient acknowledgment when supported.

### Privacy Requirement

Use demonstration data only.

Do not expose:

- real client files;
- confidential documents;
- access credentials;
- secret repository links;
- personal information.

---

## 17. Escrow Release Review

**Priority:** Required  
**Suggested filename:** `veil-escrow-release.png`

### Purpose

Show the final review before an escrow release action.

### The Screenshot Should Show

- amount to be released;
- recipient;
- accepted agreement;
- completed conditions;
- delivery acknowledgment;
- wallet approval requirement;
- current action status.

### Important Requirement

The interface must not show release as completed before the required transaction confirmation exists.

---

## 18. Completed Deal

**Priority:** Required  
**Suggested filename:** `veil-completed-deal.png`

### Purpose

Show the final state of a successful agreement.

### The Screenshot Should Show

- completed status;
- counterparty;
- accepted terms;
- payment memo;
- escrow or settlement result;
- completion date;
- transaction reference when available;
- important activity summary.

### Product Value

The reader should understand that VEIL preserves the full deal history rather than leaving users with only a transaction hash.

---

## 19. Deal Activity

**Priority:** Required  
**Suggested filename:** `veil-deal-activity.png`

### Purpose

Show one timeline combining important communication and deal actions.

### The Screenshot Should Show

Examples such as:

- counterparty joined;
- private Deal Room ready;
- message submitted;
- offer created;
- counter-offer received;
- offer accepted;
- payment memo prepared;
- escrow deposit confirmed;
- escrow activated;
- delivery reference added;
- release submitted;
- settlement confirmed.

### Status Accuracy

The Activity view should distinguish:

- Prepared;
- Waiting for approval;
- Submitted;
- Waiting for confirmation;
- Confirmed;
- Available to recipient;
- Completed;
- Failed;
- Cancelled;
- Expired.

### Must Not Show

- every action marked successful;
- “private” labels for legacy public paths;
- fake transaction hashes;
- links to unrelated transactions.

---

## 20. Wallet Overview

**Priority:** Required  
**Suggested filename:** `veil-wallet.png`

### Purpose

Show the user’s account and balance context separately from Deal Room communication.

### The Screenshot Should Show

- connected account;
- wallet or account source;
- network;
- public wallet balance;
- private balance readiness when supported;
- pending wallet actions;
- withdrawal action;
- logout or disconnect control.

### Important Product Rule

The Wallet is the only section where the term **Unshield** may appear.

It must not be presented as a communication mode.

---

## 21. Unshield Withdrawal

**Priority:** Required when the withdrawal flow exists  
**Current status:** Blocked until supported honestly  
**Suggested filename:** `veil-unshield-withdrawal.png`

### Purpose

Show a user intentionally moving funds from a private balance to a public Starknet wallet balance.

### The Screenshot Should Show

- source private balance;
- destination public wallet;
- amount;
- asset;
- privacy warning;
- network;
- confirmation action;
- transaction state.

### Required Warning

The product should explain that:

- funds will move to a public balance;
- the resulting activity may be publicly visible;
- this action does not change Deal Room communication settings.

### Must Not Show

- Unshield message;
- Unshield offer;
- Unshield payment memo;
- Unshield escrow coordination;
- “fallback to Unshield” after a private action fails.

---

## 22. Settings

**Priority:** Required  
**Suggested filename:** `veil-settings.png`

### Purpose

Show account and product preferences without suggesting that users can disable Deal Room privacy.

### The Screenshot Should Show

- notification preferences;
- connected account information;
- network information;
- session management;
- security controls;
- display preferences;
- logout or disconnect controls.

### Settings That Must Not Appear

- default public messaging;
- Shield/Unshield communication preference;
- public offer mode;
- public memo mode;
- public escrow mode;
- automatic fallback to direct execution.

Privacy for Deal Room actions is a product rule, not a user preference.

---

## 23. Failure State

**Priority:** Required  
**Suggested filename:** `veil-private-action-failed.png`

### Purpose

Show that VEIL fails safely when a private action cannot complete.

### The Screenshot Should Show

- which action failed;
- whether anything was submitted;
- preserved draft when appropriate;
- understandable error summary;
- retry action;
- option to return without losing context.

### Recommended Product Message

A useful message may be:

> This action was not privately submitted. Your draft has been preserved. Please retry after the connection is restored.

### Must Not Show

- “Send publicly instead”;
- automatic direct fallback;
- false completed status;
- raw private error material;
- private keys or proof payloads.

This screenshot is important because privacy is not proven only through successful screens. The product must also show safe behavior when the private route fails.

---

# Two-Device Demo Screenshots

A credible VEIL product demonstration requires evidence from two separate participant environments.

One device should represent **Alice** and the other **Bob**.

## 24. Alice Sends, Bob Receives

**Priority:** Required after final private E2E works  
**Current status:** Blocked until verified  
**Suggested filenames:**

- `veil-alice-sends.png`
- `veil-bob-receives.png`

### Alice Screenshot Should Show

- Alice’s connected account;
- Bob as the counterparty;
- the intended private action;
- accurate submission state;
- the same Deal Room identifier or recognizable deal context.

### Bob Screenshot Should Show

- Bob’s connected account;
- Alice as the counterparty;
- the received action;
- accurate recipient availability state;
- matching Deal Room context.

### Acceptance Requirement

The two screenshots should demonstrate that:

- the participants are using different accounts;
- the recipient sees the correct sender;
- the content matches;
- the private action did not merely appear on the sender’s device;
- the status is not simulated.

---

## 25. Alice and Bob See the Same Active Offer

**Priority:** Required for negotiation demonstration  
**Suggested filenames:**

- `veil-alice-active-offer.png`
- `veil-bob-active-offer.png`

Both participants should see:

- the same active terms;
- the same amount;
- the same deadline;
- the same offer status;
- the correct action available to each participant.

This proves product-state consistency, not only visual design.

---

## 26. Alice and Bob See the Same Escrow State

**Priority:** Required for escrow demonstration  
**Suggested filenames:**

- `veil-alice-escrow-state.png`
- `veil-bob-escrow-state.png`

Both screenshots should show:

- matching escrow status;
- correct buyer and seller roles;
- consistent deposit progress;
- consistent next action;
- matching accepted agreement context.

---

# Screenshots for README and Grant Applications

The minimum external presentation set should contain:

1. Home page;
2. Deal Room list;
3. Invite Counterparty;
4. Private Messaging;
5. Active Offer;
6. Counter-Offer or Accepted Agreement;
7. Private Payment Memo;
8. Escrow Progress;
9. Activity Timeline;
10. Wallet;
11. Two-device sender and recipient evidence when available.

This set should allow a reviewer to understand the full product without reading every documentation file.

---

# Screenshots for a Pitch Deck

A shorter pitch deck may use:

1. Product home;
2. Problem represented through fragmented workflow;
3. Deal Room;
4. Structured negotiation;
5. Escrow coordination;
6. Two-party private action;
7. Product status and roadmap.

Screenshots should be cropped and captioned so the audience understands the intended point immediately.

Do not place full desktop screenshots on slides when the important interface becomes too small to read.

---

# Screenshot Capture Standards

## Use Real Product Screens

Capture screenshots from:

- the actual deployed frontend;
- a local build matching the documented version;
- a clearly labeled prototype when the real flow is unavailable.

Do not present a design mockup as a completed transaction.

## Use Demonstration Accounts

Use test accounts created for documentation.

Do not expose personal wallets or real balances unless intentionally approved.

## Use Safe Demonstration Content

Example deal content should be fictional and non-sensitive.

Recommended examples:

- website development milestone;
- design delivery;
- documentation work;
- test marketplace order;
- demonstration service agreement.

## Keep Names Consistent

Use the same participants across the screenshot set.

For examp

- Alice — buyer or client;
- Bob — seller or service provider.

Do not switch identities or roles between screenshots without explanation.

## Keep Deal Data Consistent

The screenshot series should use one coherent example.

For example:

```text
Deal: Landing Page Development
Client: Alice
Developer: Bob
Total: 500 STRK
Milestone 1: Design
Milestone 2: Frontend Implementation
Deadline: 30 Jul
