import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("incoming invite remains blocked until wallet-managed encryption is ready", async () => {
  const controller = await readFile(
    "frontend/src/features/invite/invite-controller.js",
    "utf8",
  );

  assert.match(controller, /status: "Private Setup Required"/);
  assert.match(controller, /privateMessagingReady: false/);
  assert.match(controller, /No on-chain acceptance has been submitted yet/);
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

  assert.match(
    controller,
    /channel\.privateMessagingReady !== false/,
  );
  assert.match(
    controller,
    /composerForm\.hidden = waitingForCounterparty \|\| privateSetupRequired/,
  );
  assert.match(controller, /messageTimelineSync\.stop\(\)/);
  assert.match(controller, /RECIPIENT_ENCRYPTION_KEY_NOT_FOUND/);
  assert.match(controller, /ENCRYPTION_KEY_REGISTRY_UNAVAILABLE/);
});

test("invite card constrains long links and mobile actions", async () => {
  const css = await readFile(
    "frontend/src/styles/features/chat-feed.css",
    "utf8",
  );

  assert.match(css, /\.invite-link-card strong/);
  assert.match(css, /text-overflow: ellipsis/);
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /grid-template-columns: 1fr/);
});
