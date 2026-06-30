# VEIL SDK Developer Reference

This SDK provides VEIL application-layer APIs for encrypted timelines, direct helper transport, session keys, fee estimation, and a prepared Starknet Privacy SDK integration boundary.

It does not implement STRK20 Privacy Pool cryptography, Poseidon, official proof generation, or official note handling.

## Construction

```ts
const veil = new VeilClient({
  privacyPoolAddress,
  helperAddress,
  rpcUrl,
  encryption,
  transport,
});
```

Production clients should supply both `encryption` and `transport`. The mock defaults require `allowMock: true`.

## Public APIs

| API | Purpose | Parameters | Return | Current status |
| --- | --- | --- | --- | --- |
| `createChannel()` | Create or prepare a channel record/action. | `CreateChannelInput` | `CreateChannelResult` | Implemented for mock/direct helper. Shield requires `privacyPool` actions and external SDK. |
| `openSubchannel()` | Prepare and submit an `OpenSubchannel` flow through Privacy Pool transport. | `OpenSubchannelInput` | `OpenSubchannelResult` | Prepared; production Shield execution depends on external SDK/prover. |
| `sendMessage()` | Encrypt and submit a chat payload. | `SendMessageInput` | `TimelineItem` | Implemented for direct helper. Shield requires replay-protected Privacy Pool actions and external SDK. |
| `sendShieldedMessage()` | Send a message through Shield transport. | `SendMessageInput` without `mode` | `TimelineItem` | Integration point only unless `privacySdk` is supplied. |
| `sendUnshieldedMessage()` | Send a message through direct helper transport. | `SendMessageInput` without `mode` | `TimelineItem` | Implemented when a direct helper transport/account is configured. |
| `sendPaymentMemo()` | Encrypt and submit a payment memo payload. | `SendPaymentMemoInput` | `TimelineItem` | Same transport status as messages. |
| `createOffer()` | Encrypt and submit an offer payload. | `OfferInput` | `TimelineItem` | Same transport status as messages. |
| `counterOffer()` | Encrypt and submit a counter-offer payload. | `OfferInput` | `TimelineItem` | Same transport status as messages. |
| `acceptOffer()` | Encrypt and submit offer acceptance metadata. | `OfferDecisionInput` | `TimelineItem` | Application metadata only; not financial authorization. |
| `rejectOffer()` | Encrypt and submit offer rejection metadata. | `OfferDecisionInput` | `TimelineItem` | Application metadata only. |
| `recordEscrowStatus()` | Store encrypted escrow-status metadata. | `EscrowStatusInput` | `TimelineItem` | Direct helper/application metadata; not token movement. |
| `attachProof()` | Store an encrypted proof reference. | `AttachProofInput` | `TimelineItem` | Application metadata only. |
| `getTimeline()` | Read timeline items and optionally decrypt. | `TimelineQuery` | `TimelineItem[]` | Implemented through configured transport. |
| `getEvent()` | Read a single timeline item. | `channelId`, `index`, `decrypt?` | `TimelineItem` | Implemented through configured transport. |
| `getEventCount()` | Read helper/transport event count. | `channelId` | `number` | Implemented through configured transport. |
| `watchChannel()` / `watchMessages()` | Poll timeline and invoke callback. | `channelId`, callback, options | unsubscribe function | Implemented polling helper. |
| `decryptTimeline()` | Decrypt existing timeline items client-side. | `TimelineItem[]` | `TimelineItem[]` | Implemented if encryption adapter can decrypt. |
| `deriveSharedSecret()` | Derive an application key from supplied Privacy Pool material. | `DeriveSharedSecretInput` | `CryptoKey` | Implemented HKDF step only; does not compute Privacy Pool ECDH. |
| `encryptMessage()` / `decryptMessage()` | AES-GCM message envelope operations. | message/key inputs | encrypted payload or payload | Implemented application encryption. |
| `createSession()` / `restoreSession()` / `destroySession()` | Manage scoped session authorization. | session inputs | session/null/void | Implemented with configured session manager. |
| `getFeeInfo()` | Read Privacy Pool fee views. | none | fee info | Implemented when provider is configured. |
| `estimatePoolFee()` | Estimate Privacy Pool fee. | fee input | pool fee estimate | Implemented for configured fee info/provider. |
| `estimateTransactionFee()` | Estimate/surface gas fee. | fee input | gas estimate | Implemented for supported fee modes. |
| `estimateTotalCost()` | Combine gas and pool fee estimates. | fee input | total estimate | Implemented; direct helper transaction type has no pool fee. |

## Shield Transport Boundary

`StarknetPrivacyPoolTransport` accepts:

- `privacySdk`: an externally supplied SDK-like object with `compileActions()`, `generateProof()` or `prove()`, and one of `buildApplyActionsTransaction()`, `invokeAndApplyAction()`, or `applyAction()`.
- `paymaster`: optional executor used when the SDK returns a transaction object instead of an `execute()` function.
- `provider`: required for fee discovery and confirmation waiting.
- `readTransport`: used to read confirmed timeline events after transaction confirmation.

VEIL constructs application payloads and ClientAction inputs, but the external SDK/prover owns Privacy Pool proof generation and official transaction construction.

## Direct Helper Transport

`DirectHelperTransport` is implemented. It submits `privacy_invoke` directly to `VeilChannelHelper`, waits for confirmation by default, reads helper events, and returns confirmed timeline metadata.

Direct helper mode does not provide Privacy Pool anonymity.

## Fees

- Privacy Pool fee discovery calls `get_fee_amount()` and `get_fee_collector()`.
- The reference contract collects the configured pool fee in STRK during `apply_actions()`.
- Direct helper transactions do not automatically include Privacy Pool fees.
- AVNU Paymaster support is represented as an executor interface. VEIL does not include AVNU protocol logic.

## Security Boundaries

- The SDK does not store private keys, shared secrets, or plaintext timeline payloads in transports.
- Session keys are authorization keys for scoped application actions only.
- Financial actions require wallet-level approval outside the session-key permissions.
- Full Shield privacy depends on the official Starknet Privacy SDK/prover integration.
