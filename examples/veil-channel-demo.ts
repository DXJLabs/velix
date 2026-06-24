import { VeilClient } from "../packages/veil-sdk/src";

const veil = new VeilClient({
  privacyPoolAddress: import.meta.env.VITE_PRIVACY_POOL_ADDRESS ?? "mock-privacy-pool",
  helperAddress: import.meta.env.VITE_VEIL_CHANNEL_HELPER_ADDRESS ?? "mock-helper",
  rpcUrl: import.meta.env.VITE_STARKNET_RPC_URL ?? "mock-rpc",
});

const channel = await veil.createChannel({
  channelId: "rights-transfer",
  title: "Rights Transfer",
});

await veil.sendMessage({
  channelId: channel.channelId,
  sender: "seller",
  message: "500 STRK for the full rights transfer package.",
});

await veil.createOffer({
  channelId: channel.channelId,
  sender: "seller",
  amount: "500",
  currency: "STRK",
});

await veil.sendMessage({
  channelId: channel.channelId,
  sender: "buyer",
  message: "I can pay 400 STRK if the metadata proof is included.",
});

await veil.counterOffer({
  channelId: channel.channelId,
  sender: "you",
  amount: "450",
  currency: "STRK",
});

await veil.acceptOffer({
  channelId: channel.channelId,
  sender: "buyer",
});

await veil.sendPaymentMemo({
  channelId: channel.channelId,
  amount: "450 STRK",
  mode: "Shield",
  memo: "Settlement metadata added.",
});

await veil.attachProof({
  channelId: channel.channelId,
  proofRef: "proof://rights-transfer/final",
  label: "Final transfer proof",
});

console.log(await veil.getTimeline({ channelId: channel.channelId, decrypt: true }));
