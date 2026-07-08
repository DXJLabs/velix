# VEIL Smart Contracts

VEIL contracts are the Cairo-owned application layer for encrypted onchain communication, negotiation, escrow, and settlement workflows on Starknet.

VEIL does not replace or modify the Starknet Canonical Privacy Pool. Privacy Pool remains responsible for privacy primitives, note handling, nullifiers, proof verification, and private execution. VEIL owns product-level contracts and state transitions.

## Contract Modules

- `contracts/messaging/` - `VeilChannelHelper`, encrypted timeline storage, and `privacy_invoke` compatibility.
- `contracts/offers/` - `VeilOffer`, offer lifecycle, counter-offers, acceptance, cancellation, and escrow binding.
- `contracts/escrow/` - `VeilEscrow`, deposit commitments, activation, settlement, and cancellation rules.
- `contracts/settlement/` - settlement helper/adapters for VEIL-owned settlement finalization.
- `contracts/interfaces/` - shared Cairo interfaces and Privacy Pool-compatible return types.
- `contracts/events/` - shared event definitions.
- `contracts/utils/` - shared constants, hashing, validation, and time helpers.

## Detailed Docs

- [Messaging helper](../docs/contracts/messaging.md)
- [Offers](../docs/contracts/offers.md)
- [Escrow](../docs/contracts/escrow.md)
- [Privacy and security boundaries](../docs/contracts/privacy-and-security.md)

## Architecture Boundary

- `contracts/` is VEIL-owned Cairo code.
- `reference/contract/` and `reference/contracts/` are protocol references and must remain read-only unless explicitly updating the local reference.
- VEIL escrow is VEIL-owned. It is not a Privacy Pool primitive.
- Shielded paths use Privacy Pool `InvokeExternal` into VEIL contracts where compatible.
- Direct helper paths must not be labeled as shielded.

## Validation Before Push

Run:

```bash
npm run build
npm run test:sdk
scarb --release build
snforge test
```

Do not push if build or tests fail.
