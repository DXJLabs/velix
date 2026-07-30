import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("incoming invite remains closed until private messaging is ready", async () => {
  const controller = await readFile(
    "frontend/src/features/invite/invite-controller.js",
    "utf8",
  );

  assert.match(controller, /status: "Setting Up Private Room"/);
  assert.match(controller, /privateMessagingReady: false/);
  assert.match(controller, /Your invitation is open\. VEIL is preparing the private room/);
  assert.doesNotMatch(
    controller,
    /confirmedTimelineMeta\(`\$\{channel\.id\}-invite-accepted`/,
  );
});

test("private setup blocks composer and timeline polling", async () => {
  const controller = await readFile(
    "frontend/src/features/deals/deal-room-controller.js",
    "utf8",
  );

  assert.match(controller, /channel\.privateMessagingReady !== false/);
  assert.match(
    controller,
    /composerForm\.hidden = waitingForCounterparty \|\| privateSetupRequired/,
  );
  assert.match(controller, /messageTimelineSync\.stop\(\)/);
  assert.match(controller, /RECIPIENT_ENCRYPTION_KEY_NOT_FOUND/);
  assert.match(controller, /ENCRYPTION_KEY_REGISTRY_UNAVAILABLE/);
});

test("waiting and setup states use calm non-technical language", async () => {
  const [controller, ui] = await Promise.all([
    readFile("frontend/src/features/deals/deal-room-controller.js", "utf8"),
    readFile("frontend/src/ui/invite-ui.js", "utf8"),
  ]);

  assert.match(controller, /Setting up your private room/);
  assert.match(controller, /No payment is requested and no funds move/);
  assert.match(ui, /Invitation ready/);
  assert.match(ui, /Waiting for them to open the invite/);
  assert.doesNotMatch(ui, /STRK20|Privacy Pool|encryption registry/i);
});

test("waiting rooms hide technical security banner and use a bundled icon", async () => {
  const [controller, template, channelTemplate] = await Promise.all([
    readFile("frontend/src/features/deals/deal-room-controller.js", "utf8"),
    readFile("frontend/src/ui/new-deal/new-deal-screen-template.js", "utf8"),
    readFile("frontend/src/ui/channel/channel-screen-template.js", "utf8"),
  ]);

  assert.match(
    controller,
    /securityBanner\.hidden = waitingForCounterparty \|\| privateSetupRequired/,
  );
  assert.doesNotMatch(template, /message-circle-lock/);
  assert.match(template, /data-lucide="lock-keyhole"/);
  assert.match(channelTemplate, /Private messages/);
  assert.doesNotMatch(channelTemplate, /Ciphertext on-chain/);
});

