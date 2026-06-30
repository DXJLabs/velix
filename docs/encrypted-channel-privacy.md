# VEIL Encrypted Channel Privacy

VEIL chat is blockchain-backed, but the readable message body must stay off public chain state.

The current production-safe unshield model is:

```mermaid
flowchart TD
  A["User A writes message"] --> B["Privacy Pool secret -> HKDF message key"]
  B --> C["Encrypt on device with AES-256-GCM"]
  C --> D["Store ciphertext envelope in payload store/indexer"]
  C --> E["Submit encryptedPayload ref + payloadHash"]
  E --> F["VeilChannelHelper timeline event"]
  F --> G["User B discovers event"]
  D --> H["User B loads ciphertext envelope"]
  G --> I["User B recovers Privacy Pool secret locally"]
  H --> J["User B decrypts locally"]
  I --> J
```

Observers can see that a blockchain event exists. They cannot read the message unless they can derive the conversation key and load the ciphertext envelope.

## What Is Stored Onchain

`VeilChannelHelper` stores:

- `channel_id`
- `event_type`
- `encrypted_payload`
- `payload_hash`
- `created_at`

For the current helper MVP, `encrypted_payload` is a felt reference to an encrypted payload envelope. It is not plaintext.

## What Is Stored Offchain

`EncryptedPayloadStore` or onchain payload chunks store:

- ciphertext
- nonce
- payload hash
- key id
- channel/event metadata

The default browser implementation uses IndexedDB for local development. Production apps should replace it with a discovery indexer or encrypted blob service that returns ciphertext envelopes for users who can decrypt them.

## Why Not Store Plaintext Onchain

Public chains are readable by everyone. If chat content is stored as plaintext, it is not private. VEIL therefore stores only encrypted references and commitments onchain.

## Why Not Claim Full Privacy Yet

Direct helper mode does not hide sender metadata. It is useful for Starknet testnet proof because chat events are onchain and transaction hashes are real.

Full Shield path:

```mermaid
flowchart TD
  A["Client-side encrypted payload"] --> B["Starknet Privacy SDK action/proof builder"]
  B --> C["Transaction: apply_action / invoke_and_apply_action"]
  C --> D["AVNU Paymaster Forwarder, optional"]
  D --> E["Privacy Pool apply_actions"]
  E --> F["InvokeExternal to VeilChannelHelper"]
  F --> G["Encrypted timeline event"]
```

`StarknetPrivacyPoolTransport` supplies the VEIL transport boundary. The app-provided Starknet Privacy SDK builder must supply STRK20 note encryption, proof construction, and InvokeExternal submission. AVNU Paymaster is used only to execute or sponsor the built transaction.

## SDK Files

- `packages/veil-sdk/src/ecdh.ts`
- `packages/veil-sdk/src/channel-encryption.ts`
- `packages/veil-sdk/src/encrypted-payload-store.ts`
- `packages/veil-sdk/src/client.ts`
- `packages/veil-sdk/src/direct_helper_transport.ts`

## Security Notes

- VEIL SDK uses Privacy Pool-derived secret material, HKDF-SHA-256, and AES-256-GCM for messaging payload confidentiality and integrity.
- STRK20 note encryption remains delegated to the Starknet Privacy SDK.
- AES-GCM additional authenticated data binds ciphertext to `channelId` and `eventType`.
- Missing ciphertext envelope means the event remains visible but cannot be decrypted.
- Wrong key, wrong channel, wrong event type, or tampered ciphertext fails decryption.

## Interview Explanation

VEIL stores encrypted channel timeline events onchain. The chain proves ordering and availability of event references. Only participants with the channel key can decrypt the ciphertext envelopes. Direct helper mode proves the onchain part now; Privacy Pool mode later hides sender/recipient metadata through `InvokeExternal`.
