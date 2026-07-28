import assert from "node:assert/strict";
import test from "node:test";

import { createMessageTimelineSyncService } from "../frontend/src/services/messaging/message-sync-service.js";

function fakeTimers() {
  let nextId = 0;
  const timers = [];
  const cleared = [];
  return {
    timers,
    cleared,
    setTimeoutFn(callback, delay) {
      const timer = { id: ++nextId, callback, delay };
      timers.push(timer);
      return timer.id;
    },
    clearTimeoutFn(id) {
      cleared.push(id);
    },
  };
}

test("message sync loads immediately and stops outside the active room", async () => {
  const state = { screen: "channel", channelId: "room-1" };
  const clock = fakeTimers();
  const loaded = [];
  const sync = createMessageTimelineSyncService({
    state,
    loadTimeline: async (channelId) => loaded.push(channelId),
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  assert.equal(await sync.start("room-1"), true);
  assert.deepEqual(loaded, ["room-1"]);
  assert.equal(clock.timers[0].delay, 5_000);
  assert.equal(sync.isRunning(), true);

  state.screen = "conversations";
  await clock.timers[0].callback();

  assert.deepEqual(loaded, ["room-1"]);
  assert.equal(clock.timers.length, 1);
  assert.equal(sync.isRunning(), false);
});

test("switching rooms cancels the old watcher and rejects its stale callback", async () => {
  const state = { screen: "channel", channelId: "room-1" };
  const clock = fakeTimers();
  const loaded = [];
  const sync = createMessageTimelineSyncService({
    state,
    loadTimeline: async (channelId) => loaded.push(channelId),
    intervalMs: 6_000,
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });

  await sync.start("room-1");
  const staleTimer = clock.timers[0];

  state.channelId = "room-2";
  await sync.start("room-2");

  assert.deepEqual(loaded, ["room-1", "room-2"]);
  assert.deepEqual(clock.cleared, [staleTimer.id]);
  assert.equal(clock.timers[1].delay, 6_000);

  await staleTimer.callback();
  assert.deepEqual(loaded, ["room-1", "room-2"]);

  sync.stop();
  assert.equal(sync.isRunning(), false);
  assert.deepEqual(clock.cleared, [staleTimer.id, clock.timers[1].id]);
});

test("temporary failures are reported and polling continues", async () => {
  const state = { screen: "channel", channelId: "room-1" };
  const clock = fakeTimers();
  const errors = [];
  const sync = createMessageTimelineSyncService({
    state,
    loadTimeline: async () => {
      throw new Error("temporary indexer failure");
    },
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
    onError(error, context) {
      errors.push({ message: error.message, channelId: context.channelId });
    },
  });

  assert.equal(await sync.start("room-1"), true);
  assert.deepEqual(errors, [{
    message: "temporary indexer failure",
    channelId: "room-1",
  }]);
  assert.equal(clock.timers.length, 1);
  assert.equal(sync.isRunning(), true);
});
