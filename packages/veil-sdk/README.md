# @dxjlabs/veil-sdk

TypeScript SDK for building VEIL-powered private channel apps on top of Privacy Pool and `VeilChannelHelper`.

The SDK implements the messaging-layer boundary: Privacy Pool-derived message encryption, scoped session keys, direct helper transport, a Starknet Privacy SDK transport boundary, and an AVNU Paymaster execution hook. It does not implement STRK20 ECDH, note encryption, Poseidon hashing, or ZK proof construction itself; Shield mode must use Starknet Privacy SDK primitives. AVNU is only the Paymaster/Forwarder layer.

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
  encryption,
  transport,
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

VEIL supports session-key authorization so users do not approve every message, reply, offer, counter offer, memo, or negotiation metadata update with the main wallet.

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
  permissions: ["MESSAGE_SEND", "OFFER_CREATE", "MEMO_SEND", "NEGOTIATION_METADATA"],
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

Production apps must provide both a production encryption adapter and a transport. Mock encryption/transport is available only when `allowMock: true` is set explicitly for local demos and tests.

## Onchain Chat Testnet Mode

VEIL also ships a direct helper transport for testnet demos. This writes encrypted timeline references directly to `VeilChannelHelper.privacy_invoke` and returns a Starknet transaction hash.

This proves the channel chat is blockchain-backed, but it is not the final Privacy Pool anonymity path.

```ts
import { DirectHelperTransport, VeilClient } from "@dxjlabs/veil-sdk";

const veil = new VeilClient({
  privacyPoolAddress: process.env.VITE_PRIVACY_POOL_ADDRESS!,
  helperAddress: process.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS!,
  rpcUrl: process.env.VITE_STARKNET_RPC_URL!,
  encryption,
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

## Privacy Pool Message Encryption

Use `PrivacyPoolChannelEncryptionAdapter` after the official STRK20 Privacy Pool flow has recovered a channel key or shared x-coordinate. The SDK uses that canonical protocol output as HKDF input for VEIL application payload encryption. It does not perform browser P-256 ECDH.

```ts
import {
  BrowserEncryptedPayloadStore,
  PrivacyPoolChannelEncryptionAdapter,
  VeilClient,
} from "@dxjlabs/veil-sdk";

const payloadStore = new BrowserEncryptedPayloadStore();
const privacyPoolSharedSecret = await officialPrivacyPoolSdk.recoverChannelSecret(...);

const veil = new VeilClient({
  privacyPoolAddress,
  helperAddress,
  rpcUrl,
  transport,
  encryption: new PrivacyPoolChannelEncryptionAdapter({
    privacyPoolSharedSecret,
    channelId: "rights-transfer",
    payloadStore,
    keyId: "rights-transfer-privacy-pool",
  }),
});
```

`EcdhChannelEncryptionAdapter`, `generateEcdhKeyPair`, and `exportEcdhPublicKey` remain exported for compatibility but fail closed for production because browser ECDH is not STRK20 Privacy Pool-compatible. `ChannelEncryptionAdapter` remains available only as a legacy AES-GCM testnet fallback for pre-shared channel keys.

## Privacy Pool adapters

VEIL exposes adapters instead of inventing STRK20 note encryption, key agreement, or proof behavior. Shield mode should be wired to the Starknet Privacy SDK flow for ClientAction construction, proof generation, and Privacy Pool submission. AVNU Paymaster may execute or sponsor the transaction after it is built.

```ts
import {
  AvnuPrivacyPoolTransport,
  MockPrivacyPoolAdapter,
  RealPrivacyPoolAdapter,
  ResearchPrivacyPoolAdapter,
  StarknetPrivacyPoolTransport,
} from "@dxjlabs/veil-sdk";
```

- `MockPrivacyPoolAdapter`: local/demo adapter, never the production default.
- `DirectHelperTransport`: direct testnet writes to `VeilChannelHelper` for onchain timeline proof.
- `StarknetPrivacyPoolTransport`: Shield transport boundary. The app supplies a Starknet Privacy SDK action builder that creates the private transfer/swap/action proof and includes `VeilChannelHelper.privacy_invoke`; AVNU Paymaster is optional execution infrastructure.
- `AvnuPrivacyPoolTransport`: deprecated compatibility alias for `StarknetPrivacyPoolTransport`.
- `ResearchPrivacyPoolAdapter`: read-only tx/event/calldata analyzer using the known ABI.
- `RealPrivacyPoolAdapter`: placeholder that throws `Waiting for official Starknet Privacy SDK`.

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
