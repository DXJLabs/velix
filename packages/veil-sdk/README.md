# @dxjlabs/veil-sdk

TypeScript SDK for building VEIL-powered private channel apps on top of Privacy Pool and `VeilChannelHelper`.

The SDK does not implement cryptography or private transfer logic. Payloads are encrypted through an adapter before being passed into the Privacy Pool `InvokeExternal` phase. The default adapter is a mock for local development.

## Install

```bash
npm install @dxjlabs/veil-sdk
```

## Client

```ts
import { VeilClient } from "@dxjlabs/veil-sdk";

const veil = new VeilClient({
  privacyPoolAddress: process.env.VITE_PRIVACY_POOL_ADDRESS!,
  helperAddress: process.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS!,
  rpcUrl: process.env.VITE_STARKNET_RPC_URL!,
});

await veil.createChannel({ channelId: "rights-transfer", title: "Rights Transfer" });
await veil.sendMessage({
  channelId: "rights-transfer",
  sender: "buyer",
  message: "I can pay 400 STRK if the proof includes the metadata memo.",
});
await veil.counterOffer({
  channelId: "rights-transfer",
  amount: "450",
  currency: "STRK",
  terms: "Private settlement terms attached.",
});

const timeline = await veil.getTimeline({ channelId: "rights-transfer", decrypt: true });
```

## React Hooks

Hooks are available from the `hooks` subpath and use SWR.

```ts
import { useChannelTimeline, useSendMessage } from "@dxjlabs/veil-sdk/hooks";

const { data: timeline } = useChannelTimeline(veil, "rights-transfer");
const sendMessage = useSendMessage(veil, "rights-transfer");

await sendMessage({ message: "Ready to settle.", sender: "you" });
```

## Session Keys

VEIL supports session-key authorization so users do not approve every message, offer, memo, or escrow update with the main wallet.

```ts
import {
  BrowserSessionKeyStore,
  DirectHelperTransport,
  VeilClient,
  VeilSessionKeyManager,
} from "@dxjlabs/veil-sdk";

const sessionManager = new VeilSessionKeyManager({
  store: new BrowserSessionKeyStore(),
  authorizer: privySessionAuthorizer,
});

await sessionManager.createSession({
  duration: "12h",
  permissions: ["MESSAGE_SEND", "OFFER_CREATE", "OFFER_ACCEPT", "MEMO_SEND", "TIMELINE_APPEND"],
  channelIds: ["rights-transfer"],
  walletAddress: wallet.address,
  chainId: "SN_SEPOLIA",
});

const veil = new VeilClient({
  privacyPoolAddress: process.env.VITE_PRIVACY_POOL_ADDRESS!,
  helperAddress: process.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS!,
  rpcUrl: process.env.VITE_STARKNET_RPC_URL!,
  sessionManager,
  requireSession: true,
  transport: new DirectHelperTransport({
    helperAddress: process.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS!,
    provider,
    sessionAccountResolver: () => privySessionAccount,
  }),
});
```

Session metadata is stored in IndexedDB by `BrowserSessionKeyStore`. The SDK never stores plaintext private keys.

## Privy Integration

Privy belongs in the frontend wallet/auth layer. Use Privy to connect the wallet and sign the transaction that calls Privacy Pool. The SDK prepares encrypted timeline payloads and the `InvokeExternal` calldata for `VeilChannelHelper`.

Production apps should provide a custom `transport` that submits transactions through Privacy Pool. The default transport is an in-memory mock for demos and tests.

## Onchain Chat Testnet Mode

VEIL also ships a direct helper transport for testnet demos. This writes encrypted timeline references directly to `VeilChannelHelper.invoke` and returns a Starknet transaction hash.

This proves the channel chat is blockchain-backed, but it is not the final Privacy Pool anonymity path.

```ts
import { DirectHelperTransport, VeilClient } from "@dxjlabs/veil-sdk";

const veil = new VeilClient({
  privacyPoolAddress: process.env.VITE_PRIVACY_POOL_ADDRESS!,
  helperAddress: process.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS!,
  rpcUrl: process.env.VITE_STARKNET_RPC_URL!,
  transport: new DirectHelperTransport({
    helperAddress: process.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS!,
    account,
    provider,
  }),
});

const sent = await veil.sendMessage({
  channelId: "rights-transfer",
  sender: "you",
  message: "Ready to settle privately.",
});

console.log(sent.transactionHash);
```

## Privacy Pool adapters

The official STRK20 Privacy Pool SDK is private, so VEIL exposes adapters instead of inventing the SDK behavior.

```ts
import {
  MockPrivacyPoolAdapter,
  RealPrivacyPoolAdapter,
  ResearchPrivacyPoolAdapter,
} from "@dxjlabs/veil-sdk";
```

- `MockPrivacyPoolAdapter`: default local/demo adapter.
- `DirectHelperTransport`: direct testnet writes to `VeilChannelHelper` for onchain timeline proof.
- `ResearchPrivacyPoolAdapter`: read-only tx/event/calldata analyzer using the known ABI.
- `RealPrivacyPoolAdapter`: placeholder that throws `Waiting for official Privacy Pool SDK`.

Use the research adapter to inspect real transactions without submitting anything:

```ts
const research = new ResearchPrivacyPoolAdapter({
  rpcUrl: process.env.VITE_STARKNET_RPC_URL!,
  privacyPoolAddress: process.env.VITE_PRIVACY_POOL_ADDRESS!,
  helperAddress: process.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS!,
});

const analysis = await research.analyzeTransaction("0x...");
console.log(analysis.interpretation);
```
