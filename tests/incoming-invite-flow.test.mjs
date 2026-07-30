import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("invite metadata and capability secret use the URL fragment", async () => {
  const controller = await readFile(
    "frontend/src/features/invite/invite-controller.js",
    "utf8",
  );

  assert.match(controller, /fragment\.set\("v", "2"\)/);
  assert.match(controller, /fragment\.set\("k", inviteSecret\)/);
  assert.match(controller, /fragment\.set\("room", roomId\)/);
  assert.match(controller, /fragment\.set\("deal", dealTitle\)/);
  assert.match(controller, /url\.hash = fragment\.toString\(\)/);
  assert.doesNotMatch(controller, /url\.searchParams\.set\("room"/);
  assert.doesNotMatch(controller, /url\.searchParams\.set\("deal"/);
  assert.match(controller, /function readIncomingInvite/);
  assert.match(controller, /inviteSecret/);
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
  assert.match(ui, /Waiting for them to open the invite/);
});

test("pending onboarding room does not start private timeline discovery", async () => {
  const controller = await readFile(
    "frontend/src/features/deals/deal-room-controller.js",
    "utf8",
  );
  assert.match(
    controller,
    /if \(!channelRequiresJoin\(channel\) && channel\.privateMessagingReady !== false\) \{\s*void messageTimelineSync\.start\(channelId\);/,
  );
});
