# VEIL Smart Contracts

VEIL contracts are the Cairo-owned application layer for encrypted onchain communication, negotiation, and private escrow workflows on Starknet.

VEIL does not replace or modify the Starknet Canonical Privacy Pool. Privacy Pool remains responsible for privacy primitives, note handling, nullifiers, proof verification, and private execution. VEIL owns product-level contracts and state transitions.

## Contract Modules

- `contracts/messaging/` - `VeilChannelHelper`, encrypted timeline storage, and `privacy_invoke` compatibility.
- `contracts/offers/` - `VeilOffer`, offer lifecycle, counter-offers, acceptance, cancellation, and escrow binding.
- `contracts/claim_escrow/` - private claim-link custody and claim validation.
- `contracts/private_escrow/` - private escrow action commitments.
- `contracts/private_escrow_settlement/` - private custody settlement through the Privacy Pool.
- `contracts/interfaces/` - shared Cairo interfaces and Privacy Pool-compatible return types.
- `contracts/events/` - shared event definitions.
- `contracts/utils/` - shared constants, hashing, validation, and time helpers.

## Starknet Sepolia Testnet Deployment

Last updated: 2026-07-08.

| Contract | Address | Class hash | Deploy transaction |
| --- | --- | --- | --- |
| `Privacy` | `0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5` | `0x030b8c540cf04d8ef0f4db2a9098d9cc0e35e83af1cb3325f5a4f40144b4b30b` | `0x04692acc8d3e586a65f394d952934acb9997f580f88781e30da4d39b1da5d3b0` |
| `VeilChannelHelper` | `0x052390845931a0c8d4735246d853a1a514c3cbf88cb1714937284814c5e57b23` | `0x7892efb93c77260c410d2e3e29cf6a28421d8e1ab0c688ffaf64304e7e47d97` | `0x0141b71a2dc7c5be0433e282533a64e9f92caf444d04dae5227fbe8e490e9fd5` |
| `VeilOffer` | `0x02f31ea76073dbf57f404513d2160fb0ca81d6d7432be594be10cca37441feab` | `0x04ac44039e5ea11daa8eb5396c88370d48086d6038258319bd66b6b85c2ae84b` | `0x0283f42a45500051c4c6ed613cc0e5a77bfdcc497bbfe199802062eb7293f1d9` |
`VeilChannelHelper` is configured with the Sepolia `Privacy` address above. Its `get_privacy_pool()` read was verified against `0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5`.

The Sepolia `Privacy` deployment comes from the local canonical reference under `reference/contracts/packages/privacy`. Full Shield execution still requires a compatible proof/Privacy SDK path in the client environment.

## Detailed Docs

- [Messaging helper](../docs/contracts/messaging.md)
- [Offers](../docs/contracts/offers.md)
- [Privacy and security boundaries](../docs/contracts/privacy-and-security.md)

## Architecture Boundary

- `contracts/` is VEIL-owned Cairo code.
- `reference/contract/` and `reference/contracts/` are protocol references and must remain read-only unless explicitly updating the local reference.
- VEIL private escrow contracts are VEIL-owned. They are not Privacy Pool primitives.
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
