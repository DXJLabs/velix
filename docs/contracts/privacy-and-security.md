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
