import {
  BrowserSessionKeyStore,
  DirectHelperTransport,
  VeilClient,
  VeilSessionKeyManager,
  type StarknetAccountLike,
  type StarknetProviderLike,
  type VeilSessionAuthorizationChallenge,
  type VeilSessionAuthorizationResult,
} from "../packages/veil-sdk/src";

const sessionAccounts = new Map<string, StarknetAccountLike>();

const sessionManager = new VeilSessionKeyManager({
  store: new BrowserSessionKeyStore(),
  authorizer: {
    async authorizeSession(challenge: VeilSessionAuthorizationChallenge): Promise<VeilSessionAuthorizationResult> {
      const result = await window.veilSessionProvider.authorize(challenge);
      sessionAccounts.set(result.publicKey, result.account);

      return {
        publicKey: result.publicKey,
        keyHandle: result.keyHandle,
        walletAddress: result.walletAddress,
        chainId: result.chainId,
        authorization: {
          signature: result.signature,
          walletAddress: result.walletAddress,
          chainId: result.chainId,
          issuedAt: Date.now(),
          statement: challenge.statement,
        },
      };
    },
  },
});

await sessionManager.createSession({
  duration: "12h",
  permissions: ["MESSAGE_SEND", "OFFER_CREATE", "MEMO_SEND", "NEGOTIATION_METADATA"],
  channelIds: ["rights-transfer"],
  walletAddress: window.veilSessionProvider.walletAddress,
  chainId: "SN_SEPOLIA",
});

const veil = new VeilClient({
  privacyPoolAddress: import.meta.env.VITE_PRIVACY_POOL_ADDRESS,
  helperAddress: import.meta.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS,
  rpcUrl: import.meta.env.VITE_STARKNET_RPC_URL,
  sessionManager,
  requireSession: true,
  transport: new DirectHelperTransport({
    helperAddress: import.meta.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS,
    provider: window.veilSessionProvider.provider,
    sessionAccountResolver: (session) => (session ? sessionAccounts.get(session.publicKey) : undefined),
  }),
});

await veil.sendMessage({
  channelId: "rights-transfer",
  sender: "you",
  message: "This action is authorized by a scoped VEIL session key.",
});

declare global {
  interface Window {
    veilSessionProvider: {
      walletAddress: string;
      provider: StarknetProviderLike;
      authorize(challenge: VeilSessionAuthorizationChallenge): Promise<{
        publicKey: string;
        account: StarknetAccountLike;
        keyHandle: string;
        walletAddress: string;
        chainId: string;
        signature: string;
      }>;
    };
  }
}
