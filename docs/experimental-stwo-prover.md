# Experimental STWO Prover

**Experimental research - not the default production transport.**

VEIL preserves a self-hosted proving proof-of-concept built from public StarkWare components. This work demonstrates protocol compatibility and transaction construction; it does not demonstrate a live accepted Privacy Pool transaction.

## Verified Results

- The public Starknet transaction prover was built.
- A Starknet 0.14.3-compatible sequencer, proving-utils, STWO, and stwo-cairo stack was used.
- A real `SetViewingKey` virtual transaction was executed.
- A real STWO proof and real `proof_facts` were generated.
- `ServerAction[]` was recovered and used to construct `apply_actions` calldata.
- The final proof-bearing Invoke V3 hash was computed after attaching proof facts and signed locally.
- The exact transaction passed Privacy Pool simulation on ZAN latest and PublicNode latest at the time recorded in the Phase 4D report.
- No live transaction was broadcast.
- Local proving took approximately 41 minutes.
- The deployed pool proof-validity window was 450 blocks.
- A later fresh proof was rejected with `PROOF_EXPIRED` because proving and follow-up processing exceeded that validity window.

The AVNU SDK and Paymaster architecture were also audited. AVNU supplies private swap build data, fee handling, relaying, and a proof-submission schema. `@avnu/avnu-sdk@4.1.0-next.2` does not contain the proving implementation. The official STRK20 Privacy SDK or wallet proving runtime remains the production dependency.

| Component | Status |
|---|---|
| Stark ECDH compatibility | Complete |
| Local encryption/decryption | Complete |
| Privacy Pool action construction | Complete |
| Real STWO proof generation | Complete, experimental |
| Privacy Pool simulation | Passed |
| Live shielded broadcast | Blocked by proving latency |
| Official STRK20 runtime | Awaiting public availability |
| Encrypted direct messaging | Available |

Raw proofs, signed transaction JSON, private requests, and secrets are intentionally kept outside Git. See `docs/reports/phase-4d-set-viewing-key-poc.md` for the public-safe technical checkpoint.
