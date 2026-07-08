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
| `VeilChannelHelper` | `0x0335b9a8b03e4d4478e29cfa77dba3672e0f87873a369c54353314ae033e1d5c` | `0x7892efb93c77260c410d2e3e29cf6a28421d8e1ab0c688ffaf64304e7e47d97` | `0x0385ff3b625bed7609495f88fceee39e51890a6b072ebf0cb793794218f256d2` |
| `VeilOffer` | `0x02f31ea76073dbf57f404513d2160fb0ca81d6d7432be594be10cca37441feab` | `0x04ac44039e5ea11daa8eb5396c88370d48086d6038258319bd66b6b85c2ae84b` | `0x0283f42a45500051c4c6ed613cc0e5a77bfdcc497bbfe199802062eb7293f1d9` |
| `VeilEscrow` | `0x039922336d0a0fbcbf765bc9c8a5992eb62dabfe80e59d0773b70a172aacd53a` | `0x059c076cd33d457e0e5bf2b2e6070004c6752997c413c2c5664d5f025b356176` | `0x07845250c5564ebc680277c0b604c9b7f7051644acd9733575772cf3139b6392` |
| `VeilSettlementHelper` | `0x007f7e37aec3c6362134ae2d1d80ea705089d80ca71cc5f157a64c9cedd2b862` | `0x617db23dff8fe42748cc875ca4ca9a68f2e1f4eefab42f07479421ce6364aa7` | `0x039ed657f7462dee714d8d8164d03f07966e11990411d8a1990695cc4e0498bb` |

`VeilOffer` is wired to `VeilEscrow` on Sepolia. Wiring transaction:
`0x05b5cc10098f131beb1ea5b1e59434ae9f0787c4613299008e6fd6d63604dd51`.

`VITE_PRIVACY_POOL_ADDRESS` is not configured yet. The helper deployments used a non-zero Sepolia placeholder for the `privacy_pool` constructor value, so the current deployment supports direct testnet/unshield flows. Redeploy helpers with the official Privacy Pool address before claiming a production Shield path.

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
