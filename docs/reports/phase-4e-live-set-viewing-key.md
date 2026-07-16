# VEIL PHASE 4E LIVE SETVIEWINGKEY REPORT

> **Historical, non-authoritative research record.** For current requirements and readiness, use [`../VEIL_ARCHITECTURE_LOCK.md`](../VEIL_ARCHITECTURE_LOCK.md) and [`../VEIL_PREPRODUCTION_STATUS.md`](../VEIL_PREPRODUCTION_STATUS.md).

Date: 2026-07-11
Network: Starknet Sepolia (`SN_SEPOLIA`)
Privacy Pool: `0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5`

## 1. Executive Verdict

BLOCKED

The exact Phase 4D signed transaction was validated successfully, but it was not
broadcast. The final pre-broadcast simulations failed on current Sepolia latest
blocks because the signed transaction's resource bounds are now below current
L1 and L1 data gas prices.

The transaction was not modified, regenerated, resigned, or submitted.

## 2. Preconditions

| Check | Result |
| --- | --- |
| Branch | `phase4/privacy-pool-prover-poc` |
| Phase 4D commits | `313fcfd`, `b92e2a6`, `88b9883` |
| Signed transaction hash | `0x7cca92af81f58d1702f28c5e41ff4652c19cc4dc63dbeb2fab4edc84ed24904` |
| Recomputed transaction hash | matched expected hash |
| Signed transaction artifact SHA-256 | `d2b50b80a6d93bc971e921ba5b93a9f9699dd8c3af0e090bab2910d3c2af7520` |
| Backup artifact SHA-256 | matched original |
| Account/user address | `0x469de079832d5da0591fc5f8fd2957f70b908d62c5d0dcb057d030cfc827705` |
| Expected nonce | `0x239` |
| Live nonce before simulation | `0x239` |
| `get_public_key` before | `0x0` |
| Expected public key | `0x2786f67d610ed4c3d26551b036edc2cc69b2281e19a8c0115238f5c885e14d6` |
| STRK balance | nonzero (`0x4460a7aa45ef82e23d` FRI) |
| Chain ID | `SN_SEPOLIA` |
| Protocol version observed | `0.14.3` |
| Authenticated ZAN | blocked by dashboard secret-key protection with provided local credentials |
| Public fallback used for read/simulation | ZAN public v0.10 and PublicNode |

Artifact backup was placed outside Git under:

```text
/mnt/d/VEIL_PRIVATE_ARTIFACTS/phase4e-set-viewing-key-0143/
```

## 3. Final Simulation

| Provider | Spec version | Block number | Starknet version | Result | Estimated fee |
| --- | --- | ---: | --- | --- | --- |
| ZAN public | `0.10.3-rc.0` | `11850941` | `0.14.3` | failed: resource bounds below current gas prices | n/a |
| PublicNode public | `0.10.2` | `11850943` | `0.14.3` | failed: resource bounds below current gas prices | n/a |

ZAN latest simulation error:

```text
Resource bounds were not satisfied:
Max L1Gas price (500000000000000) is lower than the actual gas price: 1968011015775831.
Max L1DataGas price (5000000000000) is lower than the actual gas price: 20081524056882.
```

PublicNode latest simulation error:

```text
Resource bounds were not satisfied:
Max L1Gas price (500000000000000) is lower than the actual gas price: 1969120419415679.
Max L1DataGas price (5000000000000) is lower than the actual gas price: 20110875086508.
```

This is a stop condition. The preserved transaction cannot be submitted safely
without changing signed resource-bound fields, which Phase 4E explicitly
forbids.

## 4. Broadcast

| Field | Value |
| --- | --- |
| Submitted | no |
| Submission attempts | `0` |
| Expected hash | `0x7cca92af81f58d1702f28c5e41ff4652c19cc4dc63dbeb2fab4edc84ed24904` |
| Returned hash | n/a |
| Provider | n/a |

No `starknet_addInvokeTransaction` call was made.

## 5. Receipt

No receipt exists because no transaction was broadcast.

| Field | Value |
| --- | --- |
| Finality status | n/a |
| Execution status | n/a |
| Block number | n/a |
| Actual fee | n/a |
| Revert reason | n/a |

## 6. State Verification

| Field | Value |
| --- | --- |
| `get_public_key` before | `0x0` |
| `get_public_key` after | not changed; no broadcast |
| Expected public key | `0x2786f67d610ed4c3d26551b036edc2cc69b2281e19a8c0115238f5c885e14d6` |
| Equality result | n/a |
| Nonce before | `0x239` |
| Nonce after | not checked after broadcast; no broadcast occurred |

User A is not yet registered by this Phase 4E attempt.

## 7. Security Review

- No account private key was printed, committed, or written to the repository.
- No Privacy Pool viewing scalar was printed, committed, or written to the repository.
- No RPC token was committed.
- No signed transaction JSON was committed.
- No raw proof or proof_facts artifact was committed.
- No transaction was broadcast.
- No duplicate broadcast occurred.
- The report contains only public-safe summaries and sanitized provider errors.

## 8. Evidence

Public-safe local evidence:

- Signed transaction artifact checksum matched backup checksum.
- Recomputed Invoke V3 hash matched the expected Phase 4D hash.
- Live nonce check returned `0x239`.
- Live `get_public_key(user)` returned `0x0`.
- ZAN public latest and PublicNode latest both reported Starknet `0.14.3`.
- Both final simulations rejected the transaction for current gas-price resource
  bounds before any broadcast attempt.

Explorer evidence is not applicable because no transaction was submitted.

## 9. Exact Remaining Blockers

The exact Phase 4D signed transaction is no longer acceptable under current
Sepolia gas prices. Its signed resource bounds are stale:

- L1 gas max price is too low.
- L1 data gas max price is too low.

Because Phase 4E forbids changing resource bounds, regenerating, or resigning,
the only safe action was to stop before broadcast.

## 10. Final Brutal Truth

1. Was the exact Phase 4D signed transaction submitted? No.
2. How many times was it submitted? Zero.
3. Was it accepted on L2? No transaction was submitted.
4. Did execution succeed? No transaction was submitted.
5. Did `get_public_key` change from zero? No.
6. Did it match the expected public key? Not applicable.
7. Did the account nonce advance? No broadcast occurred.
8. Was any secret exposed? No secret was committed or included in this report.
9. Is User A registered in the deployed Privacy Pool? No, not from this Phase 4E attempt.
10. Is Phase 4F ready? No. Phase 4F must rebuild and sign a fresh transaction with current resource bounds, then repeat preflight and simulation before any live submission.
