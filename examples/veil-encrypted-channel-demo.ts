import {
  BrowserEncryptedPayloadStore,
  ChannelEncryptionAdapter,
  DirectHelperTransport,
  VeilClient,
  generateChannelKey,
} from "../packages/veil-sdk/src";

const channelKey = await generateChannelKey();
const payloadStore = new BrowserEncryptedPayloadStore();

const aliceVeil = new VeilClient({
  privacyPoolAddress: import.meta.env.VITE_PRIVACY_POOL_ADDRESS,
  helperAddress: import.meta.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS,
  rpcUrl: import.meta.env.VITE_STARKNET_RPC_URL,
  encryption: new ChannelEncryptionAdapter({
    channelKey,
    payloadStore,
    keyId: "rights-transfer-channel-key",
  }),
  transport: new DirectHelperTransport({
    helperAddress: import.meta.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS,
    account: window.aliceWallet.account,
    provider: window.aliceWallet.provider,
  }),
});

const sent = await aliceVeil.sendMessage({
  channelId: "rights-transfer",
  sender: "buyer",
  message: "Only channel participants with the channel key can decrypt this.",
});

const bobVeil = new VeilClient({
  privacyPoolAddress: import.meta.env.VITE_PRIVACY_POOL_ADDRESS,
  helperAddress: import.meta.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS,
  rpcUrl: import.meta.env.VITE_STARKNET_RPC_URL,
  encryption: new ChannelEncryptionAdapter({
    channelKey,
    payloadStore,
    keyId: "rights-transfer-channel-key",
  }),
  transport: new DirectHelperTransport({
    helperAddress: import.meta.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS,
    provider: window.bobWallet.provider,
  }),
});

const decryptedForBob = await bobVeil.getEvent("rights-transfer", Number(sent.eventId) - 1, true);
console.log(decryptedForBob.payload);

declare global {
  interface Window {
    aliceWallet: {
      account: import("../packages/veil-sdk/src").StarknetAccountLike;
      provider: import("../packages/veil-sdk/src").StarknetProviderLike;
    };
    bobWallet: {
      provider: import("../packages/veil-sdk/src").StarknetProviderLike;
    };
  }
}
