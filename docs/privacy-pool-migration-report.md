# Privacy Pool Migration Status

This file records the current migration status. It is not a production-complete claim.

## Replaced Or Disabled

- Browser P-256 key generation is no longer used as a production Privacy Pool key path.
- `generateEcdhKeyPair()` fails closed for production use.
- `EcdhChannelEncryptionAdapter` is retained as a compatibility alias around the Privacy Pool-derived encryption adapter.
- Shield message submission rejects standalone `InvokeExternal` batches without replay protection.

## Retained Application-Layer Components

- Chat payload format.
- Offer and counter-offer payload format.
- Payment memo payload format.
- Negotiation metadata.
- Timeline API.
- Helper/indexer ciphertext metadata flow.
- AES-GCM application payload encryption after key material is supplied.

These are VEIL application concerns, not Privacy Pool protocol structures.

## Implemented Privacy Pool Interfaces

- ClientAction builders and serializers for known action variants.
- Channel and subchannel action preparation.
- Fee discovery from `get_fee_amount()` and `get_fee_collector()`.
- Fee estimation by transaction path.
- `StarknetPrivacyPoolTransport` integration boundary.

## Pending External SDK

The following remain pending until an official/private SDK integration is supplied:

- official proof generation,
- official `apply_actions` transaction construction,
- official key recovery,
- note encryption,
- production Shield execution.

## Current Recommendation

Use direct helper mode for current testnet messaging. Use Shield mode only when a real external Privacy SDK/prover implementation is configured.
