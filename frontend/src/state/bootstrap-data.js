import { CHAT_DISPLAY_MODE } from "../app/runtime-config.js";
import { createDemoData } from "./demo-data.js";

export function createProductionData() {
  return {
    minute: 60_000,
    channels: [],
    messages: {},
    initialRewardHistory: [],
    confirmedTimelineMeta: () => ({
      status: "local",
      mode: CHAT_DISPLAY_MODE,
    }),
  };
}

export function createBootstrapData({
  demoRuntimeMode = false,
  now = Date.now(),
  demoTxHash,
  demoDataFactory = createDemoData,
} = {}) {
  if (!demoRuntimeMode) return createProductionData();
  return demoDataFactory({ now, demoTxHash });
}
