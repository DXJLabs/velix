import {
  VEIL_REWARD_LABELS,
  VEIL_REWARD_POINTS,
  nextRewardTier,
} from "../domain/rewards.js";

export { VEIL_REWARD_POINTS, nextRewardTier };

export function createRewardEntry(ruleKey, now = Date.now()) {
  const points = VEIL_REWARD_POINTS[ruleKey] || 0;
  if (!points) return null;
  return {
    points,
    label: VEIL_REWARD_LABELS[ruleKey] || "VEIL Reward",
    time: now,
  };
}
