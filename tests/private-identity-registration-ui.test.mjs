import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  service: "frontend/src/services/wallet/privacy-registration-service.js",
  walletService: "frontend/src/services/wallet/wallet-service.js",
  controller: "frontend/src/features/wallet/wallet-controller.js",
  template: "frontend/src/ui/wallet/wallet-screen-template.js",
  events: "frontend/src/app/events/click-events.js",
  bootstrap: "frontend/src/app/bootstrap.js",
  runtimeApi: "frontend/src/app/runtime-api.js",
  client: "frontend/src/services/veil-client-service.js",
};

test("frontend private identity registration remains readiness gated", async () => {
  const source = await readFile(files.service, "utf8");

  assert.match(source, /signer\?\.signTransaction/);
  assert.match(source, /account\.execute/);
  assert.match(source, /prover\?\.configured/);
  assert.match(source, /windowRef\.indexedDB/);
  assert.match(source, /windowRef\.crypto\?\.subtle/);
  assert.match(source, /createReadyPrivateTransfersUser/);
  assert.match(source, /prepareOfficialRegistrationProof/);
  assert.match(source, /submitOfficialRegistration/);
  assert.match(source, /computeProvingBlockId/);
  assert.match(source, /PrivacyProfileViewingKeyVault/);
});

test("registration verifies receipt and Pool key through R3 services", async () => {
  const source = await readFile(files.service, "utf8");

  assert.match(source, /ProvingServiceProofProvider/);
  assert.match(source, /provider: context\.readProvider/);
  assert.match(source, /state\.privacyRegistrationStatus = "registered"/);
  assert.match(source, /privacyRegistrationTxHash/);
  assert.doesNotMatch(source, /localStorage.*viewing/iu);
  assert.doesNotMatch(source, /console\.(log|error).*viewing/iu);
});

test("wallet UI exposes one fail-closed registration action", async () => {
  const [walletService, controller, template, events, bootstrap, runtimeApi, client] =
    await Promise.all([
      readFile(files.walletService, "utf8"),
      readFile(files.controller, "utf8"),
      readFile(files.template, "utf8"),
      readFile(files.events, "utf8"),
      readFile(files.bootstrap, "utf8"),
      readFile(files.runtimeApi, "utf8"),
      readFile(files.client, "utf8"),
    ]);

  assert.match(walletService, /createPrivacyRegistrationService/);
  assert.match(walletService, /readyAccount/);
  assert.match(walletService, /registerPrivateIdentity/);
  assert.match(controller, /data-register-private-identity/);
  assert.match(controller, /privacyRegistrationReadiness === "ready"/);
  assert.match(template, /data-register-private-identity/);
  assert.match(template, /wallet-registration-reason/);
  assert.match(events, /api\.registerPrivateIdentity\(\)/);
  assert.match(bootstrap, /registerPrivateIdentity: \(\) => walletService\.registerPrivateIdentity\(\)/);
  assert.match(runtimeApi, /registerPrivateIdentity/);
  assert.match(client, /ProvingServiceProofProvider/);
});
