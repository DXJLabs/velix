# Privacy Pool Source Notes

These notes summarize the protocol constraints that affect VEIL integration. The Cairo source is used as protocol reference material only.

## Client Actions

The Privacy Pool action order is phase-based:

1. `SetViewingKey`
2. `OpenChannel`
3. `OpenSubchannel`
4. `Deposit`
5. `UseNote`
6. `CreateEncNote` / `CreateOpenNote`
7. `Withdraw`
8. `InvokeExternal`

`InvokeExternal` can appear at most once in a transaction.

## Replay Protection

The contract requires at least one action that produces a `WriteOnce` server action. A standalone `InvokeExternal` batch is not enough.

VEIL implements an SDK-side guard for this in Shield mode.

## External Invocation

`InvokeExternal` calls an external contract selector compatible with `privacy_invoke`. VEIL's helper uses this shape for timeline metadata and returns an empty deposit span for metadata-only messages.

## Fees

The contract fee is collected in `apply_actions()` when `fee_amount` is non-zero. The configured token in the reference is STRK.

VEIL therefore treats Privacy Pool fees as applicable only to Privacy Pool transaction paths, not direct helper transactions.

## Proofs

`apply_actions()` validates proof facts before applying server actions. VEIL does not implement that proof system. Production Shield execution requires an external SDK/prover.
