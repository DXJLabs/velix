# VeilEscrow

`VeilEscrow` manages the stateful escrow lifecycle after an accepted Offer.

Expected flow:

```text
Accepted Offer
      ↓
Escrow Created
      ↓
Funding
      ↓
Buyer Deposit Confirmed
      ↓
Seller Deposit Confirmed
      ↓
Active
      ↓
Settlement Adapter
      ↓
Completed
```

Cancellation is available only under the configured lifecycle policy.

---

## Escrow Status

`EscrowStatus` includes:

```text
Created
Funding
Active
Completed
Cancelled
```

Expected transitions:

```text
Created
  ├──▶ Funding
  └──▶ Cancelled

Funding
  ├──▶ Active
  └──▶ Cancelled

Active
  └──▶ Completed

Completed
  └── terminal

Cancelled
  └── terminal
```

---

## Escrow Model

`Escrow` stores:

- `escrow_id`
- `conversation_tag`
- `offer_id`
- `buyer`
- `seller`
- `asset_type_commitment`
- `asset_commitment`
- `payment_commitment`
- `buyer_deposit_commitment`
- `seller_deposit_commitment`
- `buyer_deposited`
- `seller_deposited`
- `settlement_adapter`
- `settlement_result`
- `status`
- `created_at`
- `updated_at`
- `completed_at`

---

## Escrow Creation

An Escrow is created from an accepted VEIL Offer.

The implementation verifies:

- non-zero participants,
- buyer and seller are different,
- valid conversation tag,
- valid accepted Offer,
- participant consistency,
- conversation consistency,
- asset type commitment consistency,
- asset commitment consistency,
- payment commitment consistency,
- Offer is not already bound to another Escrow,
- valid Settlement Adapter address.

After creation:

```text
Created
  ↓
Funding
```

and the accepted Offer is bound to the new Escrow.

---

## Deposit Confirmation

Buyer confirmation stores:

```text
buyer_deposited = true
buyer_deposit_commitment = ...
```

Seller confirmation stores:

```text
seller_deposited = true
seller_deposit_commitment = ...
```

Deposits are accepted only while the Escrow is in `Funding`.

The current contract records deposit commitments/references.

Whether a commitment represents actual token custody depends on the concrete integration and Settlement Adapter.

---

## Activation

Either participant may activate the Escrow after:

```text
buyer_deposited  == true
seller_deposited == true
```

The lifecycle transition is:

```text
Funding
  ↓
Active
```

---

## Settlement

Settlement uses the configured `ISettlementAdapter`.

Expected flow:

```text
Active Escrow
      ↓
validate_settlement(...)
      ↓
finalize_settlement(...)
      ↓
settlement_result
      ↓
Completed
```

The returned `settlement_result` is adapter-defined.

It may represent:

- a settlement commitment,
- execution reference,
- receipt reference,
- adapter-specific result identifier.

---

## Escrow Entry Points

| Function | Purpose |
| --- | --- |
| `create_escrow(...)` | Creates an Escrow from an accepted VEIL Offer. |
| `confirm_buyer_deposit(escrow_id, deposit_commitment)` | Confirms the buyer-side deposit commitment. |
| `confirm_seller_deposit(escrow_id, deposit_commitment)` | Confirms the seller-side deposit commitment. |
| `activate(escrow_id)` | Moves fully funded Escrow from `Funding` to `Active`. |
| `settle(escrow_id)` | Validates and finalizes settlement through the configured adapter. |
| `cancel(escrow_id)` | Cancels an Escrow when lifecycle policy allows. |
| `get_escrow(escrow_id)` | Returns complete Escrow state. |
| `get_status(escrow_id)` | Returns Escrow status. |
| `get_offer_id(escrow_id)` | Returns the originating Offer id. |
| `get_settlement_adapter(escrow_id)` | Returns the configured Settlement Adapter. |
| `get_escrow_count()` | Returns total created Escrows. |

---
