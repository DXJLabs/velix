# VeilOffer

`VeilOffer` manages stateful negotiation between two direct participants.

The contract supports:

```text
Create Offer
    ↓
Counter Offer
    ↓
Accept / Reject / Cancel / Expire
    ↓
Accepted
    ↓
Convert To Escrow
```

Counter-offers are stored as new Offer records rather than overwriting previous terms.

This preserves negotiation history.

---

## Offer Status

`OfferStatus` includes:

```text
Open
Countered
Accepted
Rejected
Cancelled
Expired
ConvertedToEscrow
```

Terminal records cannot be reopened.

---

## Offer Model

`Offer` stores:

- `offer_id`
- `conversation_tag`
- `maker`
- `taker`
- `asset_type_commitment`
- `asset_commitment`
- `payment_commitment`
- `price_commitment`
- `terms_hash`
- `expires_at`
- `created_at`
- `updated_at`
- `root_offer_id`
- `parent_offer_id`
- `status`
- `escrow_id`

The contract stores commitments instead of plaintext negotiation terms where possible.

---

## Negotiation Chain

Example:

```text
Offer #1
root_offer_id   = 1
parent_offer_id = 0
status          = Open
        ↓ countered

Offer #1
status = Countered

Offer #2
root_offer_id   = 1
parent_offer_id = 1
status          = Open
        ↓ countered

Offer #3
root_offer_id   = 1
parent_offer_id = 2
status          = Open
```

Only the currently open Offer record continues the negotiation.

---

## Offer Authorization

The stateful Offer contract uses `ContractAddress` authorization.

Current direct rules include:

- maker creates an offer,
- current taker may counter,
- current taker may accept,
- current taker may reject,
- current maker may cancel,
- expiration may be materialized after the deadline,
- only the configured trusted coordinator may bind an accepted Offer to an Escrow.

---

## Offer To Escrow Binding

After an Offer is accepted:

```text
OfferStatus::Accepted
        ↓
Trusted coordinator creates escrow
        ↓
VeilOffer.mark_converted_to_escrow(...)
        ↓
OfferStatus::ConvertedToEscrow
```

The Offer stores:

```text
escrow_id
```

and the Escrow stores:

```text
offer_id
```

This creates an explicit bidirectional relationship:

```text
Offer ↔ Escrow
```

---

## Offer Entry Points

| Function | Purpose |
| --- | --- |
| `create_offer(...)` | Creates a new Offer record. |
| `counter_offer(...)` | Closes the current Open offer as `Countered` and creates a new Open Offer. |
| `accept_offer(offer_id)` | Accepts an Open, non-expired Offer. |
| `reject_offer(offer_id)` | Rejects an Open, non-expired Offer. |
| `cancel_offer(offer_id)` | Allows the maker to cancel an Open Offer. |
| `expire_offer(offer_id)` | Materializes expiry after the configured deadline. |
| `mark_converted_to_escrow(offer_id, escrow_id)` | Trusted-coordinator-only binding. |
| `get_offer(offer_id)` | Returns complete Offer state. |
| `get_offer_status(offer_id)` | Returns current Offer status. |
| `get_escrow_id(offer_id)` | Returns the bound Escrow id. |
| `get_offer_count()` | Returns total Offer records. |
| `get_escrow_contract()` | Returns the trusted coordinator contract. |

---

## Important Offer Privacy Boundary

The current stateful `VeilOffer` contract authorizes participants using:

```text
get_caller_address()
```

Therefore it represents the direct/stateful authorization path.

It must **not** be described as anonymous shielded negotiation merely because VEIL also integrates with a Privacy Pool.

For shielded negotiation, encrypted negotiation actions can be represented through the encrypted timeline:

```text
Canonical Privacy Pool
        ↓
InvokeExternal
        ↓
VeilChannelHelper::privacy_invoke(...)
        ↓
encrypted OFFER
encrypted COUNTER_OFFER
encrypted ACCEPT
encrypted REJECT
```

A fully stateful anonymous Offer contract requires an additional proof-backed authorization mechanism.

---
