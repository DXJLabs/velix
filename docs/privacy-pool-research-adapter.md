# VEIL Privacy Pool Research Adapter

## Interview Implementation Markers

Use this when explaining the current integration status.

### What VEIL Implements Now

- `VeilChannelHelper` stores encrypted channel timeline events.
- `packages/veil-sdk` exposes chat, offer, memo, escrow, and proof timeline methods.
- `MockPrivacyPoolAdapter` keeps frontend and SDK development moving without the private STRK20 SDK.
- `DirectHelperTransport` writes encrypted timeline references directly to `VeilChannelHelper` for Starknet testnet proof.
- `ResearchPrivacyPoolAdapter` decodes real Privacy Pool transactions, calldata, and events from the known ABI.
- `Developer -> Privacy Pool Research` lets developers paste a transaction hash and inspect the possible flow.

### What VEIL Does Not Claim Yet

- No production Privacy Pool transaction submission.
- No fake Privacy Pool cryptography.
- No replacement Privacy Pool contract.
- No claim that SDK integration is complete.

### Architecture Line

VEIL is not rebuilding Privacy Pool. VEIL is a messaging, negotiation, memo, and proof layer that prepares encrypted payloads for a helper contract callable through Privacy Pool `InvokeExternal`.

### Adapter Roles

`MockPrivacyPoolAdapter`

- Default app adapter.
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
- Calls `VeilChannelHelper.invoke` through a connected Starknet account.
- Returns a transaction hash for chat, offer, memo, escrow, and proof events.
- Does not claim Privacy Pool anonymity because it bypasses `InvokeExternal`.

`RealPrivacyPoolAdapter`

- Placeholder only.
- Throws `Waiting for official Privacy Pool SDK`.
- This is where real SDK calls should be added after the meeting.

### The Fast Path

1. Build product UX and VEIL SDK with the mock adapter.
2. Use the research adapter to inspect real Voyager/RPC transactions.
3. Confirm exact SDK transaction flow in the STRK20 meeting.
4. Fill `RealPrivacyPoolAdapter` without changing the VEIL app surface.

### One-Sentence Pitch

VEIL extends the existing STRK20 Privacy Pool with encrypted on-chain channel messaging and negotiation metadata through `InvokeExternal`, while keeping Privacy Pool untouched and leaving real cryptography/transaction construction to the official SDK.
