# Privacy And Security Boundaries

## Relationship To Canonical Privacy Pool

VEIL is an application layer.

It does not reimplement Canonical Privacy Pool cryptography.

The Privacy Pool remains responsible for its own protocol behavior, including its privacy execution and proof pipeline.

VEIL adds:

- encrypted application timeline storage,
- encrypted conversation payload commitments,
- private execution-compatible helper entrypoint,
- offer negotiation state,
- private escrow workflow state.

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

## Stateful Offer Path

Current `VeilOffer` authorization relies on:

```text
ContractAddress
get_caller_address()
```

Therefore the current stateful Offer contract should be described as a direct/stateful authorization component.

A future fully shielded stateful Offer flow requires proof-backed anonymous authorization rather than simply routing calls through a Privacy Pool helper.

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

Offer state uses commitment-based fields where practical:

- `asset_type_commitment`
- `asset_commitment`
- `payment_commitment`
- `price_commitment`
- `terms_hash`

However, the current stateful Offer contract still stores direct participant addresses for authorization.

Therefore VEIL should not claim that all Offer state is anonymous.

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

# Current Limitations

The current contracts do not:

- generate Privacy Pool proofs,
- replace Privacy Pool note handling,
- replace Privacy Pool nullifier logic,
- provide their own prover,
- guarantee anonymous authorization for stateful Offer actions,
- automatically make direct `invoke(...)` calls private,
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

   Messages, Offers, and private escrow actions belong to one application flow.

3. **Encrypted timeline semantics**

   Application event types and payloads can remain encrypted.

4. **Commitment-based negotiation data**

   Avoid plaintext terms where commitments are sufficient.

5. **Explicit lifecycle state machines**

   Offer transitions are validated.

6. **Separation of shielded and direct provenance**

   `privacy_invoke(...)` and `invoke(...)` are distinct paths.

7. **No fake anonymous authorization claims**

   Stateful ContractAddress-based authorization is documented honestly.

# Development Status

The contracts are under active development.

Before production deployment, the project should complete:

- full Scarb build verification,
- Starknet Foundry unit tests,
- Offer lifecycle tests,
- counter-offer chain tests,
- access-control tests,
- replay and duplicate-action tests,
- direct timeline spam/authorization review,
- Privacy Pool integration tests,
- gas profiling,
- external security review.

---

# License

See the repository-level license files for applicable terms.
