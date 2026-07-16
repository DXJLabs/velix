# VEIL Phase 4D SetViewingKey Prover PoC Report

> **Historical, non-authoritative research record.** For current requirements and readiness, use [`../VEIL_ARCHITECTURE_LOCK.md`](../VEIL_ARCHITECTURE_LOCK.md) and [`../VEIL_PREPRODUCTION_STATUS.md`](../VEIL_PREPRODUCTION_STATUS.md).

Date: 2026-07-11
Network: Starknet Sepolia (`SN_SEPOLIA`)
Privacy Pool: `0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5`

## Summary

Phase 4D produced a local-only Rust proof-of-concept for proving
`ClientAction::SetViewingKey` with the public StarkWare transaction prover.
No transaction was broadcast.

The PoC:

- builds a private virtual Invoke V3 for `compile_actions`;
- calls a self-hosted `starknet_transaction_prover`;
- receives real `proof`, `proof_facts`, and one L2-to-L1 server-action message;
- recovers `ServerAction[]` from the prover output;
- builds final `apply_actions(actions)` calldata;
- attaches `proof` and `proof_facts` as Invoke V3 transaction fields;
- recomputes the final transaction hash after attaching `proof_facts`;
- signs the final transaction locally;
- simulates the exact signed transaction against Sepolia RPC providers.

Raw proof artifacts and signed transaction JSON are stored outside Git under
`/tmp/veil_0143_artifacts/` on the local machine.

## Exact 0.14.3 Pins

| Component | Repository | Pin |
| --- | --- | --- |
| Sequencer / transaction prover | `starkware-libs/sequencer` | `PRIVACY-0.14.3-RC.2` / `e6b6fd2e9932909107833579e5b6efd6c75fa0af` |
| proving-utils | `starkware-libs/proving-utils` | `3035dd00421daa541894297bd754db6e2787807b` |
| Stwo | `starkware-libs/stwo` | `489a0f3ee44a59e03944ad9aa4f3e5a91a3d3f08` |
| stwo-cairo | `starkware-libs/stwo-cairo` | `9b6be2710e4d7124bc93fe80a5af36556d42ed29` |
| stwo-circuits | `starkware-libs/stwo-circuits` | `5ef951a12727e3489a2ee991c580a5b925c59c69` |

The generated Virtual OS hash was:

```text
0x53f6c9fcfd31d27279ff7d7e422b44623550a732b59fe193354a7316a96daa1
```

This matches the public `blockifier_versioned_constants_0_14_3.json`
allowed-program set for Starknet `0.14.3`.

## Proof Output

The self-hosted prover generated a real proof and real proof facts.

Observed proof metadata:

| Field | Value |
| --- | --- |
| Proof length | `302144` characters |
| Proof facts length | `9` felts |
| Program variant | `VIRTUAL_SNOS` |
| OS output version | `VIRTUAL_SNOS0` |
| Virtual OS hash | `0x53f6c9fcfd31d27279ff7d7e422b44623550a732b59fe193354a7316a96daa1` |
| Base block number | `0xb4c053` |
| L2-to-L1 messages | `1` |
| Message hashes | `1` |

The PoC recovered `ServerAction[]` from the returned L2-to-L1 message.
The final `apply_actions` calldata was built from the recovered actions, not
from a hand-written replacement.

## Final Transaction

The final transaction targets `PrivacyPool.apply_actions(actions)`.

| Field | Value |
| --- | --- |
| Target | `0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5` |
| Selector | `0x246333a752c1ac637ff1591c5c885e27d56060d241a29aad8475072da0777db` |
| Calldata felts | `21` |
| Proof present | yes |
| Proof facts length | `9` |
| Signature length | `2` |

Transaction hash behavior:

| Hash | Value |
| --- | --- |
| Without proof facts | `0x67f72c3f7091e4c09bd106a1dec6251b89c8f6b526531317815709df1ea2793` |
| Final hash after proof facts | `0x7cca92af81f58d1702f28c5e41ff4652c19cc4dc63dbeb2fab4edc84ed24904` |

The final signature was generated after attaching `proof` and `proof_facts`.

## Simulation Results

The exact same signed transaction was simulated without broadcasting.

| Provider | Spec version | Block | Starknet version | Result |
| --- | --- | --- | --- | --- |
| ZAN authenticated | `0.10.3-rc.0` | latest `11846466` | `0.14.3` | success |
| ZAN authenticated | `0.10.3-rc.0` | pending | unavailable | `Invalid block id` |
| dRPC public | `0.10.2` | latest `11846477` | `0.14.3` | `method is not available` |
| dRPC public | `0.10.2` | pending | unavailable | `unknown block tag 'pending'` |
| PublicNode public | `0.10.2` | latest `11846489` | `0.14.3` | success |
| PublicNode public | `0.10.2` | pending | unavailable | `unknown block tag 'pending'` |

The successful ZAN and PublicNode simulations show that the previous
`Virtual OS program hash is not allowed` error was not network-wide. It was
most likely provider/backend lag or a stale simulation context at the moment
of the earlier test.

## Safety

- No live transaction was broadcast.
- No raw proof artifact is committed.
- No signed transaction JSON is committed.
- No account private key is committed.
- No Privacy Pool viewing scalar is committed.
- No prover request body is committed.
- No Rust `target/` directory is committed.
- Temporary proof artifacts remain outside Git.

## Readiness For Phase 4E

Phase 4E is ready for a controlled Sepolia submission, subject to a final
preflight immediately before broadcast:

1. Re-check account nonce.
2. Re-simulate the preserved signed transaction or rebuild/sign with the fresh
   nonce if the nonce changed.
3. Verify the provider reports Starknet `0.14.3` or newer.
4. Submit only through a provider that accepts the proof facts in simulation.
5. Wait for receipt and verify `get_public_key(user_addr)` after acceptance.

The current preserved signed transaction uses nonce `0x239`; it must not be
broadcast if the account nonce has changed.
