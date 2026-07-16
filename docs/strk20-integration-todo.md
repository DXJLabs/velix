# STRK20 Shielded Messaging Integration

> **Historical, non-authoritative planning record.** Its SDK-availability statement is stale. For current requirements and readiness, use [`VEIL_ARCHITECTURE_LOCK.md`](./VEIL_ARCHITECTURE_LOCK.md) and [`VEIL_PREPRODUCTION_STATUS.md`](./VEIL_PREPRODUCTION_STATUS.md).

Status: **Coming Soon - awaiting official STRK20 Privacy SDK or wallet proving runtime.**

## Completed

- Privacy Pool contract and action analysis
- ECDH-compatible channel derivation
- OpenChannel and InvokeExternal action construction
- Ciphertext message payload support
- Proof and proof facts integration research
- Self-hosted STWO proof PoC
- Official pool simulation
- AVNU private paymaster architecture audit
- AVNU proof submission schema analysis

## Remaining

- Obtain official STRK20 Privacy SDK package
- Identify supported wallet proving RPC
- Implement `OfficialStrk20PrivacySdkProver`
- Implement `Strk20WalletProver`
- Confirm witness and viewing-key privacy guarantees
- Confirm AVNU Sepolia pool whitelist
- Perform one live SetViewingKey transaction
- Perform one live OpenChannel transaction
- Perform one live InvokeExternal VEIL message
- Complete receiver-side live decryption test
- Complete two-device end-to-end test
- Complete security review
- Enable frontend shielded mode

## Acceptance Criteria

Shielded mode may only be enabled when:

1. Proof generation completes inside the deployed pool validity window.
2. The official Privacy Pool accepts the transaction.
3. The transaction is visible on-chain.
4. The recipient successfully decrypts the message.
5. No viewing scalar or plaintext is exposed to VEIL servers.
6. Tests pass on two independent devices.

Until all criteria pass, `strk20-shielded` remains disabled and returns `STRK20_RUNTIME_UNAVAILABLE`. It must never silently fall back to `encrypted-direct`.

## Future Anonymizer Architecture

```text
Privacy Pool
  -> SubAccountAnonymizer
  -> pseudonymous sub-account
  -> VEIL Helper
```

This proposed boundary can reduce direct account correlation at the helper, but it still requires a valid Privacy Pool proof. It does not generate proofs, extend the deployed proof-validity window, or replace the official STRK20 Privacy SDK/wallet runtime.
