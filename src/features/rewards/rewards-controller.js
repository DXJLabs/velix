export function createRewardsController({
  state,
  createRewardEntry,
  renderWalletRewards,
}) {
  function awardReward(ruleKey) {
    const reward = createRewardEntry(ruleKey);
    if (!reward) return;
    state.rewardPoints += reward.points;
    state.rewardHistory.unshift(reward);
    if (state.screen === "wallet") renderWalletRewards();
  }

  return { awardReward };
}
