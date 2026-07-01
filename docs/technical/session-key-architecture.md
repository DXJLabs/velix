# Session Key Architecture

Session keys in VEIL are scoped authorization keys for application-layer metadata. They are not encryption keys and not wallet keys.

## Implemented Permissions

- `MESSAGE_SEND`
- `OFFER_CREATE`
- `MEMO_SEND`
- `NEGOTIATION_METADATA`

## Allowed Uses

Session keys may authorize:

- chat messages,
- offers,
- counter offers,
- payment memos,
- negotiation metadata,
- proof references.

## Not Allowed

Session keys must not authorize:

- token transfers,
- withdrawals,
- escrow release,
- private balance changes,
- Privacy Pool shield/unshield asset operations.

Financial actions require wallet-level approval outside this session layer.

## Current Implementation

- `VeilSessionKeyManager` creates, stores, validates, and revokes session records.
- Browser storage is available through `BrowserSessionKeyStore`.
- Memory storage is available for tests.
- `VeilClient` can require session permissions before application-layer timeline actions.

## Transport Independence

The session layer is independent of direct helper or Shield transport. It checks application permissions before transport submission.
