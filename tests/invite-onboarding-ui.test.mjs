import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const paths = {
  controller: "frontend/src/features/invite/invite-controller.js",
  template: "frontend/src/ui/new-deal/new-deal-screen-template.js",
  events: "frontend/src/app/events/click-events.js",
  registry: "frontend/src/app/feature-registry.js",
  runtimeApi: "frontend/src/app/runtime-api.js",
};

test("production invite is onboarding-only and does not create a private channel", async () => {
  const [controller, events, registry, runtimeApi] = await Promise.all([
    readFile(paths.controller, "utf8"),
    readFile(paths.events, "utf8"),
    readFile(paths.registry, "utf8"),
    readFile(paths.runtimeApi, "utf8"),
  ]);

  assert.match(controller, /async function createOnboardingInvite/);
  assert.match(controller, /onboardingInviteLink/);
  assert.match(controller, /The private room unlocks after/);
  assert.match(events, /dataset\.newDealAction === "onboard"/);
  assert.match(events, /state\.demoRuntimeMode/);
  assert.match(registry, /onboardingInviteEnabled: true/);
  assert.match(runtimeApi, /createOnboardingInvite/);
});

test("new deal UI explains identity, invite, and private-room progression", async () => {
  const template = await readFile(paths.template, "utf8");
  assert.match(template, /Start a private deal/);
  assert.match(template, /Private by default/);
  assert.match(template, /Create onboarding invite/);
  assert.match(template, /From invite to private room/);
  assert.match(template, /data-new-deal-action="show-invite"/);
});

test("invite link falls back to the deployed application origin", async () => {
  const registry = await readFile(paths.registry, "utf8");
  assert.match(registry, /window\.location\.origin/);
  assert.match(registry, /searchParams\.set\("invite"/);
});
