# Privacy Pool Research Adapter

`ResearchPrivacyPoolAdapter` is a read-only tool for inspecting known Privacy Pool calldata and events. It does not submit transactions.

## Implemented

- Decode transaction calldata shapes with the known ABI helpers.
- Decode recognized Privacy Pool and helper events.
- Inspect whether calldata resembles `InvokeExternal`.
- Surface notes about replay-protection requirements.

## Not Implemented

- Proof generation.
- Private key recovery.
- Privacy Pool cryptography.
- Transaction submission.
- Any replacement for the official SDK.

## Related Adapters

| Adapter | Status | Purpose |
| --- | --- | --- |
| `MockPrivacyPoolAdapter` | Implemented for local development | In-memory preview only. |
| `DirectHelperTransport` | Implemented | Direct helper transaction path. |
| `StarknetPrivacyPoolTransport` | Integration boundary | Requires external SDK/prover for production Shield execution. |
| `RealPrivacyPoolAdapter` | Prepared helper | Returns encoded ClientAction previews; does not submit. |

## Current Constraint

Privacy Pool `InvokeExternal` alone does not provide replay protection. VEIL rejects Shield message batches that do not include a replay-protection ClientAction.
