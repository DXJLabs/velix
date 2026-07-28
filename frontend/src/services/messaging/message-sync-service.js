export function createMessageTimelineSyncService({
  state,
  loadTimeline,
  intervalMs = 5_000,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  onError = () => {},
}) {
  if (!state || typeof state !== "object") {
    throw new TypeError("Message timeline sync requires application state.");
  }
  if (typeof loadTimeline !== "function") {
    throw new TypeError("Message timeline sync requires loadTimeline().");
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000) {
    throw new TypeError("Message timeline sync interval must be at least 1000ms.");
  }

  let activeChannelId = "";
  let generation = 0;
  let timerId = null;

  function shouldRun(channelId, runGeneration) {
    return runGeneration === generation
      && activeChannelId === channelId
      && state.screen === "channel"
      && state.channelId === channelId;
  }

  async function tick(channelId, runGeneration) {
    if (!shouldRun(channelId, runGeneration)) return false;
    timerId = null;

    try {
      await loadTimeline(channelId);
    } catch (error) {
      onError(error, { channelId });
    }

    if (!shouldRun(channelId, runGeneration)) return false;
    timerId = setTimeoutFn(() => tick(channelId, runGeneration), intervalMs);
    return true;
  }

  function stop() {
    generation += 1;
    activeChannelId = "";
    if (timerId !== null) {
      clearTimeoutFn(timerId);
      timerId = null;
    }
  }

  async function start(channelId) {
    const normalizedChannelId = String(channelId || "").trim();
    stop();
    if (!normalizedChannelId) return false;
    activeChannelId = normalizedChannelId;
    return tick(normalizedChannelId, generation);
  }

  function isRunning() {
    return Boolean(activeChannelId) && shouldRun(activeChannelId, generation);
  }

  return { start, stop, isRunning };
}
