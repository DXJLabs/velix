import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SDK invite acceptance uses encrypted shielded helper submission", async () => {
  const source = await readFile(
    "packages/veil-sdk/src/privacy/invite-acceptance.ts",
    "utf8",
  );

  assert.match(source, /PrivacyPoolChannelEncryptionAdapter/);
  assert.match(source, /sendShieldedMessage/);
  assert.match(source, /messageLocator: material\.messageLocator/);
  assert.match(source, /kind: "invite_acceptance"/);
  assert.doesNotMatch(source, /strk20TransferAction|depositAction|withdrawAction/);
});

test("invite acceptance derives a stable one-time locator without plaintext calldata", async () => {
  const source = await readFile(
    "packages/veil-sdk/src/privacy/invite-acceptance.ts",
    "utf8",
  );

  assert.match(source, /veil:invite-acceptance-locator:v1/);
  assert.match(source, /inviteCodeHash/);
  assert.match(source, /receiverAddress/);
  assert.match(source, /encryptedAcceptance/);
});

test("receiver creates the room only after Ready returns a transaction hash", async () => {
  const source = await readFile(
    "frontend/src/features/invite/invite-controller.js",
    "utf8",
  );

  const submitIndex = source.indexOf("await submitInviteAcceptance");
  const channelIndex = source.indexOf("createLocalChannelModel({", submitIndex);

  assert.ok(submitIndex >= 0, "submitInviteAcceptance call is missing");
  assert.ok(channelIndex > submitIndex, "local room must be created only after on-chain acceptance");
  assert.match(source, /acceptance\.transactionHash/);
  assert.match(source, /Invitation accepted on Starknet/);
  assert.match(source, /mode: "strk20-shielded"/);
  assert.doesNotMatch(source.slice(submitIndex, channelIndex), /offchain:\s*true/);
});

test("frontend exports the invite acceptance bridge", async () => {
  const source = await readFile(
    "frontend/src/services/veil-client-service.js",
    "utf8",
  );
  assert.match(source, /submitInviteAcceptance/);
});
