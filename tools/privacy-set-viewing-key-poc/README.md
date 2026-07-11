# VEIL Privacy SetViewingKey PoC

Local-only Phase 4D adapter for constructing the Privacy Pool `SetViewingKey`
proving flow. It does not submit live transactions.

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
