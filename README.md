# VEIL

VEIL provides an encrypted on-chain messaging transport, offers, payment memos, and escrow negotiation on Starknet. The SDK implements the intended cryptographic sequence: channel keys are derived locally using Stark-curve ECDH, then message payloads are encrypted on the user's device using AES-GCM before ciphertext is submitted on-chain. Transaction metadata remains public.

## Current Product

**Encrypted On-chain** is the selected production transport. Final browser readiness still requires the frontend to resolve each participant's public encryption key and supply recovered channel material to the encryption adapter; missing material fails closed.

- When participant channel material is available, message content is encrypted on the sender's device.
- The VEIL helper receives and stores ciphertext, never plaintext.
- The recipient decrypts on their own device using shared channel material.
- Starknet transaction metadata, sender activity, timing, and ciphertext size remain public.
- Settlement and asset-transfer metadata remain public unless a separate shielded asset path is explicitly available.

Offers, payment memos, and escrow coordination can use the same encrypted conversation. Current asset movement and escrow settlement are public on-chain operations and are not described as shielded.

## Coming Soon

**Shielded via STRK20** is coming soon. Metadata-resistant messaging and settlement through STRK20 and the Starknet Privacy Pool will be enabled only when the official privacy proving runtime is publicly available and passes VEIL's live acceptance criteria.

VEIL never silently downgrades a requested STRK20 operation to direct transport. Production requests fail closed with `STRK20_RUNTIME_UNAVAILABLE` when the official runtime is absent.

## Technical Progress

The repository preserves an **Experimental STWO PoC** using the public Starknet transaction prover. It generated a real STWO proof and proof facts, recovered Privacy Pool server actions, built a final proof-bearing Invoke V3, and passed Privacy Pool simulation. No live transaction was broadcast.

Local proving took approximately 41 minutes while the deployed pool accepted proofs for only 450 blocks, so the fresh proof later failed with `PROOF_EXPIRED`. The PoC is retained as completed protocol research and is not the default frontend or production transport.

See [Experimental STWO Prover](docs/experimental-stwo-prover.md) and [STRK20 Integration TODO](docs/strk20-integration-todo.md).

## Runtime Modes

```text
VEIL_MESSAGE_MODE=encrypted-direct
VEIL_MESSAGE_MODE=strk20-shielded
```

The browser build reads `VITE_VEIL_MESSAGE_MODE`; the default is `encrypted-direct`. Legacy timeline-mode values are normalized for compatibility.

Encrypted direct messaging requires real participant channel material. The frontend creates a separate encrypted device identity, resolves recipient public keys through `VeilEncryptionKeyRegistry`, and derives the shared key locally. Missing material fails closed; VEIL does not generate a local-only fallback key or label a static key as secure channel bootstrap.
Production deployment must deploy the reviewed registry and configure `VITE_VEIL_KEY_REGISTRY_ADDRESS`; messaging fails closed until both participants explicitly register their public keys.

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Documentation

- [Product](docs/product/README.md)
- [Product Guides](docs/guides/README.md)
- [Architecture](docs/architecture/README.md)
- [Technical Documentation](docs/technical/README.md)
- [Experimental STWO Prover](docs/experimental-stwo-prover.md)
- [STRK20 Integration TODO](docs/strk20-integration-todo.md)

## License

Apache-2.0. Copyright 2026 DXJlabs.
