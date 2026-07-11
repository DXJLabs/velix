# Phase 4D Public Prover Pins

These are the public source revisions this PoC targets for the self-hosted
transaction prover boundary. Do not silently move them to latest/main.

| Component | Repository | Commit | Purpose |
| --- | --- | --- | --- |
| Sequencer / transaction prover | `starkware-libs/sequencer` | `405aae582ff4f9da0bd59acf6e36817cb7e65ef5` | `starknet_transaction_prover` and `starknet_proveTransaction` |
| proving-utils | `starkware-libs/proving-utils` | `3035dd00421daa541894297bd754db6e2787807b` | Sequencer-pinned prover utilities |
| Stwo | `starkware-libs/stwo` | `489a0f3ee44a59e03944ad9aa4f3e5a91a3d3f08` | Sequencer-pinned proving backend |
| stwo-cairo | `starkware-libs/stwo-cairo` | `9b6be2710e4d7124bc93fe80a5af36556d42ed29` | Sequencer-pinned Cairo proving backend |
| Starknet specs | `starkware-libs/starknet-specs` | `82376e69dee268c5ddce8333499b7a7dce57095d` | Invoke V3 proof/proof_facts transaction shape |

The local Rust helper crate uses crates.io dependencies locked by
`Cargo.lock`. It does not vendor the public prover repositories into VEIL.
