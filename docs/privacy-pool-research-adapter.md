# VEIL Privacy Pool Research Adapter

## Interview Implementation Markers

Use this when explaining the current integration status.

### What VEIL Implements Now

- `VeilChannelHelper` stores encrypted channel timeline events.
- `packages/veil-sdk` exposes chat, offer, memo, escrow, and proof timeline methods.
- `MockPrivacyPoolAdapter` exists only for explicit local frontend and SDK development.
- `DirectHelperTransport` writes encrypted timeline references directly to `VeilChannelHelper` for Starknet testnet proof.
- `ResearchPrivacyPoolAdapter` decodes real Privacy Pool transactions, calldata, and events from the known ABI.
- `StarknetPrivacyPoolTransport` provides the Shield transport boundary for Starknet Privacy SDK action/proof builders.
- `AvnuPrivacyPoolTransport` remains a deprecated compatibility alias; AVNU is only the Paymaster/Forwarder layer.
- `PRIVACY_POOL_ABI_CAPABILITIES` records the confirmed ABI integration points from the complete ABI.
- `Developer -> Privacy Pool Research` lets developers paste a transaction hash and inspect the possible flow.

### What VEIL Does Not Claim Yet

- No production Shield submission unless a Starknet Privacy SDK action builder is supplied. If the builder returns a transaction without its own `execute()` function, an AVNU Paymaster executor is required only for submission.
- No fake Privacy Pool cryptography.
- No replacement Privacy Pool contract.
- No claim that SDK integration is complete.
- No invented ECDH/channel-key derivation from ABI alone.
- No standalone Privacy Pool `InvokeExternal` message path without replay-protection analysis.

### Architecture Line

VEIL is not rebuilding Privacy Pool. VEIL is a messaging, negotiation, memo, and proof layer that prepares encrypted payloads for a helper contract callable through Privacy Pool `InvokeExternal`.

### Adapter Roles

`MockPrivacyPoolAdapter`

- Local-only adapter.
- Stores events in memory.
- Useful for UX, SDK, demos, and fast product iteration.

`ResearchPrivacyPoolAdapter`

- Read-only.
- Uses the STRK20 Privacy Pool ABI to inspect:
  - `OpenChannel`
  - `OpenSubchannel`
  - `CreateEncNote`
  - `InvokeExternal`
  - note events
  - viewing-key events
  - helper timeline events

`DirectHelperTransport`

- Testnet onchain write path.
- Calls `VeilChannelHelper.privacy_invoke` through a connected Starknet account.
- Returns a transaction hash for chat, offer, memo, escrow, and proof events.
- Does not claim Privacy Pool anonymity because it bypasses `InvokeExternal`.

`StarknetPrivacyPoolTransport`

- Shield mode boundary.
- Requires an app-provided Starknet Privacy SDK action builder.
- The builder must produce a valid private transfer/swap/action proof and include `VeilChannelHelper.privacy_invoke`.
- Fails closed when the builder is missing, or when transaction submission is required but neither `action.execute()` nor an AVNU Paymaster executor is supplied.

`AvnuPrivacyPoolTransport`

- Deprecated compatibility alias for `StarknetPrivacyPoolTransport`.
- Does not mean AVNU owns the Privacy Pool protocol.
- AVNU remains the Paymaster/Forwarder layer.

`RealPrivacyPoolAdapter`

- Generic placeholder only.
- Throws `Waiting for official Starknet Privacy SDK`.
- Prefer `StarknetPrivacyPoolTransport` for the Privacy Pool action/proof flow.

### The Fast Path

1. Build local UX and SDK tests with `allowMock: true`.
2. Use the research adapter to inspect real Voyager/RPC transactions.
3. Wire `StarknetPrivacyPoolTransport` to Starknet Privacy SDK private transfer/swap/action builders.
4. Use AVNU Paymaster only to submit or sponsor already-built transactions.
5. Keep STRK20 note encryption and proof construction inside the Starknet Privacy SDK path.

See also:

- `docs/privacy-pool-abi-analysis.md`
- `docs/privacy-pool-source-analysis.md`

### One-Sentence Pitch

VEIL extends STRK20 Privacy Pool with encrypted onchain channel messaging and negotiation metadata through `InvokeExternal`, while keeping STRK20 note encryption and proof construction inside the Starknet Privacy SDK path and using AVNU only for Paymaster/Forwarder execution.
