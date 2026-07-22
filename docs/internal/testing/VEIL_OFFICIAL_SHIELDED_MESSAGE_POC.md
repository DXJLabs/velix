# Official Privacy SDK Shielded-Message PoC

The manually dispatched workflow
`.github/workflows/veil-official-shielded-message-poc.yml` uses the persistent
CI account identity and the self-hosted STWO transaction prover on Starknet
Sepolia.

Run modes:

- `generate_proof=false`, `submit_onchain=false`: build, test, verify the
  deployed helper and Privacy Pool configuration, validate encrypted calldata,
  and perform local self-recipient decryption without proving or submission.
- `generate_proof=true`, `submit_onchain=false`: generate a real Official
  Privacy SDK proof without submitting a transaction.
- `generate_proof=true`, `submit_onchain=true`: submit the official
  `callAndProof.call`, require `ACCEPTED_ON_L2` and `SUCCEEDED`, verify the
  `MessageCommitted` event and stored ciphertext chunks, then decrypt locally.

For the submission mode, the PoC supplies bounded resource limits derived from
the accepted shielded-message attempt's measured gas usage and gas prices at
the same finalized block used for proving. A 40% price margin is applied. This
avoids the account client's automatic proof-bearing fee estimate; the deployed
Privacy Pool rejects the SDK's call-only `compile_actions` simulation with
`SENDER_NOT_AUTHENTICATED`. No simulation fallback or direct helper call is
used.

The Official SDK `InvokeExternal` action receives the ABI-encoded argument for
`VeilChannelHelper.privacy_invoke`: the ciphertext payload is prefixed with its
felt count because the helper entrypoint accepts one `Span<felt252>`.

A successful submission verdict proves a real Official Privacy Pool
`InvokeExternal` call reached `VeilChannelHelper.privacy_invoke`, the real proof
was submitted on-chain, the committed ciphertext was stored and read back
unchanged, and self-recipient local decryption succeeded. Plaintext is never
placed in calldata, events, logs, or artifacts.

This PoC does not prove real two-party messaging, discovery by a second account,
frontend wallet integration, or production readiness. `VeilChannelHelper` is
only the application target of the Privacy Pool invocation; it is not by itself
proof that shielded messaging is complete.
