# STRK20 Privacy Pool Migration Report

## Scope

This migration keeps VEIL as an application layer on top of STRK20 Privacy Pool. The local reference under `reference/contracts` remains read-only and was not copied, edited, moved, or formatted.

The reference source is the canonical protocol specification for:

- `ClientAction` / `ServerAction`
- `compile_actions()` / `apply_actions()`
- `InvokeExternal`
- `EncChannelInfo`, `EncSubchannelInfo`, `EncOutgoingChannelInfo`, `EncPrivateKey`, `EncUserAddr`, `Note`
- Stark-curve ECDH via `_compute_shared_x()`
- Poseidon hashing and Privacy Pool domain separation tags
- Channel keys, markers, subchannels, notes, nullifiers, and proof validation

## Root Cause

The prototype SDK exposed browser P-256 ECDH, HKDF, and AES-GCM as the production messaging key path. That was not compatible with STRK20 Privacy Pool because the reference contract uses Stark-curve public keys, `_compute_shared_x()`, Poseidon hashes, and canonical domain separation tags.

The prototype also allowed direct helper submissions to return optimistic pending items. That was acceptable for demos, but production UI state must distinguish signing, pending, confirmed, and failed based on real chain confirmation.

## Replaced Primitives

| Prototype primitive | Migration result | Canonical source |
| --- | --- | --- |
| Browser P-256 `generateEcdhKeyPair()` | Preserved as an exported symbol but now fails closed. VEIL must use Privacy Pool/Starknet key material. | `utils.cairo::_compute_shared_x()` |
| Browser P-256 `deriveSharedSecret({ privateKey, publicKey })` | Deprecated input shape remains accepted at type level, but runtime rejects it. | `utils.cairo::_compute_shared_x()` |
| SDK-owned ECDH channel adapter | `EcdhChannelEncryptionAdapter` is now a compatibility alias of `PrivacyPoolChannelEncryptionAdapter`. | Privacy Pool recovered `shared_x` or `channel_key` |
| Ad hoc production message key source | `deriveSharedSecret()` now requires `privacyPoolSharedSecret` or `channelKey` recovered from the official Privacy Pool flow. | `compute_channel_key()` / `encrypt_channel_info()` flow |
| Optimistic direct-helper confirmation as final result | `DirectHelperTransport` now waits for a real Starknet receipt by default and reads the helper event back. | Starknet transaction receipt and helper event state |

## Retained Application Layer

Privacy Pool intentionally does not define VEIL chat, offer, negotiation, memo, or proof payload formats. These remain VEIL application-layer concerns:

- `VeilTimelinePayload` JSON shape
- AES-GCM ciphertext envelope for VEIL messages after Privacy Pool secret material is recovered
- payload chunk storage through `VeilChannelHelper`
- `channelIdToFelt()` as a VEIL timeline identifier only
- helper event indexing and timeline merge logic
- session-key lifecycle and permission checks
- UI state machine and badges

These retained components must not be treated as Privacy Pool channel IDs, note IDs, nullifiers, or Poseidon-derived protocol values.

## SDK Architecture

The SDK now separates responsibilities:

- Privacy Pool integration supplies canonical key material and action/proof construction.
- VEIL SDK derives an application encryption key only after canonical Privacy Pool secret material exists.
- HKDF is used only after Privacy Pool key agreement, never as a replacement for it.
- AES-GCM encrypts application payloads; it does not replace note encryption or protocol storage.
- Session keys authorize app metadata actions only and remain independent from encryption keys.

Corrected dependency boundary:

- VEIL owns encrypted messaging, chat/offer/negotiation/memo payloads, helper integration, timeline, indexer, and the developer SDK surface.
- The official Starknet Privacy SDK owns Privacy Pool protocol action construction, proof generation, `compile_actions()` compatibility, and `apply_action()` / `invoke_and_apply_action()` submission payloads.
- AVNU owns only Paymaster/Forwarder execution and gas sponsorship. AVNU does not define VEIL messaging, encrypted payload formats, timeline semantics, or Privacy Pool cryptography.

## Privacy Pool Integration Flow

```text
OpenChannel / existing channel
-> official STRK20 Privacy Pool computes channel data
-> recipient recovers channel_key or shared_x via canonical Stark-curve flow
-> VEIL deriveSharedSecret({ privacyPoolSharedSecret | channelKey })
-> HKDF
-> AES-GCM encrypt/decrypt VEIL application payload
```

## ClientAction To ServerAction Flow

VEIL message writes through Privacy Pool must be built by the official Starknet Privacy SDK action/proof builder:

```text
VEIL encrypted payload
-> ClientAction::InvokeExternal(helper privacy_invoke calldata)
-> compile_actions()
-> proof generation
-> transaction for apply_action() or invoke_and_apply_action()
-> optional AVNU Paymaster execution/gas sponsorship
-> Privacy Pool apply_actions()
-> ServerAction::Invoke
-> VeilChannelHelper.privacy_invoke()
-> helper event
-> indexer
-> recipient local decrypt
```

Important constraint from `privacy.cairo`: `InvokeExternal` alone does not create `WriteOnce`, so a message-only batch requires an official replay-protection strategy from the Starknet Privacy SDK. AVNU does not define that strategy; it only submits or sponsors the transaction.

## Smart Contract Integration

`VeilChannelHelper` remains an application helper. It exposes `privacy_invoke(...) -> Span<OpenNoteDeposit>` and returns an empty deposit span for metadata messages. This matches the helper pattern used by the reference helper contracts while keeping message payloads outside Privacy Pool core protocol state.

No VEIL contract replaces Privacy Pool storage layout, channel markers, subchannel markers, notes, nullifiers, or proof validation.

## Indexer Integration

The indexer remains ciphertext-only:

- reads helper events
- reconstructs payload chunk envelopes
- returns tx hash, block number, timestamp, ciphertext metadata
- never decrypts
- never derives Privacy Pool shared secrets
- never stores plaintext

## Frontend Changes

The frontend keeps existing timeline APIs and display components. Production direct-helper sends now depend on real confirmation metadata because `DirectHelperTransport` waits by default. Shield mode must continue to fail closed unless an official Starknet Privacy SDK action/proof builder is configured. AVNU Paymaster may be configured only as the execution/gas-sponsorship path.

## Remaining Starknet Privacy SDK And AVNU Dependencies

VEIL still requires the official Starknet Privacy SDK for:

- Stark-curve `_compute_shared_x()` access or recovered channel-key delivery
- `compute_channel_key()` parity and/or official client-side channel discovery
- Poseidon/domain-separated hash parity
- `ClientAction` serialization
- `compile_actions()` orchestration
- proof generation for `apply_actions()`
- `InvokeExternal` replay-protection strategy
- `apply_actions()` or `invoke_and_apply_action()` submission

VEIL uses AVNU only for:

- Paymaster execution
- Forwarder/relayer submission
- gas sponsorship

Until the Starknet Privacy SDK dependencies are supplied, Shield mode must fail closed and VEIL must not simulate Privacy Pool transactions.

## Test Coverage

Current SDK tests cover:

- HKDF/AES encryption and decryption from Privacy Pool secret material
- fail-closed behavior for non-Privacy-Pool ECDH key generation
- duplicate nonce replay check
- session lifecycle and unsupported financial permissions
- direct-helper confirmation metadata
- shield rejection on direct-helper transport

Protocol-parity tests for Stark-curve ECDH, Poseidon, channel keys, markers, note ids, and nullifiers remain blocked on official JS-callable Privacy Pool primitives or test vectors.

## Production Readiness

Ready:

- application-layer encrypted payload envelope after canonical Privacy Pool secret material is provided
- direct-helper testnet confirmation semantics
- session authorization separation from encryption and finance
- ciphertext-only indexer behavior

Not ready without official Starknet Privacy SDK integration:

- real Shield mode
- client-side Privacy Pool key recovery
- canonical action/proof construction
- replay-protected message-only Privacy Pool transactions

AVNU Paymaster remains a production execution dependency, not a protocol dependency.
