import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath =
  ".github/workflows/4.2-ready-browser-registration-e2e.yml";
const bridgePath =
  ".github/scripts/ready-browser-prover-bridge.mjs";

test("Ready browser workflow starts the pinned prover and two temporary tunnels", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(
    workflow,
    /starknet-privacy-transaction-prover:privacy-0\.14\.3-rc\.2-x86-64-v3/,
  );
  assert.match(workflow, /VITE_STRK20_PROVER_MODE: "hosted"/);
  assert.match(
    workflow,
    /VITE_STRK20_PROVER_URL: \$\{\{ steps\.prover_tunnel\.outputs\.url \}\}/,
  );
  assert.equal(
    (workflow.match(/cloudflare\/cloudflared:latest/g) || []).length >= 3,
    true,
  );
  assert.match(workflow, /Open temporary prover tunnel/);
  assert.match(workflow, /Open temporary frontend tunnel/);
  assert.match(workflow, /Publish temporary browser URLs/);
  assert.match(workflow, /Keep temporary Ready session online/);
});

test("workflow does not embed account or private RPC secrets into the browser build", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.doesNotMatch(workflow, /ACCOUNT_PRIVATE_KEY/);
  assert.doesNotMatch(workflow, /VIEWING_KEY/);
  assert.doesNotMatch(workflow, /VITE_STARKNET_RPC_URL:\s*\$\{\{\s*secrets\./);
  assert.match(
    workflow,
    /The secret value will not be embedded in the browser build/,
  );
  assert.match(workflow, /STARKNET_SEPOLIA_RPC_URL/);
});

test("prover bridge restricts CORS and keeps long JSON-RPC responses active", async () => {
  const bridge = await readFile(bridgePath, "utf8");

  assert.match(bridge, /origin !== allowed/);
  assert.match(bridge, /"Access-Control-Allow-Origin": origin/);
  assert.doesNotMatch(
    bridge,
    /"Access-Control-Allow-Origin":\s*"\*"/,
  );
  assert.match(bridge, /"Transfer-Encoding": "chunked"/);
  assert.match(bridge, /heartbeatIntervalMs = 10_000/);
  assert.match(bridge, /" "\.repeat\(2048\)/);
  assert.match(bridge, /server\.requestTimeout = 0/);
  assert.doesNotMatch(bridge, /text\/event-stream/);
  assert.doesNotMatch(bridge, /console\.log\([^)]*body/);
});

test("workflow validates CORS, exposes the Ready URL, and cleans up", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /access-control-allow-origin: \$FRONTEND_URL/);
  assert.match(workflow, /VEIL Ready Browser URL/);
  assert.match(
    workflow,
    /Wallet → Connect Ready Wallet → Register Private Identity/,
  );
  assert.match(workflow, /docker rm -f/);
  assert.match(workflow, /prover-redacted\.log/);
  assert.match(workflow, /retention-days: 1/);
});


test("workflow proxies Starknet RPC without embedding its secret URL", async () => {
  const [workflow, bridge] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(".github/scripts/ready-browser-rpc-bridge.mjs", "utf8"),
  ]);

  assert.match(workflow, /Start browser-safe Starknet RPC bridge/);
  assert.match(workflow, /Open temporary Starknet RPC tunnel/);
  assert.match(
    workflow,
    /VITE_STARKNET_RPC_URL: "\$\{\{ steps\.rpc_tunnel\.outputs\.url \}\}\/rpc\/v0_9"/,
  );
  assert.match(workflow, /starknet_getNonce/);
  assert.match(workflow, /VEIL_POOL_NONCE_RPC_VERIFIED/);
  assert.match(workflow, /VEIL_PUBLIC_RPC_CORS_VERIFIED/);
  assert.match(workflow, /veil-ready-rpc-bridge/);
  assert.match(workflow, /veil-ready-rpc-tunnel/);

  assert.match(bridge, /origin !== allowed/);
  assert.match(bridge, /"Access-Control-Allow-Origin": origin/);
  assert.match(bridge, /VEIL_UPSTREAM_RPC_URL/);
  assert.doesNotMatch(bridge, /console\.log\([^)]*upstreamRpcUrl/);
  assert.doesNotMatch(bridge, /console\.log\([^)]*body/);
});
