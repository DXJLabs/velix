import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("invite acceptance uses an encrypted shielded helper submission", async () => {
  const source = await readFile(
    "packages/veil-sdk/src/privacy/invite-acceptance.ts",
    "utf8",
  );

  assert.match(source, /PrivacyPoolChannelEncryptionAdapter/);
  assert.match(source, /sendShieldedMessage/);
  assert.match(source, /messageLocator: material\.messageLocator/);
  assert.match(source, /kind: "invite_acceptance"/);
  assert.doesNotMatch(
    source,
    /strk20TransferAction|depositAction|withdrawAction/,
  );
});

test("invite acceptance secret is random and not derived from public URL fields", async () => {
  const source = await readFile(
    "packages/veil-sdk/src/privacy/invite-acceptance.ts",
    "utf8",
  );

  assert.match(source, /generateInviteSecret/);
  assert.match(source, /getRandomValues\(new Uint8Array\(32\)\)/);
  assert.match(source, /INVITE_SECRET_PATTERN/);
  assert.match(source, /inviteSecret: string/);
  assert.match(source, /veil:invite-handshake-key:v2/);
  assert.doesNotMatch(
    source,
    /veil:invite-handshake-key:v1\|\$\{normalizedInviteCode\}\|\$\{normalizedRoomId\}/,
  );
});

test("acceptance transport bypasses the legacy recipient-key registry", async () => {
  const source = await readFile(
    "packages/veil-sdk/src/privacy/invite-acceptance.ts",
    "utf8",
  );

  assert.match(
    source,
    /encodeConversationTag: async \(\) => conversationTag/,
  );
  assert.match(
    source,
    /transport\.invokeExternal\(input\)/,
  );
  assert.doesNotMatch(
    source,
    /deriveConversationTag\(channelId\)/,
  );
  assert.doesNotMatch(
    source,
    /EncryptionPublicKeyRegistryService|RECIPIENT_ENCRYPTION_KEY_NOT_FOUND/,
  );
});

test("receiver creates the room only after Ready returns a transaction hash", async () => {
  const source = await readFile(
    "frontend/src/features/invite/invite-controller.js",
    "utf8",
  );

  const submitIndex = source.indexOf("await submitInviteAcceptance");
  const channelIndex = source.indexOf(
    "createLocalChannelModel({",
    submitIndex,
  );

  assert.ok(submitIndex >= 0, "submitInviteAcceptance call is missing");
  assert.ok(
    channelIndex > submitIndex,
    "local room must be created only after on-chain acceptance",
  );
  const submitBlock = source.slice(submitIndex, source.indexOf("});", submitIndex) + 3);
  assert.match(
    submitBlock,
    /inviteSecret: invite\.inviteSecret/,
    "invite secret must be passed to the acceptance submission",
  );
  assert.match(source, /acceptance\.transactionHash/);
  assert.match(source, /Invitation accepted on Starknet/);
  assert.match(source, /mode: "strk20-shielded"/);
});

test("sender stores only the opaque acceptance locator beside the share link", async () => {
  const source = await readFile(
    "frontend/src/features/invite/invite-controller.js",
    "utf8",
  );

  assert.match(
    source,
    /inviteAcceptanceLocator: acceptanceMaterial\.messageLocator/,
  );
  assert.match(source, /channel\.inviteLink = link/);
  assert.doesNotMatch(source, /channel\.inviteSecret\s*=/);
});

test("frontend exports the invite capability helpers", async () => {
  const source = await readFile(
    "frontend/src/services/veil-client-service.js",
    "utf8",
  );
  assert.match(source, /deriveInviteAcceptanceMaterial/);
  assert.match(source, /generateInviteSecret/);
  assert.match(source, /submitInviteAcceptance/);
});
