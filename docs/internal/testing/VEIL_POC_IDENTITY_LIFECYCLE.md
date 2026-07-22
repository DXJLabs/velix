# VEIL Official Privacy SDK PoC Identity Lifecycle

Status: identity remediation prepared; no new account, registration, proof, or
transaction was created by this change.

## Historical identity

The original Sepolia CI account
`0x7bae8c979b6aa680515da41568332952c96e3654805dd2bd1db2a6cc932f4b3`
successfully registered through the official Privacy SDK. Its successful
register transaction remains historical evidence and must not be deleted or
repeated for that account.

The private viewing key used by that registration was generated ephemerally and
was not persisted. It cannot be reconstructed from the account private key or
the registered public key. Because Privacy Pool registration is write-once, the
historical account is excluded from shielded-message and local-decryption PoCs.

## Recoverable CI identity

A future Sepolia CI identity consists of one matched configuration:

- `VEIL_POC_ACCOUNT_ADDRESS` — the new registered account address;
- `VEIL_POC_ACCOUNT_PRIVATE_KEY` — the signer key for that account;
- `VEIL_POC_VIEWING_KEY` — the persistent official SDK viewing key used at
  registration and every later discovery, encryption, and decryption step.

Generate the viewing key manually with
`node --experimental-strip-types tools/generate-veil-viewing-key.ts`, then store
the output directly as the `VEIL_POC_VIEWING_KEY` GitHub Secret. Never commit,
log, share, derive from the account key, reduce modulo a range, or replace this
value between register and shielded-message workflows.

The shielded-message workflow remains proof/submission-disabled during this
remediation. Its read-only identity preflight must first confirm that the new
account's registered Privacy Pool public key matches the configured persistent
viewing key.
