import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  transport: "packages/veil-sdk/src/privacy/wallet-message-transport.ts",
  walletService: "frontend/src/services/wallet/wallet-service.js",
  veilService: "frontend/src/services/veil-client-service.js",
  chatController: "frontend/src/features/chat/chat-controller.js",
  walletTemplate: "frontend/src/ui/wallet/wallet-screen-template.js",
  runtimeApi: "frontend/src/app/runtime-api.js",
  clickEvents: "frontend/src/app/events/click-events.js",
};

test("private-message transport submits exactly one helper invoke action", async () => {
  const source = await readFile(files.transport, "utf8");
  assert.match(source, /const helperCalldata = \[String\(input\.calldata\.length\), \.\.\.input\.calldata\]/);
  assert.match(source, /strk20InvokeAction\(this\.#helperAddress, helperCalldata\)/);
  assert.match(source, /this\.#walletApiClient\.invoke\(\[/);
  assert.doesNotMatch(source, /type:\s*["']transfer["']/);
  assert.doesNotMatch(source, /strk20TransferAction/);
  assert.doesNotMatch(source, /strk20DepositAction|strk20WithdrawAction|strk20TransferAction/);
});

test("frontend uses wallet-owned STRK20 messaging without custom registration", async () => {
  const [walletService, veilService, runtimeApi, clickEvents, walletTemplate] = await Promise.all([
    readFile(files.walletService, "utf8"),
    readFile(files.veilService, "utf8"),
    readFile(files.runtimeApi, "utf8"),
    readFile(files.clickEvents, "utf8"),
    readFile(files.walletTemplate, "utf8"),
  ]);
  assert.match(walletService, /Strk20WalletMessageTransport/);
  assert.match(walletService, /Strk20WalletApiClient/);
  assert.match(walletService, /activateMessagingTransport/);
  assert.match(veilService, /Strk20WalletMessageTransport/);
  assert.doesNotMatch(walletService, /createPrivacyRegistrationService/);
  assert.doesNotMatch(runtimeApi, /registerPrivateIdentity/);
  assert.doesNotMatch(clickEvents, /data-register-private-identity/);
  assert.doesNotMatch(walletTemplate, /Register Private Identity/);
});

test("chat UX describes shielded message rather than payment", async () => {
  const source = await readFile(files.chatController, "utf8");
  assert.match(source, /Shielded message/);
  assert.match(source, /VeilChannelHelper invoke/);
  assert.doesNotMatch(source, /payment memo|private payment/iu);
});
