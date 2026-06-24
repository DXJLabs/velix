import {
  DirectHelperTransport,
  VeilClient,
  type StarknetAccountLike,
  type StarknetProviderLike,
} from "../packages/veil-sdk/src";

export function createTestnetVeilClient(input: {
  account: StarknetAccountLike;
  provider: StarknetProviderLike;
  privacyPoolAddress: string;
  helperAddress: string;
  rpcUrl: string;
}) {
  return new VeilClient({
    privacyPoolAddress: input.privacyPoolAddress,
    helperAddress: input.helperAddress,
    rpcUrl: input.rpcUrl,
    transport: new DirectHelperTransport({
      helperAddress: input.helperAddress,
      account: input.account,
      provider: input.provider,
    }),
  });
}

// Example usage with a wallet object supplied by Privy or a Starknet connector.
const veil = createTestnetVeilClient({
  account: window.veilDemoWallet.account,
  provider: window.veilDemoWallet.provider,
  privacyPoolAddress: import.meta.env.VITE_PRIVACY_POOL_ADDRESS,
  helperAddress: import.meta.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS,
  rpcUrl: import.meta.env.VITE_STARKNET_RPC_URL,
});

const sent = await veil.sendMessage({
  channelId: "rights-transfer",
  sender: "you",
  message: "This encrypted timeline reference is being written to VeilChannelHelper.",
});

console.log(sent.transactionHash);

declare global {
  interface Window {
    veilDemoWallet: {
      account: StarknetAccountLike;
      provider: StarknetProviderLike;
    };
  }
}
