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

## Starknet Sepolia Testnet Deployment

Last updated: 2026-07-08.

| Contract | Address | Class hash | Deploy transaction |
| --- | --- | --- | --- |
| `Privacy` | `0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5` | `0x030b8c540cf04d8ef0f4db2a9098d9cc0e35e83af1cb3325f5a4f40144b4b30b` | `0x04692acc8d3e586a65f394d952934acb9997f580f88781e30da4d39b1da5d3b0` |
| `VeilChannelHelper` | `0x052390845931a0c8d4735246d853a1a514c3cbf88cb1714937284814c5e57b23` | `0x7892efb93c77260c410d2e3e29cf6a28421d8e1ab0c688ffaf64304e7e47d97` | `0x0141b71a2dc7c5be0433e282533a64e9f92caf444d04dae5227fbe8e490e9fd5` |
| `VeilOffer` | `0x02f31ea76073dbf57f404513d2160fb0ca81d6d7432be594be10cca37441feab` | `0x04ac44039e5ea11daa8eb5396c88370d48086d6038258319bd66b6b85c2ae84b` | `0x0283f42a45500051c4c6ed613cc0e5a77bfdcc497bbfe199802062eb7293f1d9` |
| `VeilEscrow` | `0x039922336d0a0fbcbf765bc9c8a5992eb62dabfe80e59d0773b70a172aacd53a` | `0x059c076cd33d457e0e5bf2b2e6070004c6752997c413c2c5664d5f025b356176` | `0x07845250c5564ebc680277c0b604c9b7f7051644acd9733575772cf3139b6392` |
| `VeilSettlementHelper` | `0x04b327c028534000e87512ac962cb0f30f72f215632b88dd39282ad7ded5ef65` | `0x617db23dff8fe42748cc875ca4ca9a68f2e1f4eefab42f07479421ce6364aa7` | `0x07b0a5f3f5e14fec70e963b5416b18783b2bafefd58a9defdba55b601798d3fe` |

`VeilOffer` is wired to `VeilEscrow` on Sepolia. Wiring transaction:
`0x05b5cc10098f131beb1ea5b1e59434ae9f0787c4613299008e6fd6d63604dd51`.

`VeilChannelHelper` and `VeilSettlementHelper` are configured with the Sepolia `Privacy` address above. The helper `get_privacy_pool()` reads were verified against `0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5`.

The Sepolia `Privacy` deployment comes from the local canonical reference under `reference/contracts/packages/privacy`. Full Shield execution still requires a compatible proof/Privacy SDK path in the client environment.

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
