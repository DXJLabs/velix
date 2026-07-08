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
