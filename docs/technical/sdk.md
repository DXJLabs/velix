# VEIL SDK

The VEIL SDK is the developer interface for integrating VEIL product workflows into an application.

It is not the product entry point. Read the [Product](../product/README.md), [Product Guides](../guides/README.md), and [Architecture](../architecture/README.md) sections first.

Package source: [`packages/veil-sdk`](../../packages/veil-sdk)

Package README: [`packages/veil-sdk/README.md`](../../packages/veil-sdk/README.md)

## What The SDK Supports

The SDK supports VEIL application workflows:

- channels,
- encrypted messages,
- payment memos,
- offers and counter-offers,
- offer acceptance and rejection,
- escrow status metadata,
- proof references,
- timeline reads,
- session authorization,
- fee discovery and estimation,
- transport selection for Shield and Unshield paths.

## Construction

```ts
import { VeilClient } from "./packages/veil-sdk/src";

const veil = new VeilClient({
  privacyPoolAddress,
  helperAddress,
  rpcUrl,
  encryption,
  transport,
});
```

Production clients should supply real encryption and transport adapters. Mock defaults are for local development only.

## Product-To-SDK Map

| Product capability | SDK surface |
| --- | --- |
| Channel creation | `createChannel()` |
| Messaging | `sendMessage()`, `sendShieldedMessage()`, `sendUnshieldedMessage()` |
| Payment memo | `sendPaymentMemo()` |
| Negotiation | `createOffer()`, `counterOffer()`, `acceptOffer()`, `rejectOffer()` |
| Escrow updates | `recordEscrowStatus()` |
| Proof references | `attachProof()` |
| Channel history | `getTimeline()`, `getEvent()`, `getEventCount()`, `watchChannel()` |
| Local decryption | `decryptTimeline()`, `encryptMessage()`, `decryptMessage()` |
| Sessions | `createSession()`, `restoreSession()`, `destroySession()` |
| Fees | `getFeeInfo()`, `estimatePoolFee()`, `estimateTransactionFee()`, `estimateTotalCost()` |

For full method parameters and return types, use the package-level [SDK Developer Reference](../../packages/veil-sdk/README.md).

## Transport Modes

| Mode | Product meaning | Current status |
| --- | --- | --- |
| `mock` | Local development preview | Implemented for local use only. |
| `direct-helper` / Unshield | Explicit direct visible path | Implemented for encrypted timeline references. |
| `privacy-pool` / Shield | Privacy-preserving path | Integration boundary prepared; production execution requires an external Privacy Pool SDK/prover. |

## Boundaries

- The SDK does not make VEIL an SDK-first product.
- The SDK does not include official Privacy Pool proof generation.
- The SDK does not implement official Privacy Pool note handling.
- Session keys are application authorization keys, not wallet keys or financial signing keys.
- Financial actions still require wallet-level approval.

## Validation

```bash
npm run test:sdk
npm run typecheck
```
