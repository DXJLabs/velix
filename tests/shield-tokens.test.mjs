import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readWalletService() {
  return readFile(
    new URL("../frontend/src/services/wallet/wallet-service.js", import.meta.url),
    "utf8",
  );
}

test("shieldTokens exists and validates its inputs before touching the wallet", async () => {
  const service = await readWalletService();
  const shieldRoute = service.indexOf("async function shieldTokens(");
  assert.ok(shieldRoute >= 0, "shieldTokens must exist on the wallet service.");

  const nextFn = service.indexOf("async function ", shieldRoute + 1);
  const shieldBody = service.slice(shieldRoute, nextFn > shieldRoute ? nextFn : undefined);

  assert.match(shieldBody, /typeof tokenAddress !== "string" \|\| !tokenAddress/);
  assert.match(shieldBody, /typeof amount !== "bigint" \|\| amount <= 0n/);
  assert.match(shieldBody, /WALLET_NOT_CONNECTED/);
  assert.match(shieldBody, /PRIVACY_WALLET_UNSUPPORTED/);
});

test("shieldTokens sends exactly one deposit action — never bundled with a transfer", async () => {
  const service = await readWalletService();
  const shieldRoute = service.indexOf("async function shieldTokens(");
  const nextFn = service.indexOf("async function ", shieldRoute + 1);
  const shieldBody = service.slice(shieldRoute, nextFn > shieldRoute ? nextFn : undefined);

  assert.match(shieldBody, /client\.invoke\(\[\s*strk20DepositAction\(tokenAddress, amount\),\s*\]\)/);
  assert.doesNotMatch(shieldBody, /strk20TransferAction|type:\s*"transfer"/);
});

test("shieldTokens re-throws wallet errors instead of swallowing them", async () => {
  const service = await readWalletService();
  const shieldRoute = service.indexOf("async function shieldTokens(");
  const nextFn = service.indexOf("async function ", shieldRoute + 1);
  const shieldBody = service.slice(shieldRoute, nextFn > shieldRoute ? nextFn : undefined);

  const catchRoute = shieldBody.indexOf("} catch (error) {");
  assert.ok(catchRoute >= 0, "shieldTokens must handle the invoke() failure path.");
  const catchBlock = shieldBody.slice(catchRoute);
  assert.match(catchBlock, /throw error;/);
});

test("shieldTokens is exposed from the wallet service's public return value", async () => {
  const service = await readWalletService();
  const returnRoute = service.lastIndexOf("return {");
  const returnBlock = service.slice(returnRoute);
  assert.match(returnBlock, /^\s*shieldTokens,/m);
});

test("shieldTokens is wired through bootstrap and the wallet controller, not left orphaned", async () => {
  const bootstrap = await readFile(
    new URL("../frontend/src/app/bootstrap.js", import.meta.url),
    "utf8",
  );
  const controller = await readFile(
    new URL("../frontend/src/features/wallet/wallet-controller.js", import.meta.url),
    "utf8",
  );
  const registry = await readFile(
    new URL("../frontend/src/app/feature-registry.js", import.meta.url),
    "utf8",
  );

  assert.match(bootstrap, /shieldTokens:\s*\(options\)\s*=>\s*walletService\.shieldTokens\(options\)/);
  assert.match(controller, /async function shieldToken\(assetId, amount\)/);
  assert.match(registry, /shieldTokens:\s*api\.shieldTokens/);
});
