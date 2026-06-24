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

## Privy Integration

Privy belongs in the frontend wallet/auth layer. Use Privy to connect the wallet and sign the transaction that calls Privacy Pool. The SDK prepares encrypted timeline payloads and the `InvokeExternal` calldata for `VeilChannelHelper`.

Production apps should provide a custom `transport` that submits transactions through Privacy Pool. The built-in transport is an in-memory mock for demos and tests.
