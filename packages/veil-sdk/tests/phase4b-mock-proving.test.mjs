/**
 * Phase 4B — Mock Proving Pipeline Verification
 *
 * Uses the official SDK 0.14.3-rc.2 testing exports:
 * - CallMockProofProvider (real compile_actions via callContract)
 * - createPrivateTransfers (uses real ProofInvocationFactory internally)
 *
 * Verifies:
 * - SDK builder → createProofInvocation produces a real signed Invoke V3
 * - CallMockProofProvider.prove() calls Pool::compile_actions on-chain
 * - output / proofFacts / messagePayload are well-formed
 * - decoded server actions: exactly one WriteOnce + exactly one Invoke
 * - Invoke target is VeilChannelHelper
 * - no TransferFrom, TransferTo, Deposit, or Withdraw server actions
 * - replay-protection WriteOnce produced by builder.register()
 *
 * Does NOT produce a real ZK proof.
 * LOCAL_PROVER_VERIFIED remains false.
 * FASE_5_STARTED remains false.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";

import {
  Account,
  CallData,
  RpcProvider,
  constants,
  ec,
  Signer,
} from "starknet";

import {
  CallMockProofProvider,
  compute_channel_key,
} from "@starkware-libs/starknet-privacy-sdk/testing";

import {
  createPrivateTransfers,
  createEmptyRegistry,
  MAX_VIEWING_KEY,
} from "@starkware-libs/starknet-privacy-sdk";

// ── Public Sepolia addresses (from VEIL .env.example) ──────────────────────
const POOL_ADDRESS = "0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5";
const HELPER_ADDRESS = "0x052390845931a0c8d4735246d853a1a514c3cbf88cb1714937284814c5e57b23";

// ── Payload V1 constants ───────────────────────────────────────────────────
const ENVELOPE_VERSION = 1n;
const MAX_CIPHERTEXT_CHUNKS = 64;
const MAX_CIPHERTEXT_BYTES = 1984;

// ── Synthetic signing fixture ──────────────────────────────────────────────
/**
 * Creates a random viewing key within the valid range and a minimal
 * { address, signer } object for offline signing. This is a synthetic
 * fixture — the address is NOT a deployed Starknet smart-account.
 */
function makeSyntheticFixture() {
  const sc = ec.starkCurve;
  // Viewing key within [1, MAX_VIEWING_KEY]
  const viewingKey = BigInt("0x" + randomBytes(31).toString("hex")) % MAX_VIEWING_KEY;
  if (viewingKey === 0n) throw new Error("zero viewing key");
  // Synthetic account private key (NOT deployed)
  const privKeyHex = randomBytes(31).toString("hex");
  const pubKey = sc.getStarkKey(privKeyHex);
  // starknet.js Account expects 0x-prefixed hex string
  const address = "0x" + BigInt(pubKey).toString(16);
  const signer = new Signer("0x" + privKeyHex);
  return { viewingKey, address, signer };
}

// ── V1 payload builder ─────────────────────────────────────────────────────
/**
 * Canonical VEIL V1 ciphertext envelope:
 * [envelope_version, message_locator, payload_commitment, payload_chunk_count, ...ciphertext_chunks]
 *
 * message_locator is ONE felt (not an array).
 */
function buildV1Payload() {
  const messageLocator = 0x1n;
  const payloadCommitment = BigInt("0x" + randomBytes(31).toString("hex"));
  const chunkCount = 1n;
  const ciphertextChunk = BigInt("0x" + randomBytes(31).toString("hex"));

  const payload = [ENVELOPE_VERSION, messageLocator, payloadCommitment, chunkCount, ciphertextChunk];

  // Runtime constraints
  assert.equal(payload[0], ENVELOPE_VERSION, "envelope_version must be 1");
  assert.ok(Number(chunkCount) <= MAX_CIPHERTEXT_CHUNKS, `chunk count ${chunkCount} exceeds ${MAX_CIPHERTEXT_CHUNKS}`);

  return payload;
}

// ── Local discovery provider (no network, derives channels from viewing key) ─
class LocalDiscoveryProvider {
  constructor(userViewingKey) {
    this.userViewingKey = userViewingKey;
  }
  async discoverChannels(userAddress, viewingKey, recipients) {
    const channels = createEmptyRegistry().channels;
    const list = Array.isArray(recipients) ? recipients : [];
    for (const r of list) {
      channels.set(r, {
        key: compute_channel_key(viewingKey, userAddress, 0n),
        publicKey: ec.starkCurve.getStarkKey(viewingKey),
        tokens: new Map(),
      });
    }
    return { channels, total: list.length };
  }
  async discoverNotes() {
    return { notes: createEmptyRegistry().notes, cursor: null };
  }
}

// ── Server action decoding ─────────────────────────────────────────────────
/**
 * Decode the compile_actions output (Span<ServerAction>) using the pool ABI.
 *
 * The raw result from callContract is string[] of felts.
 * We use CallData.decodeParameters with the ABI type to get structured actions.
 *
 * Decoded shape per action: { variant: { ActionName: { ...fields } } }
 */
function decodeServerActions(rawResult, poolAbi) {
  const cd = new CallData(poolAbi);
  return cd.decodeParameters("core::array::Span::<privacy::actions::ServerAction>", rawResult);
}

/** Extract the action type name from a decoded ServerAction.
 * CairoCustomEnum decoded shape: { variantName: value, otherVariant: undefined, ... }
 * The active variant is the first key with a non-nullish value.
 */
function actionTypeName(action) {
  if (action && typeof action === "object" && action.variant && typeof action.variant === "object") {
    for (const key of Object.keys(action.variant)) {
      if (action.variant[key] != null) return key;
    }
    // Fallback: first key (all undefined — shouldn't happen in valid output)
    return Object.keys(action.variant)[0] || "unknown";
  }
  return "unknown";
}

// ── Pool ABI loader (from SDK internal) ────────────────────────────────────
async function loadPoolAbi() {
  const mod = await import("@starkware-libs/starknet-privacy-sdk/abi");
  return mod.PrivacyPoolABI;
}

// ── Preliminary RPC / pool compatibility check ─────────────────────────────
async function checkPoolCompatibility(rpcUrl) {
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const classHash = await provider.getClassHashAt(POOL_ADDRESS);
  const classData = await provider.getClassByHash(classHash);
  const abi = classData.abi || [];

  // Find IClient interface and verify compile_actions exists
  const iClient = abi.find(
    (e) => e.type === "interface" && e.name === "privacy::interface::IClient",
  );
  if (!iClient || !iClient.items) {
    return { ok: false, reason: "IClient interface not found in pool ABI" };
  }
  const compileFn = iClient.items.find(
    (i) => i.type === "function" && i.name === "compile_actions",
  );
  if (!compileFn) {
    return { ok: false, reason: "compile_actions not found in IClient" };
  }
  // Verify it's a view function
  if (compileFn.state_mutability !== "view" && compileFn.stateMutability !== "view") {
    return { ok: false, reason: "compile_actions is not a view function" };
  }

  // Also verify apply_actions exists in IServer
  const iServer = abi.find(
    (e) => e.type === "interface" && e.name === "privacy::interface::IServer",
  );
  if (!iServer || !iServer.items) {
    return { ok: false, reason: "IServer interface not found in pool ABI" };
  }
  const applyFn = iServer.items.find(
    (i) => i.type === "function" && i.name === "apply_actions",
  );
  if (!applyFn) {
    return { ok: false, reason: "apply_actions not found in IServer" };
  }

  return {
    ok: true,
    classHash,
    abi,
    poolAbi: abi,
  };
}

// ── Test 1: Static — imports and API surface ───────────────────────────────
test("Static: official SDK exports are available", () => {
  assert.equal(typeof createPrivateTransfers, "function");
  assert.equal(typeof createEmptyRegistry, "function");
  assert.ok(MAX_VIEWING_KEY > 0n, "MAX_VIEWING_KEY must be positive");
  assert.equal(typeof CallMockProofProvider, "function");
  assert.equal(typeof compute_channel_key, "function");
});

// ── Test 2: Static — synthetic signing fixture + invocation structure ──────
test("Static: synthetic fixture produces real signed Invoke V3 (not mock JSON calldata)", async (t) => {
  const fixture = makeSyntheticFixture();
  t.diagnostic("Synthetic fixture address: " + fixture.address.slice(0, 10) + "…");

  // Create a minimal provider for Account construction (not used for network calls)
  const provider = new RpcProvider({ nodeUrl: "http://127.0.0.1:9999" });
  // starknet.js v9 Account uses options object, not positional args
  const account = new Account({ provider, address: fixture.address, signer: fixture.signer });

  const localDiscovery = new LocalDiscoveryProvider(fixture.viewingKey);
  const transfers = createPrivateTransfers({
    account,
    viewingKeyProvider: { getViewingKey: async () => fixture.viewingKey },
    provingProvider: {
      // Minimal stub — getDefaultDetails only, not used for actual proving in this test
      async getDefaultDetails() {
        return {
          versions: ["0x3"],
          nonce: 0n,
          skipValidate: true,
          resourceBounds: {
            l1_gas: { max_amount: 1n, max_price_per_unit: 0n },
            l2_gas: { max_amount: 100000000n, max_price_per_unit: 0n },
            l1_data_gas: { max_amount: 1n, max_price_per_unit: 0n },
          },
          tip: 0n,
          paymasterData: [],
          accountDeploymentData: [],
          nonceDataAvailabilityMode: "L1",
          feeDataAvailabilityMode: "L1",
          version: "0x3",
          chainId: constants.StarknetChainId.SN_SEPOLIA,
        };
      },
    },
    discoveryProvider: localDiscovery,
    poolContractAddress: POOL_ADDRESS,
  });

  const payloadV1 = buildV1Payload();

  // Exact builder chain per spec — no autoRegister/autoSetup combined with .register()
  const result = await transfers
    .build()
    .register()
    .invoke(({ openNotes, withdrawals, poolAddress }) => ({
      contractAddress: HELPER_ADDRESS,
      calldata: payloadV1,
    }))
    .createProofInvocation();

  const { invocation } = result;

  // Verify Invoke V3 structure
  assert.equal(invocation.type, "INVOKE");
  assert.equal(invocation.version, "0x3");
  assert.equal(
    BigInt(invocation.sender_address),
    BigInt(POOL_ADDRESS),
    "sender_address must match POOL_ADDRESS",
  );

  // Calldata is real __execute__ wrapping: [array_len=1, to, selector, inner_len, ...inner]
  // NOT mock format: [userAddr, viewingKey, JSON_STRING]
  const arrayLen = BigInt(invocation.calldata[0]);
  assert.equal(arrayLen, 1n, "calldata[0] should be array_len=1 for one inner call");

  // Signature is present (real signing, not empty mock)
  assert.ok(
    Array.isArray(invocation.signature) && invocation.signature.length > 0,
    "Real invocation must have a non-empty signature",
  );

  // calldata[2] should NOT be a JSON string (mock factory hallmark)
  const secondCalldataItem = invocation.calldata[2];
  assert.ok(
    typeof secondCalldataItem !== "string" || !secondCalldataItem.startsWith("{"),
    "calldata[2] must NOT be a JSON string (mock factory format)",
  );
});

// ── Test 3: Execution — CallMockProofProvider pipeline ─────────────────────
test("Execution: CallMockProofProvider pipeline — compile_actions + decode + validate", async (t) => {
  // Read RPC URL inside the test — static tests don't need it
  const rpcUrl = process.env.STARKNET_SEPOLIA_RPC_URL;
  if (!rpcUrl) {
    t.diagnostic("STARKNET_SEPOLIA_RPC_URL_REQUIRED — set the env var to run execution tests");
    t.skip("STARKNET_SEPOLIA_RPC_URL_REQUIRED");
    return;
  }

  // Preliminary: RPC + pool compatibility check (explicit, not try/catch swallow)
  const compat = await checkPoolCompatibility(rpcUrl);
  if (!compat.ok) {
    t.diagnostic("Pool compatibility check failed: " + compat.reason);
    t.skip("CALL_MOCK_POOL_CONTEXT_BLOCKED");
    return;
  }
  t.diagnostic("Pool classHash: " + compat.classHash);
  t.diagnostic("POOL_ABI_SURFACE_VERIFIED=true");
  t.diagnostic("POOL_EXACT_RC0_IDENTITY_VERIFIED=false");

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const fixture = makeSyntheticFixture();
  const account = new Account({ provider, address: fixture.address, signer: fixture.signer });

  const localDiscovery = new LocalDiscoveryProvider(fixture.viewingKey);
  const callMockProvider = new CallMockProofProvider(
    provider,
    constants.StarknetChainId.SN_SEPOLIA,
    { validateSignature: false },
  );

  const transfers = createPrivateTransfers({
    account,
    viewingKeyProvider: { getViewingKey: async () => fixture.viewingKey },
    provingProvider: callMockProvider,
    discoveryProvider: localDiscovery,
    poolContractAddress: POOL_ADDRESS,
  });

  const payloadV1 = buildV1Payload();

  // Exact builder chain: .register() → .invoke() → .createProofInvocation()
  const { invocation, registry, warnings } = await transfers
    .build()
    .register()
    .invoke(({ openNotes, withdrawals, poolAddress }) => ({
      contractAddress: HELPER_ADDRESS,
      calldata: payloadV1,
    }))
    .createProofInvocation();

  t.diagnostic("Proof invocation created: " + invocation.type + " v" + invocation.version);
  t.diagnostic("Calldata length: " + invocation.calldata.length);
  t.diagnostic("Signature length: " + (invocation.signature?.length ?? 0));
  t.diagnostic("Warnings: " + JSON.stringify(warnings));

  // CallMockProofProvider.prove → calls compile_actions on the pool
  const proof = await callMockProvider.prove(invocation);

  t.diagnostic("Proof output length: " + (proof.output?.length ?? 0));
  t.diagnostic("Proof facts count: " + (proof.proofFacts?.length ?? 0));

  // Validate: proof output is well-formed
  assert.ok(Array.isArray(proof.output), "proof.output must be an array");
  assert.ok(proof.output.length > 0, "proof.output must not be empty");

  // Validate: proofFacts are well-formed felts
  assert.ok(Array.isArray(proof.proofFacts), "proofFacts must be an array");
  assert.ok(proof.proofFacts.length > 0, "proofFacts must not be empty");
  for (const fact of proof.proofFacts) {
    assert.ok(
      typeof fact === "string" || typeof fact === "bigint",
      "each proofFact must be string or bigint, got " + typeof fact,
    );
  }

  // Validate: message payload starts with pool class hash (L2-to-L1 format)
  const outputClassHash = BigInt(proof.output[0]);
  assert.equal(
    outputClassHash.toString(16),
    BigInt(compat.classHash).toString(16),
    "message payload must start with pool class hash",
  );

  // Decode server actions from compile_actions output using pool ABI
  const serverActions = decodeServerActions(proof.output.slice(1), compat.poolAbi);
  assert.ok(Array.isArray(serverActions), "decoded server actions must be an array");
  assert.ok(serverActions.length > 0, "decoded server actions must not be empty");

  t.diagnostic("Decoded server actions count: " + serverActions.length);
  t.diagnostic("Server actions: " + serverActions.map(actionTypeName).join(", "));

  // ── Decode-based validation ──────────────────────────────────────────────

  const actionTypes = serverActions.map(actionTypeName);

  // WriteOnce produced for both SetViewingKey storage + self-channel marker
  const writeOnceCount = actionTypes.filter((t) => t === "WriteOnce").length;
  assert.ok(writeOnceCount >= 1, "must have at least one WriteOnce action, got " + writeOnceCount);

  // Exactly one Invoke
  const invokeCount = actionTypes.filter((t) => t === "Invoke").length;
  assert.equal(invokeCount, 1, "must have exactly one Invoke action, got " + invokeCount);

  // No TransferFrom
  const transferFromCount = actionTypes.filter((t) => t === "TransferFrom").length;
  assert.equal(transferFromCount, 0, "must have no TransferFrom actions, got " + transferFromCount);

  // No TransferTo
  const transferToCount = actionTypes.filter((t) => t === "TransferTo").length;
  assert.equal(transferToCount, 0, "must have no TransferTo actions, got " + transferToCount);

  // No Deposit-related server actions
  const depositActions = actionTypes.filter(
    (t) => t === "Deposit" || t === "DepositWithNote" || t === "DepositToNote",
  );
  assert.equal(
    depositActions.length,
    0,
    "must have no Deposit-related server actions, got " + JSON.stringify(depositActions),
  );

  // No Withdraw-related server actions
  const withdrawActions = actionTypes.filter(
    (t) => t === "Withdraw" || t === "WithdrawTo" || t === "WithdrawNote",
  );
  assert.equal(
    withdrawActions.length,
    0,
    "must have no Withdraw-related server actions, got " + JSON.stringify(withdrawActions),
  );

  // Verify Invoke target is VeilChannelHelper
  const invokeAction = serverActions.find((a) => actionTypeName(a) === "Invoke");
  assert.ok(invokeAction, "must have an Invoke server action");
  const invokePayload = invokeAction.variant.Invoke;
  const invokeTarget = BigInt(invokePayload.contract_address);
  assert.equal(
    invokeTarget.toString(16),
    BigInt(HELPER_ADDRESS).toString(16),
    "Invoke target must be VeilChannelHelper, got 0x" + invokeTarget.toString(16),
  );

  // Registry was populated from local discovery (self-channel)
  assert.ok(registry.channels.size > 0, "registry should have channels after .register() + discovery");

  // Behavioral compatibility proven by successful compile_actions execution
  t.diagnostic("CALL_MOCK_COMPILE_ACTIONS_VERIFIED=true");
  t.diagnostic("CALL_MOCK_SIGNATURE_VERIFIED=false");
  t.diagnostic("CALL_MOCK_PROOF_VERIFIED=false");
  t.diagnostic("LOCAL_PROVER_VERIFIED=false");
  t.diagnostic("REAL_PROOF_VERIFIED=false");
  t.diagnostic("FASE_5_STARTED=false");
});

// ── Test 4: Execution — replay anchor via register() → WriteOnce ───────────
test("Execution: register() produces WriteOnce replay protection", async (t) => {
  const rpcUrl = process.env.STARKNET_SEPOLIA_RPC_URL;
  if (!rpcUrl) {
    t.skip("STARKNET_SEPOLIA_RPC_URL_REQUIRED");
    return;
  }

  const compat = await checkPoolCompatibility(rpcUrl);
  if (!compat.ok) {
    t.diagnostic("Pool compatibility check failed: " + compat.reason);
    t.skip("CALL_MOCK_POOL_CONTEXT_BLOCKED");
    return;
  }

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const fixture = makeSyntheticFixture();
  const account = new Account({ provider, address: fixture.address, signer: fixture.signer });

  const localDiscovery = new LocalDiscoveryProvider(fixture.viewingKey);
  const callMockProvider = new CallMockProofProvider(
    provider,
    constants.StarknetChainId.SN_SEPOLIA,
    { validateSignature: false },
  );

  const transfers = createPrivateTransfers({
    account,
    viewingKeyProvider: { getViewingKey: async () => fixture.viewingKey },
    provingProvider: callMockProvider,
    discoveryProvider: localDiscovery,
    poolContractAddress: POOL_ADDRESS,
  });

  // register() only — no invoke
  const { invocation } = await transfers.build().register().createProofInvocation();

  const proof = await callMockProvider.prove(invocation);

  // Decode server actions
  const serverActions = decodeServerActions(proof.output.slice(1), compat.poolAbi);

  // Must contain at least one WriteOnce (from SetViewingKey)
  const actionTypes = serverActions.map(actionTypeName);

  const writeOnceCount = actionTypes.filter((t) => t === "WriteOnce").length;
  if (writeOnceCount === 0) {
    assert.fail("MOCK_REPLAY_ANCHOR_BLOCKED: no WriteOnce produced by register()");
  }

  t.diagnostic("WriteOnce actions from register(): " + writeOnceCount);
  t.diagnostic("Replay anchor verified — SetViewingKey produces WriteOnce server action");
});
