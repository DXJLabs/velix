# Phase 4 Transaction Prover Pins

These pins are the reviewed Phase 4 boundary for VEIL. Do not replace the tag,
digest, or commits with `latest`, `main`, or another floating reference.

## Immutable runtime image

| Field | Locked value |
| --- | --- |
| Implementation | `starknet_transaction_prover` |
| Registry | `ghcr.io/starkware-libs/starknet-privacy/transaction-prover` |
| Published tag | `PRIVACY-0.14.3-RC.2` |
| Multi-architecture digest | `sha256:a2f71d7139069fa566c4f44bdd66b79cac992c0cbc20ddf0af3a3558c6cabd64` |
| Linux amd64 manifest | `sha256:a62e7764e034ea25d84d4a235f1f683f7c5f03f88f6646a744599171bf5ca58c` |
| Linux arm64 manifest | `sha256:9882d27692b420a9edae9b50bf8075103044230de0f83ee6bed3db19cace105f` |
| Source repository | `starkware-libs/sequencer` |
| Source tag | `PRIVACY-0.14.3-RC.2` |
| Source commit | `e6b6fd2e9932909107833579e5b6efd6c75fa0af` |
| Runtime OS | Ubuntu 24.04 Linux, non-root image user |
| Container port | `3000/tcp` |
| Architectures | `linux/amd64`, `linux/arm64` |

Use this digest-qualified reference:

```text
ghcr.io/starkware-libs/starknet-privacy/transaction-prover@sha256:a2f71d7139069fa566c4f44bdd66b79cac992c0cbc20ddf0af3a3558c6cabd64
```

The OCI source/revision/version labels and the official RC.2 release workflow
tie this image to the source commit above.

## Protocol and source compatibility

| Component | Locked value | Provenance |
| --- | --- | --- |
| Privacy SDK | `0.14.3-rc.2` / `PRIVACY-0.14.3-RC.2` | `starkware-libs/starknet-privacy@9bfeb8dd35565a2915a0617dff3f649bd5bb891a` |
| Privacy Pool compatibility | `PRIVACY-0.14.3-RC.0` | VEIL compatibility matrix |
| Transaction | Invoke V3 only | Transaction prover RC.2 README and OpenRPC schema |
| Authorization | `OutsideExecutionVersion.V2` | VEIL transport gate; not a prover RPC field |
| Chain | Starknet Sepolia | VEIL transport gate |
| JSON-RPC | `2.0` | Transaction prover OpenRPC schema |
| Prover RPC version | `0.10.3-rc.2` | `starknet-specs@82376e69dee268c5ddce8333499b7a7dce57095d` |
| Health method | `GET /health` -> `{ "status": "ok" }` | Transaction prover RC.2 README |
| Spec method | `starknet_specVersion` | Transaction prover OpenRPC schema |
| Proof method | `starknet_proveTransaction` | Transaction prover OpenRPC schema |

Authoritative source links:

- <https://github.com/starkware-libs/sequencer/tree/e6b6fd2e9932909107833579e5b6efd6c75fa0af/crates/bin/starknet_transaction_prover>
- <https://github.com/starkware-libs/starknet-privacy/tree/9bfeb8dd35565a2915a0617dff3f649bd5bb891a>
- <https://github.com/starkware-libs/starknet-specs/blob/82376e69dee268c5ddce8333499b7a7dce57095d/proving-api/starknet_proving_api_openrpc.json>

## Operating envelope

The upstream RC.2 documentation recommends 48 vCPU and 96 GiB RAM. The image
defaults to two concurrent proof jobs and ten connections. The upstream HTTP
body limit is 5 MiB. VEIL applies lower defaults at its own boundary:

- request: 1 MiB;
- response: 2 MiB;
- decoded proof: 1 MiB;
- connection/health attempt: 5 seconds;
- proof-generation attempt: 15 minutes;
- total retry operation: 20 minutes;
- health retries: one;
- proof-generation retries: two, transient failures only.

The local Rust helper uses crates.io dependencies locked by `Cargo.lock`. That
lockfile controls the helper client, not the official prover image or source.

## Superseded historical pin

The previous PoC pin `starkware-libs/sequencer@405aae582ff4f9da0bd59acf6e36817cb7e65ef5`
is historical evidence only. It is not compatible evidence for the reviewed
RC.2 image and must not be used by the Phase 4 boundary.
