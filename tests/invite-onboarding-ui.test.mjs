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

test("production invite remains onboarding-only", async () => {
  const [controller, events, registry, runtimeApi] = await Promise.all([
    readFile(paths.controller, "utf8"),
    readFile(paths.events, "utf8"),
    readFile(paths.registry, "utf8"),
    readFile(paths.runtimeApi, "utf8"),
  ]);

  assert.match(controller, /async function createOnboardingInvite/);
  assert.match(controller, /onboardingInviteLink/);
  assert.match(events, /dataset\.newDealAction === "onboard"/);
  assert.match(registry, /onboardingInviteEnabled: true/);
  assert.match(runtimeApi, /createOnboardingInvite/);
});

test("new deal UI is simple and avoids LMS-style progression", async () => {
  const template = await readFile(paths.template, "utf8");
  assert.match(template, /Start a new deal/);
  assert.match(template, /Create a private room/);
  assert.match(template, /Nothing is sent until you create the invite/);
  assert.doesNotMatch(template, /How it works/);
  assert.doesNotMatch(template, /new-deal-journey/);
  assert.doesNotMatch(template, /Step 1/);
});

test("incoming invite explains safety before wallet connection", async () => {
  const template = await readFile(paths.template, "utf8");
  assert.match(template, /No payment requested/);
  assert.match(template, /No funds move when joining/);
  assert.match(template, /Never share your seed phrase/);
  assert.match(template, /Review & join with Ready/);
});

test("invite link falls back to the deployed application origin", async () => {
  const registry = await readFile(paths.registry, "utf8");
  assert.match(registry, /window\.location\.origin/);
  assert.match(registry, /searchParams\.set\("invite"/);
});
