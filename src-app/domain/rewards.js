export const VEIL_REWARD_POINTS = Object.freeze({
  sendMessage: 1,
  createOffer: 5,
  counterOffer: 5,
  acceptProposal: 10,
  directPayment: 20,
  escrowCreated: 450,
  escrowCompleted: 50,
  inviteUserJoined: 100,
});

export const VEIL_REWARD_LABELS = Object.freeze({
  sendMessage: "Shielded Message",
  createOffer: "Alice created an offer",
  counterOffer: "Bob created a counter offer",
  acceptProposal: "Accept Proposal",
  directPayment: "Direct Payment",
  escrowCreated: "Escrow Deposit",
  escrowCompleted: "Escrow Completed",
  inviteUserJoined: "Invite User Joined",
});

export const REWARD_TIERS = Object.freeze([
  { name: "Gold", threshold: 5_000 },
  { name: "Platinum", threshold: 10_000 },
  { name: "Diamond", threshold: 25_000 },
]);

export function nextRewardTier(points, tiers = REWARD_TIERS) {
  return tiers.find((tier) => points < tier.threshold) || tiers[tiers.length - 1];
}
