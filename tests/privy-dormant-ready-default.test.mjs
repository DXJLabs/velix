import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createRuntimeConfig } from "../frontend/src/app/runtime-config.js";

test("Privy is dormant by default even when its App ID remains configured", () => {
  const config = createRuntimeConfig({
    VITE_PRIVY_APP_ID: "cm-preserved",
    VITE_PRIVY_LOGIN_METHODS: "email,google",
  }, "");

  assert.equal(config.privyEnabled, false);
  assert.equal(config.privyAppId, "cm-preserved");
  assert.deepEqual(config.privyLoginMethods, ["email", "google"]);
});

test("Privy can be explicitly restored later without restoring deleted code", () => {
  const config = createRuntimeConfig({
    VITE_PRIVY_ENABLED: "true",
    VITE_PRIVY_APP_ID: "cm-preserved",
  }, "");

  assert.equal(config.privyEnabled, true);
  assert.equal(config.privyAppId, "cm-preserved");
});

test("production bootstrap skips Privy mount and routes wallet connection to Ready while disabled", async () => {
  const bootstrap = await readFile(
    new URL("../frontend/src/app/bootstrap.js", import.meta.url),
    "utf8",
  );

  assert.match(bootstrap, /!config\.privyEnabled \|\| !config\.privyAppId/);
  assert.match(bootstrap, /preferPrivacyWallet:\s*true/);
  assert.match(bootstrap, /config\.privyEnabled \? "conversations" : "wallet"/);
});

test("Privy implementation files remain in the repository", async () => {
  const privyRoot = await readFile(
    new URL("../frontend/src/ui/wallet/privy-auth-root.js", import.meta.url),
    "utf8",
  );
  const privyBridge = await readFile(
    new URL("../frontend/src/services/wallet/privy-bridge.js", import.meta.url),
    "utf8",
  );

  assert.match(privyRoot, /PrivyProvider/);
  assert.match(privyRoot, /usePrivy/);
  assert.match(privyBridge, /createPrivyBridgeAdapter/);
});
