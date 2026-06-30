# Privacy Pool ABI Notes

The ABI is useful for decoding calls and events, but ABI data alone is not enough to implement Privacy Pool cryptography or proof generation.

## Implemented From ABI-Level Information

- Known function names and view calls.
- Basic event decoding helpers.
- Transaction/calldata research helpers.
- ClientAction serialization helpers for VEIL-side preparation.

## Not Implemented From ABI

- Stark-curve ECDH.
- Poseidon hashing.
- Channel marker derivation.
- Note id derivation.
- Nullifier derivation.
- Proof generation.
- Official transaction construction for `apply_actions`.

## Current Usage

VEIL uses ABI-level utilities for:

- research adapter decoding,
- fee view calls,
- helper/indexer event handling,
- preparing data for an external Privacy SDK integration.

The ABI should not be treated as a complete protocol implementation.
