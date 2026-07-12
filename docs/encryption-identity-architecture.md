# VEIL Encryption Identity Architecture

## Scope

Encrypted On-chain messaging uses a dedicated device encryption identity. The Starknet wallet account key authorizes transactions; it is never used or transformed into the VEIL encryption private scalar. Privacy Pool `SetViewingKey` is not required for this mode.

## First Login And Registration

1. The device generates a canonical Stark-curve private scalar with `crypto.getRandomValues` rejection sampling.
2. The matching x-coordinate public key is derived locally.
3. A non-extractable AES-GCM wrapping key is generated with Web Crypto and stored as a structured-clone `CryptoKey` in IndexedDB.
4. The private scalar is AES-GCM encrypted with authenticated version/public-key metadata before its record is persisted.
5. Only the public key is included in `VeilEncryptionKeyRegistry.register_public_key` calldata.
6. Registration is an explicit wallet action. Messaging remains fail-closed until the registry matches the active local identity.

The registry derives the account solely from `get_caller_address()`. It rejects zero keys, permits self-rotation, emits registration/rotation events, and exposes the current public key and version to resolvers.

## Message Flow

```text
sender encrypted identity
  + recipient registry public key
  -> Stark-curve ECDH shared_x
  -> HKDF-SHA-256 with canonical VEIL context
  -> AES-GCM payload encryption
  -> DirectHelperTransport
  -> VEIL Helper ciphertext storage
```

The KDF context includes protocol version, chain ID, helper address, canonically ordered participant addresses, and channel ID. This ordering makes both participants derive the same key while separating chains, helpers, and deal rooms.

Only ciphertext envelope data, nonce, public key/version metadata, and transaction metadata are submitted. Sender account, timing, ciphertext size, and helper interaction remain public. The registry does not provide sender anonymity or metadata resistance. Shielded via STRK20 remains Coming Soon and independent from this registry.

## Rotation And History

Rotation creates a new local scalar and increments the registry version. Previous encrypted private-scalar records remain encrypted in IndexedDB for historical decryption. Ciphertext carries non-secret participant public keys and key versions so a recipient can select the historical local identity after rotation.

MVP limitation: the registry exposes only the active public key. In-flight senders must re-resolve immediately before encryption; a key changed between resolution and chain submission can require retry. Local key loss makes messages encrypted to lost versions unrecoverable unless an encrypted device backup is added.

## Threat Model

- **XSS:** Script execution in the VEIL origin can ask the vault to decrypt and use an identity. CSP, dependency review, and XSS prevention remain critical.
- **Compromised device/browser:** The wrapping key and ciphertext record coexist on the device. This is encrypted-at-rest protection, not hardware-grade isolation.
- **Malicious RPC:** A false registry response can substitute a recipient key. Production clients should verify chain ID, registry address/class, and preferably compare independent RPC responses for first contact.
- **Registry misconfiguration:** Missing or malformed `VITE_VEIL_KEY_REGISTRY_ADDRESS` fails closed with `ENCRYPTION_KEY_REGISTRY_UNAVAILABLE`.
- **Public-key substitution:** The on-chain caller-bound registry prevents registering for another account, but applications must bind the intended wallet address to the correct deal participant.
- **Key loss:** Historical ciphertext is unrecoverable without the corresponding encrypted local identity record and wrapping key.
- **Rotation:** New sends use the latest resolved version; historical versions are retained locally.
- **Replay:** Registry versioning makes rotations observable. Message-level replay/duplicate handling remains a helper/indexer concern.
- **Ciphertext tampering:** AES-GCM authentication and envelope hash validation reject modified ciphertext or nonce values.
