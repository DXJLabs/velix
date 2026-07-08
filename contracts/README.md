# VEIL Smart Contracts

VEIL is a Cairo-native application layer for encrypted onchain communication, negotiation, and escrow workflows on Starknet.

VEIL does **not** replace or modify the Starknet Canonical Privacy Pool.

Instead, VEIL adds application-level contracts for:

- encrypted conversation timelines,
- private message references,
- payment memos,
- offer negotiation,
- counter-offers,
- offer acceptance and rejection,
- escrow funding workflows,
- settlement orchestration.

The Canonical Privacy Pool remains responsible for its own privacy primitives, note handling, nullifiers, proof verification, and private execution pipeline.

---

## Architecture

```text
                 +---------------------------+
                 |     VEIL Application      |
                 +-------------+-------------+
                               |
        +----------------------+----------------------+
        |                      |                      |
        v                      v                      v
 +---------------+     +---------------+     +---------------+
 |   Messaging   |     |     Offer     |     |    Escrow     |
 +-------+-------+     +-------+-------+     +-------+-------+
         |                     |                     |
         +---------------------+---------------------+
                               |
                               v
                  +---------------------------+
                  |    VeilChannelHelper      |
                  |  Encrypted Timeline API   |
                  +-------------+-------------+
                                |
               +----------------+----------------+
               |                                 |
               v                                 v
        invoke()                    privacy_invoke()
               |                                 |
               v                                 v
        Direct Execution         Canonical Privacy Pool
                                                 |
                                                 v
                                          InvokeExternal
```

VEIL follows a **conversation-first architecture**.

Application flow:

```text
Message
   │
   ▼
Offer
   │
   ▼
Counter Offer
   │
   ▼
Offer Accepted
   │
   ▼
Escrow Created
   │
   ▼
Funding
   │
   ▼
Buyer Deposit
   │
   ▼
Seller Deposit
   │
   ▼
Active
   │
   ▼
Settlement
```

`conversation_tag` is a VEIL application-level identifier.

It must not be treated as:

- a wallet address,
- a recipient address,
- a plaintext conversation identifier,
- a Canonical Privacy Pool channel identifier.

---

## Contract Modules

| File | Role |
| --- | --- |
| `messaging/veil_channel_helper.cairo` | Stores encrypted VEIL conversation timeline data and exposes Privacy Pool-compatible `privacy_invoke`. |
| `offers/veil_offer.cairo` | Manages stateful offer negotiation, counter-offers, acceptance, rejection, cancellation, expiration, and escrow conversion. |
| `offers/offer_types.cairo` | Defines `OfferStatus` and the `Offer` storage model. |
| `offers/offer_validation.cairo` | Contains Offer authorization, expiry, and lifecycle validation. |
| `offers/offer_events.cairo` | Defines Offer lifecycle events. |
| `offers/offer_interfaces.cairo` | Defines the `IVeilOffer` interface. |
| `escrow/veil_escrow.cairo` | Manages escrow creation, funding, activation, settlement, and cancellation. |
| `escrow/escrow_types.cairo` | Defines `EscrowStatus` and the `Escrow` storage model. |
| `escrow/escrow_validation.cairo` | Contains Escrow authorization and lifecycle validation. |
| `events/escrow_events.cairo` | Defines Escrow lifecycle events. |
| `interfaces/escrow_interfaces.cairo` | Defines `IVeilEscrow` and `ISettlementAdapter`. |
| `lib.cairo` | Exports VEIL Cairo modules. |

> Repository paths should use lowercase module names consistently.  
> If the repository still contains `Offers/`, it should eventually be renamed to `offers/`.

---

# VeilChannelHelper

`VeilChannelHelper` is the encrypted onchain timeline helper for VEIL conversations.

It supports two distinct execution paths:

```text
Shielded/private path
Canonical Privacy Pool
        ↓
InvokeExternal
        ↓
privacy_invoke(...)
```

and:

```text
Direct path
Wallet / application
        ↓
invoke(...)
```

These paths are intentionally separate.

A direct call to `invoke(...)` does **not** claim Privacy Pool provenance or anonymity.

---

## Privacy Pool Integration

The helper exposes:

```cairo
fn privacy_invoke(
    ref self: TContractState,
    calldata: Span<felt252>,
) -> Span<OpenNoteDeposit>;
```

The return type uses the Canonical Privacy Pool ABI type:

```cairo
privacy::objects::OpenNoteDeposit
```

The configured Canonical Privacy Pool address is stored in contract storage.

`privacy_invoke(...)` verifies:

```text
get_caller_address() == configured privacy_pool
```

This prevents a wallet from directly calling `privacy_invoke(...)` and pretending that the timeline event originated through Privacy Pool `InvokeExternal`.

---

## Timeline Calldata

Expected calldata:

```text
[
  conversation_tag,
  encrypted_event_type,
  encrypted_payload,
  payload_hash,
  payload_chunk_count,
  ...payload_chunks
]
```

The contract treats encrypted fields as opaque data.

It does not interpret plaintext application semantics such as:

- chat,
- payment memo,
- offer,
- counter-offer,
- accept,
- reject,
- escrow,
- settlement.

Those semantics must be encrypted by the VEIL SDK or client.

---

## Stored Timeline Event

`VeilTimelineEvent` stores:

- `event_id`
- `conversation_tag`
- `encrypted_event_type`
- `encrypted_payload`
- `payload_hash`
- `payload_chunk_count`
- `created_at`

Additional ciphertext chunks are stored separately.

---

## Payload Commitment

Timeline payload integrity uses a domain-separated Poseidon commitment.

Conceptually:

```text
Poseidon(
  TIMELINE_PAYLOAD_DOMAIN,
  conversation_tag,
  encrypted_event_type,
  encrypted_payload,
  payload_chunk_count,
  ...payload_chunks
)
```

This binds the commitment to:

- the VEIL timeline domain,
- the opaque conversation tag,
- encrypted event type,
- encrypted payload,
- explicit chunk count,
- additional ciphertext chunks.

The contract recomputes the commitment and rejects mismatches.

---

## Timeline Entry Points

| Function | Purpose |
| --- | --- |
| `privacy_invoke(calldata)` | Authenticated Canonical Privacy Pool path. Stores an encrypted timeline event and returns an empty `Span<OpenNoteDeposit>`. |
| `invoke(calldata)` | Direct/unshielded timeline append path. |
| `get_privacy_pool()` | Returns the configured Canonical Privacy Pool address. |
| `get_event_count(conversation_tag)` | Returns the number of stored events for an opaque conversation tag. |
| `get_event(conversation_tag, index)` | Returns one stored `VeilTimelineEvent`. |
| `get_payload_chunk(conversation_tag, event_index, chunk_index)` | Returns one stored ciphertext chunk. |

---

## Timeline Event Emission

The helper emits a minimal public event:

```text
TimelineCommitmentStored
```

It intentionally does not emit:

- plaintext event type,
- payload chunks,
- sender address,
- recipient address,
- user-supplied execution mode.

Ciphertext remains retrievable through contract storage.

---

## Timeline Limits

Current implementation includes:

- bounded payload chunk count,
- event index validation,
- chunk index validation,
- domain-separated Poseidon commitments,
- authenticated `privacy_invoke` caller,
- separate direct and Privacy Pool execution paths.

The direct `invoke(...)` path currently does not implement a full participant registry or proof-backed membership system.

Therefore, direct timeline authorization must not be confused with Privacy Pool anonymity.

---

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
- only the configured `VeilEscrow` contract may bind an accepted Offer to an Escrow.

---

## Offer To Escrow Binding

After an Offer is accepted:

```text
OfferStatus::Accepted
        ↓
VeilEscrow creates escrow
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
| `mark_converted_to_escrow(offer_id, escrow_id)` | Trusted VeilEscrow-only binding. |
| `get_offer(offer_id)` | Returns complete Offer state. |
| `get_offer_status(offer_id)` | Returns current Offer status. |
| `get_escrow_id(offer_id)` | Returns the bound Escrow id. |
| `get_offer_count()` | Returns total Offer records. |
| `get_escrow_contract()` | Returns the trusted VeilEscrow contract. |

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

# Settlement Adapter

`ISettlementAdapter` is the extension interface for concrete settlement implementations.

The interface includes:

```text
validate_settlement(...)
finalize_settlement(...)
```

The adapter receives commitment-based Escrow context such as:

- `escrow_id`
- `conversation_tag`
- `offer_id`
- `asset_type_commitment`
- `asset_commitment`
- `payment_commitment`
- `buyer_deposit_commitment`
- `seller_deposit_commitment`

`finalize_settlement(...)` returns an adapter-defined:

```text
settlement_result
```

The interface itself does not guarantee token custody.

Concrete custody and execution semantics depend on the Settlement Adapter implementation.

---

# Relationship To Canonical Privacy Pool

VEIL is an application layer.

It does not reimplement Canonical Privacy Pool cryptography.

The Privacy Pool remains responsible for its own protocol behavior, including its privacy execution and proof pipeline.

VEIL adds:

- encrypted application timeline storage,
- encrypted conversation payload commitments,
- private execution-compatible helper entrypoint,
- offer negotiation state,
- escrow workflow state,
- settlement orchestration.

The primary integration point is:

```text
Canonical Privacy Pool
        ↓
InvokeExternal
        ↓
VeilChannelHelper::privacy_invoke(...)
```

`VeilChannelHelper` imports the Canonical ABI type:

```cairo
privacy::objects::OpenNoteDeposit
```

Messaging timeline writes return an empty:

```text
Span<OpenNoteDeposit>
```

because message storage itself does not create an Open Note deposit.

---

# Shielded And Direct Paths

## Shielded Timeline Path

```text
User
  ↓
Canonical Privacy Pool flow
  ↓
InvokeExternal
  ↓
VeilChannelHelper::privacy_invoke(...)
  ↓
Encrypted Timeline Event
```

`privacy_invoke(...)` authenticates the configured Privacy Pool caller.

---

## Direct Timeline Path

```text
User / Application
        ↓
VeilChannelHelper::invoke(...)
        ↓
Encrypted Timeline Event
```

This path does not provide Privacy Pool anonymity.

---

## Stateful Offer And Escrow Path

Current `VeilOffer` and `VeilEscrow` authorization relies on:

```text
ContractAddress
get_caller_address()
```

Therefore the current stateful Offer and Escrow contracts should be described as direct/stateful authorization components.

A future fully shielded stateful Offer/Escrow flow requires proof-backed anonymous authorization rather than simply routing calls through a Privacy Pool helper.

---

# Privacy Model

VEIL aims to minimize plaintext application data onchain.

The encrypted timeline does not intentionally store:

- plaintext messages,
- plaintext event types,
- sender address inside timeline payload semantics,
- recipient address inside timeline payload semantics,
- plaintext negotiation text.

Instead, timeline storage uses:

- opaque `conversation_tag`,
- `encrypted_event_type`,
- encrypted payload data,
- Poseidon payload commitments,
- encrypted payload chunks.

Offer and Escrow state uses commitment-based fields where practical:

- `asset_type_commitment`
- `asset_commitment`
- `payment_commitment`
- `price_commitment`
- `terms_hash`
- deposit commitments

However, the current stateful Offer and Escrow contracts still store direct participant addresses for authorization.

Therefore VEIL should not claim that all Offer/Escrow state is anonymous.

---

# Current Security Boundaries

The current architecture intentionally distinguishes:

### Authenticated Privacy Pool timeline path

```text
privacy_invoke(...)
```

Caller must equal the configured Canonical Privacy Pool contract.

### Direct timeline path

```text
invoke(...)
```

Does not claim Privacy Pool anonymity.

### Stateful Offer authorization

Uses maker/taker `ContractAddress`.

### Stateful Escrow authorization

Uses buyer/seller `ContractAddress`.

### Settlement

Delegated to configured `ISettlementAdapter`.

---

# Current Limitations

The current contracts do not:

- generate Privacy Pool proofs,
- replace Privacy Pool note handling,
- replace Privacy Pool nullifier logic,
- provide their own prover,
- guarantee anonymous authorization for stateful Offer actions,
- guarantee anonymous authorization for stateful Escrow actions,
- automatically make direct `invoke(...)` calls private,
- guarantee token custody without a concrete settlement implementation,
- hide public blockchain transaction timing.

A complete application also requires supporting client infrastructure such as:

- VEIL SDK,
- payload encryption,
- key derivation,
- Privacy Pool action construction,
- encrypted timeline discovery,
- decryption,
- indexing,
- transaction submission.

---

# Design Principles

VEIL contracts follow these principles:

1. **Do not modify Canonical Privacy Pool**

   VEIL integrates through application-layer helpers.

2. **Conversation-first architecture**

   Messages, Offers, Escrow, and Settlement belong to one application flow.

3. **Encrypted timeline semantics**

   Application event types and payloads can remain encrypted.

4. **Commitment-based negotiation data**

   Avoid plaintext terms where commitments are sufficient.

5. **Explicit lifecycle state machines**

   Offer and Escrow transitions are validated.

6. **Separation of shielded and direct provenance**

   `privacy_invoke(...)` and `invoke(...)` are distinct paths.

7. **No fake anonymous authorization claims**

   Stateful ContractAddress-based authorization is documented honestly.

8. **Modular settlement**

   Concrete settlement logic is delegated through `ISettlementAdapter`.

---

# Development Status

The contracts are under active development.

Before production deployment, the project should complete:

- full Scarb build verification,
- Starknet Foundry unit tests,
- Offer lifecycle tests,
- counter-offer chain tests,
- Offer-to-Escrow binding tests,
- Escrow funding tests,
- Settlement Adapter tests,
- access-control tests,
- replay and duplicate-action tests,
- direct timeline spam/authorization review,
- Privacy Pool integration tests,
- gas profiling,
- external security review.

---

# License

See the repository-level license files for applicable terms.
