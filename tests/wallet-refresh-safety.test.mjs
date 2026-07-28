import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("helper deployment verification accepts a refresh call without arguments", async () => {
  const source = await readFile(
    new URL("../frontend/src/services/wallet/network-service.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /async function verifyHelperDeployment\(\)/);
  assert.doesNotMatch(source, /verifyHelperDeployment\(\{\s*veilClient/);
});

test("wallet refresh click catches rejected promises", async () => {
  const source = await readFile(
    new URL("../frontend/src/app/events/click-events.js", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /Promise\.resolve\(api\.refreshWalletConnection\(\)\)\.catch/,
  );
  assert.match(source, /wallet\.refresh\.click\.failed/);
  assert.match(source, /Unable to refresh wallet connection/);
});
