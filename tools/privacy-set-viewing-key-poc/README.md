# VEIL Privacy SetViewingKey PoC

Local-only Phase 4D adapter for constructing the Privacy Pool `SetViewingKey`
proving flow. It does not submit live transactions.

This tool is retained as historical/local RPC tooling. Its SetViewingKey proof
intent does not satisfy the Phase 4 canonical helper rule requiring exactly one
allowlisted `InvokeExternal`. The production-facing TypeScript boundary rejects
that mismatch. Do not use a successful run of this PoC as canonical helper,
Sepolia, Shield, or two-party verification evidence.

The CLI is fail-closed around secrets:

- account signing key is read only from `VEIL_POC_ACCOUNT_PRIVATE_KEY`
- viewing scalar is generated in memory by default
- private virtual calldata is never written to artifact files
- prover URL must be localhost

Typical commands:

```powershell
cargo run --manifest-path tools/privacy-set-viewing-key-poc/Cargo.toml -- inspect
cargo run --manifest-path tools/privacy-set-viewing-key-poc/Cargo.toml -- build-private --user-address 0x...
cargo run --manifest-path tools/privacy-set-viewing-key-poc/Cargo.toml -- prove --user-address 0x...
cargo run --manifest-path tools/privacy-set-viewing-key-poc/Cargo.toml -- validate-rpc
cargo run --manifest-path tools/privacy-set-viewing-key-poc/Cargo.toml -- class-hash --artifact /path/to/privacy_Privacy.contract_class.json
```

`prove` requires a self-hosted `starknet_transaction_prover` on localhost and a
valid deployed Starknet user account key in the environment. It intentionally
stops before `starknet_addInvokeTransaction`.

Use only the image and source revisions in [PINS.md](./PINS.md). The repeatable
Phase 4 operator procedure and evidence rules are documented in
[`docs/internal/testing/PHASE_4_LOCAL_PROVER_RUNBOOK.md`](../../docs/internal/testing/PHASE_4_LOCAL_PROVER_RUNBOOK.md).
