# Encrypted Channel Payloads

VEIL encrypts application payloads before writing timeline references onchain. This document covers application-layer encryption only.

## Implemented

- `ChannelEncryptionAdapter` supports AES-GCM after channel material is derived locally. The intended sequence is Stark-curve ECDH shared-secret agreement, a domain-separated message KDF, then on-device AES-GCM encryption before ciphertext submission.
- `PrivacyPoolChannelEncryptionAdapter` derives an application encryption key from supplied Privacy Pool secret material using HKDF.
- `encryptMessage()` and `decryptMessage()` support AES-GCM payload envelopes.
- Payload chunks can store ciphertext envelopes as felts for helper transport.
- Transports store ciphertext and metadata only.

## Not Implemented In This Repository

- STRK20 Stark-curve ECDH.
- Privacy Pool channel key recovery.
- Poseidon hashing.
- Privacy Pool note encryption.
- Official proof generation.

The SDK expects official Privacy Pool secret material to be supplied by the Privacy Pool flow or external SDK. HKDF is only an application-layer derivation step after that material exists.

## Direct Helper Mode

Direct helper mode writes encrypted timeline references directly to `VeilChannelHelper`.

It provides:

- onchain ordering,
- transaction hash,
- receipt confirmation,
- ciphertext availability.

It does not provide Privacy Pool anonymity.

## Shield Mode

Shield mode is prepared through `StarknetPrivacyPoolTransport`.

It requires an external SDK/prover to:

- compile ClientActions,
- generate proof data,
- construct or execute `apply_actions`.

VEIL does not claim Shield payloads are submitted through Privacy Pool unless that external integration is configured and succeeds.
