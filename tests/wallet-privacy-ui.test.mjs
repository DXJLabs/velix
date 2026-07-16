import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeConfig } from "../src/app/runtime-config.js";
import { createAppStore } from "../src/state/app-store.js";
import { walletScreenMarkup } from "../src/ui/wallet/wallet-screen-template.js";

test("wallet page exposes honest private balance, Pool, capability, and identity states", () => {
  const markup = walletScreenMarkup();
  for (const label of [
    "Private total (STRK)",
    "Spendable private",
    "Maturing private",
    "Privacy Pool",
    "Wallet privacy capability",
    "Private identity",
  ]) {
    assert.ok(markup.includes(label), `missing ${label}`);
  }
  assert.match(markup, /Unavailable is not a zero balance/);
  assert.match(markup, /never sends private balance or note data to its backend/);
});

test("all unverified private actions remain visibly disabled", () => {
  const markup = walletScreenMarkup();
  for (const action of [
    "Shield",
    "Send Privately",
    "Fund and Pay Privately",
    "Withdraw to My Wallet",
    "Pay Public Address",
    "Private Claim Link",
  ]) {
    const index = markup.indexOf(`<strong>${action}</strong>`);
    assert.ok(index >= 0, `missing ${action}`);
    const buttonStart = markup.lastIndexOf("<button", index);
    const openingButton = markup.slice(buttonStart, markup.indexOf(">", buttonStart) + 1);
    assert.match(openingButton, /\bdisabled\b/);
    assert.match(openingButton, /aria-disabled="true"/);
  }
});

test("production state starts with unknown private funds, never a fabricated zero", () => {
  const config = createRuntimeConfig({}, "");
  const store = createAppStore({ config, channels: [], messages: {}, initialRewardHistory: [] });
  assert.equal(store.state.walletPrivacyCapabilities.support, "unsupported");
  assert.equal(store.state.privateBalanceStatus, "unavailable");
  assert.deepEqual(store.state.privateBalances, {});
  assert.equal(store.state.privacyRegistrationStatus, "unknown");
});
