import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("invite URL carries shared room metadata and receiver parses it", async () => {
  const controller = await readFile("frontend/src/features/invite/invite-controller.js", "utf8");
  assert.match(controller, /url\.searchParams\.set\("room", roomId\)/);
  assert.match(controller, /url\.searchParams\.set\("deal", dealTitle\)/);
  assert.match(controller, /url\.searchParams\.set\("inviter", state\.walletAddress\)/);
  assert.match(controller, /function readIncomingInvite/);
  assert.match(controller, /async function acceptIncomingInvite/);
  assert.match(controller, /channelId: invite\.roomId/);
});

test("application opens the incoming invitation route at startup", async () => {
  const [init, runtimeApi, events] = await Promise.all([
    readFile("frontend/src/app/init.js", "utf8"),
    readFile("frontend/src/app/runtime-api.js", "utf8"),
    readFile("frontend/src/app/events/click-events.js", "utf8"),
  ]);
  assert.match(init, /openIncomingInvite/);
  assert.match(runtimeApi, /acceptIncomingInvite/);
  assert.match(events, /data-accept-incoming-invite/);
});

test("sender waiting card no longer exposes fake preview acceptance", async () => {
  const ui = await readFile("frontend/src/ui/invite-ui.js", "utf8");
  assert.doesNotMatch(ui, /Preview Accept Invitation/);
  assert.match(ui, /Waiting for counterparty/);
});
