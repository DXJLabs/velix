# VEIL Smart Contracts

VEIL has its own Cairo smart contracts. They implement the VEIL application layer: encrypted timeline references and escrow workflow state. They do not replace STRK20 Privacy Pool.

## Contract Modules

| File | Role |
| --- | --- |
| `messaging/veil_channel_helper.cairo` | Stores encrypted VEIL timeline event references and exposes a `privacy_invoke`-compatible helper entrypoint. |
| `escrow/veil_escrow.cairo` | Stores escrow workflow state for buyer/seller negotiation flows. |
| `interfaces/escrow_interfaces.cairo` | Defines `IVeilEscrow` and a future `ISettlementAdapter` interface. |
| `escrow/escrow_types.cairo` | Defines `EscrowStatus` and the `Escrow` storage struct. |
| `events/escrow_events.cairo` | Defines escrow lifecycle events. |
| `escrow/escrow_validation.cairo` | Contains escrow access-control and state-transition assertions. |
| `lib.cairo` | Exports the VEIL Cairo modules. |

## `VeilChannelHelper`

`VeilChannelHelper` is the onchain timeline helper for VEIL messages and negotiation metadata.

### Entry Points

| Function | Purpose |
| --- | --- |
| `privacy_invoke(calldata)` | Stores a timeline event and returns an empty `Span<OpenNoteDeposit>`. This shape is compatible with Privacy Pool `InvokeExternal` helper calls. |
| `invoke(calldata)` | Direct-call alias used by the current direct helper / unshield path. |
| `get_event_count(channel_id)` | Returns the number of events stored for a channel. |
| `get_event(channel_id, index)` | Returns one stored `VeilTimelineEvent`. |
| `get_payload_chunk(channel_id, event_index, chunk_index)` | Reads a stored payload chunk. |

### Stored Event Shape

`VeilTimelineEvent` stores:

- `event_id`
- `channel_id`
- `event_type`
- `encrypted_payload`
- `payload_hash`
- `payload_chunk_count`
- `created_at`

Optional payload chunks are stored separately in `payload_chunks`.

### Supported Event Types

The helper validates these event type constants:

- `EVENT_CHAT`
- `EVENT_PAYMENT_MEMO`
- `EVENT_OFFER`
- `EVENT_COUNTER_OFFER`
- `EVENT_ACCEPT_OFFER`
- `EVENT_REJECT_OFFER`
- `EVENT_ESCROW_CREATED`
- `EVENT_ESCROW_DEPOSITED`
- `EVENT_ESCROW_SETTLED`
- `EVENT_ESCROW_CANCELLED`
- `EVENT_PROOF_ATTACHED`

### Events Emitted

- `TimelineEventStored`
- `TimelinePayloadChunkStored`

### Current Limits

- The helper stores ciphertext references, not plaintext.
- It does not transfer tokens.
- It does not generate proofs.
- Direct calls to `invoke` do not provide Privacy Pool anonymity.
- Privacy Pool Shield usage requires an external Privacy SDK/prover to call the helper through `InvokeExternal`.

## `VeilEscrow`

`VeilEscrow` is VEIL's escrow workflow contract. It records agreement state between buyer and seller. It does not custody tokens.

### Stored Escrow Fields

`Escrow` stores:

- `escrow_id`
- `channel_id`
- `buyer`
- `seller`
- `asset_type`
- `asset_reference`
- `payment_reference`
- `buyer_deposited`
- `seller_deposited`
- `status`
- `created_at`

`asset_reference` and `payment_reference` are felt references. They can point to offchain metadata, helper timeline entries, or future settlement adapter outputs. The current contract does not interpret them as Privacy Pool notes.

### Status Values

- `Created`
- `Active`
- `Completed`
- `Cancelled`

### Entry Points

| Function | Access | Purpose |
| --- | --- | --- |
| `create_escrow(channel_id, seller, asset_type, asset_reference, payment_reference)` | Caller becomes buyer | Creates a new escrow in `Created` status. |
| `confirm_buyer_deposit(escrow_id)` | Buyer only | Marks buyer deposit reference as confirmed. |
| `confirm_seller_deposit(escrow_id)` | Seller only | Marks seller deposit reference as confirmed. |
| `activate(escrow_id)` | Buyer or seller | Moves escrow to `Active` after both deposits are confirmed. |
| `settle(escrow_id)` | Buyer or seller | Moves an active escrow to `Completed`. |
| `cancel(escrow_id)` | Buyer or seller | Cancels an escrow while it is still cancellable. |
| `get_escrow(escrow_id)` | View | Reads escrow data. |
| `get_status(escrow_id)` | View | Reads current status. |
| `get_escrow_count()` | View | Reads created escrow count. |

### Validation Rules

Implemented validation includes:

- buyer and seller must be non-zero and different,
- channel and reference fields must be non-zero,
- only buyer can confirm buyer deposit,
- only seller can confirm seller deposit,
- only participants can activate, settle, or cancel,
- both deposit flags are required before activation,
- valid status transitions are enforced,
- completed escrows cannot be modified,
- reentrancy guard wraps state-changing entrypoints.

### Events Emitted

- `EscrowCreated`
- `BuyerDepositConfirmed`
- `SellerDepositConfirmed`
- `EscrowActivated`
- `EscrowSettled`
- `EscrowCancelled`

## Settlement Adapter Interface

`ISettlementAdapter` is defined but no settlement adapter implementation is included in this directory.

It declares:

- `validate_settlement_reference(...)`
- `finalize_settlement(...)`

This is a future extension point. It is not current token custody or Privacy Pool settlement logic.

## Relationship To Privacy Pool

VEIL contracts are application contracts:

- `VeilChannelHelper` can be called directly today.
- The same helper entrypoint shape can be used by future Privacy Pool `InvokeExternal` flows.
- `VeilEscrow` coordinates workflow state and references.

The contracts do not implement Privacy Pool cryptography, note handling, nullifiers, or proof validation.
