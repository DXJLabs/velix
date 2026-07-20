import { hash } from "starknet";
import { describe, it } from "node:test";
import { assert, sdk } from "./production-messaging.helpers.mjs";

const {
  DirectHelperTransport,
  TransactionProverClient,
  TransactionProverError,
  VEIL_DIRECT_ENCRYPTED_LABEL,
  VEIL_PRIVACY_TRANSPORT_STATUS,
  VEIL_TRANSACTION_PROVER_PIN,
  buildCanonicalHelperPayload,
  evaluateTransactionProverCompatibility,
  validateProverEndpoint,
} = sdk;

const POOL = "0x222";
const HELPER = "0x555";
const COMPILE_ACTIONS_SELECTOR = hash.getSelectorFromName("compile_actions");
const PROOF_PROGRAM = "0x5649525455414c5f534e4f53";
const PROOF_OUTPUT = "0x5649525455414c5f534e4f5330";
const SECRET_FIXTURE = "phase4-secret-viewing-material-never-log";

function toHex(value) {
  return `0x${BigInt(value).toString(16)}`;
}

function validEnvelope(overrides = {}) {
  return {
    version: 1,
    algorithm: "A256GCM",
    salt: Buffer.alloc(32, 1).toString("base64url"),
    nonce: Buffer.alloc(12, 2).toString("base64url"),
    ciphertext: Buffer.alloc(64, 3).toString("base64url"),
    ...overrides,
  };
}

function validTransport(overrides = {}) {
  return {
    route: "sdk-direct",
    sdk: { installed: true, version: "0.14.3-rc.2" },
    directAccount: { accountCustody: "integrator-owned", viewingKeyCustody: "integrator-managed" },
    network: { chainId: "SN_SEPOLIA" },
    pool: {
      address: POOL,
      compatibility: "PRIVACY-0.14.3-RC.0",
      compatibleAddresses: [POOL],
    },
    transactionVersion: 3,
    outsideExecutionVersion: "V2",
    prover: { configured: true },
    discovery: { configured: true },
    helper: {
      address: HELPER,
      selector: "privacy_invoke",
      allowedAddresses: [HELPER],
      allowedSelectors: ["privacy_invoke"],
    },
    ...overrides,
  };
}

function validCanonical(overrides = {}) {
  return {
    requestId: "phase4-request-1",
    operation: "message",
    keyDomain: "VEIL_MESSAGE_KEY_V1",
    envelope: validEnvelope(),
    messageLocator: "0x77",
    applicationInvokes: [{ contractAddress: HELPER, selector: "privacy_invoke" }],
    ...overrides,
  };
}

function invokeExternalAction(canonical = validCanonical(), contractAddress = HELPER, calldata) {
  const payload = buildCanonicalHelperPayload(canonical);
  const values = (calldata ?? payload.calldata).map(toHex);
  return ["0x8", contractAddress, toHex(values.length), ...values];
}

function validTransaction(canonical = validCanonical(), overrides = {}) {
  const { actions: suppliedActions, actionCount: suppliedActionCount, ...transactionOverrides } = overrides;
  const actions = suppliedActions ?? invokeExternalAction(canonical);
  const actionCount = suppliedActionCount ?? 1;
  const inner = ["0x123", "0x456", toHex(actionCount), ...actions];
  return {
    type: "INVOKE",
    version: "0x3",
    sender_address: POOL,
    calldata: ["0x1", POOL, COMPILE_ACTIONS_SELECTOR, toHex(inner.length), ...inner],
    signature: ["0x1", "0x2"],
    nonce: "0x0",
    resource_bounds: {
      l1_gas: { max_amount: "0x1", max_price_per_unit: "0x0" },
      l2_gas: { max_amount: "0x5f5e100", max_price_per_unit: "0x0" },
      l1_data_gas: { max_amount: "0x1", max_price_per_unit: "0x0" },
    },
    tip: "0x0",
    paymaster_data: [],
    account_deployment_data: [],
    nonce_data_availability_mode: "L1",
    fee_data_availability_mode: "L1",
    ...transactionOverrides,
  };
}

function validProofResult() {
  const message = {
    from_address: POOL,
    to_address: "0x0",
    payload: ["0xabc", "0x1", "0x2"],
  };
  const messageHash = hash.computePoseidonHashOnElements([
    message.from_address,
    message.to_address,
    message.payload.length,
    ...message.payload,
  ]);
  return {
    proof: Buffer.from("phase4-proof").toString("base64"),
    proof_facts: [
      "0x50524f4f4631",
      PROOF_PROGRAM,
      "0x111",
      PROOF_OUTPUT,
      "0x1",
      "0x2",
      "0x3",
      "0x1",
      messageHash,
    ],
    l2_to_l1_messages: [message],
  };
}

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function rpcFetch(options = {}) {
  const calls = [];
  let healthAttempts = 0;
  let proofAttempts = 0;
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (init.method === "GET") {
      healthAttempts += 1;
      if (options.health) return options.health({ url, init, attempt: healthAttempts });
      return jsonResponse({ status: "ok" });
    }
    const request = JSON.parse(init.body);
    if (request.method === "starknet_specVersion") {
      if (options.spec) return options.spec({ request, init });
      return jsonResponse({ jsonrpc: "2.0", id: request.id, result: VEIL_TRANSACTION_PROVER_PIN.rpcSpecVersion });
    }
    proofAttempts += 1;
    if (options.proof) return options.proof({ request, init, attempt: proofAttempts });
    return jsonResponse({ jsonrpc: "2.0", id: request.id, result: validProofResult() });
  };
  return { fetch, calls, healthAttempts: () => healthAttempts, proofAttempts: () => proofAttempts };
}

function validConfig(overrides = {}) {
  const mocked = overrides.mocked ?? rpcFetch();
  return {
    endpoint: "http://127.0.0.1:3000",
    mode: "local",
    pin: VEIL_TRANSACTION_PROVER_PIN,
    transport: validTransport(),
    fetch: mocked.fetch,
    retry: { healthMaxRetries: 0, proofMaxRetries: 0, baseDelayMs: 0, maximumDelayMs: 0 },
    ...overrides,
    mocked,
  };
}

function createClient(overrides = {}) {
  const config = validConfig(overrides);
  const { mocked, ...clientConfig } = config;
  return { client: new TransactionProverClient(clientConfig), mocked };
}

function validProofInput(canonical = validCanonical(), transaction = validTransaction(canonical)) {
  return { canonical, blockId: "latest", transaction };
}

describe("Phase 4 transaction prover endpoint and compatibility boundary", () => {
  it("requires an explicit well-formed endpoint and HTTPS for non-local mode", () => {
    const cases = [
      ["", "local", "PROVER_ENDPOINT_MISSING"],
      ["not-a-url", "local", "PROVER_ENDPOINT_INVALID"],
      ["http://example.com", "live-unverified", "PROVER_ENDPOINT_INSECURE"],
      ["https://user:password@example.com", "live-unverified", "PROVER_ENDPOINT_INVALID"],
      ["https://127.0.0.1", "live-unverified", "PROVER_ENDPOINT_INVALID"],
      ["https://example.com/rpc", "live-unverified", "PROVER_ENDPOINT_INVALID"],
    ];
    for (const [endpoint, mode, code] of cases) {
      assert.throws(() => validateProverEndpoint(endpoint, mode), (error) => error.code === code);
    }
    assert.equal(validateProverEndpoint("http://localhost:3000", "local"), "http://localhost:3000");
    assert.equal(validateProverEndpoint("https://prover.example", "live-unverified"), "https://prover.example");
  });

  it("fails closed on prover, SDK, Pool, chain, transaction, authorization, and custody mismatches", () => {
    const cases = [
      [{ pin: { ...VEIL_TRANSACTION_PROVER_PIN, imageTag: "latest" } }, "PROVER_VERSION_MISMATCH"],
      [{ transport: validTransport({ sdk: { installed: true, version: "0.14.3-rc.1" } }) }, "SDK_PROVER_MISMATCH"],
      [{ transport: validTransport({ pool: { address: POOL, compatibility: "legacy", compatibleAddresses: [POOL] } }) }, "POOL_PROVER_MISMATCH"],
      [{ transport: validTransport({ network: { chainId: "SN_MAIN" } }) }, "WRONG_CHAIN"],
      [{ transport: validTransport({ transactionVersion: 2 }) }, "TRANSACTION_VERSION_UNSUPPORTED"],
      [{ transport: validTransport({ outsideExecutionVersion: "V1" }) }, "AUTHORIZATION_VERSION_UNSUPPORTED"],
      [{ transport: validTransport({ route: "wallet-api", wallet: { supported: true, apiVersion: "0.10.3" }, directAccount: undefined }) }, "ACCOUNT_CUSTODY_MISMATCH"],
    ];
    for (const [override, code] of cases) {
      const config = validConfig(override);
      const { mocked: _mocked, ...compatibleConfig } = config;
      const snapshot = evaluateTransactionProverCompatibility(compatibleConfig);
      assert.equal(snapshot.reasons.some((reason) => reason.code === code), true);
    }
  });

  it("distinguishes unreachable, unsupported, version-mismatched, degraded, and local-ready health states", async () => {
    const scenarios = [
      [rpcFetch({ health: async () => { throw new Error("offline"); } }), "PROVER_UNREACHABLE"],
      [rpcFetch({ health: async () => jsonResponse({ ready: true }) }), "PROVER_RPC_UNSUPPORTED"],
      [rpcFetch({ spec: async ({ request }) => jsonResponse({ jsonrpc: "2.0", id: request.id, result: "0.10.3-rc.1" }) }), "PROVER_VERSION_MISMATCH"],
      [rpcFetch({ health: async () => jsonResponse({ status: "degraded" }) }), "PROVER_DEGRADED"],
      [rpcFetch(), "PROVER_READY_LOCAL"],
    ];
    for (const [mocked, status] of scenarios) {
      const { client } = createClient({ mocked });
      const health = await client.checkHealth({ requestId: `health-${status.toLowerCase()}` });
      assert.equal(health.status, status);
      assert.equal(health.canonicalPrepared, false);
      assert.equal(health.liveVerified, false);
      assert.equal(health.shieldEnabled, false);
    }
  });

  it("rejects unsupported JSON-RPC methods and schema", async () => {
    const mocked = rpcFetch({
      spec: async ({ request }) => jsonResponse({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: "method missing" },
      }),
    });
    const { client } = createClient({ mocked });
    const health = await client.checkHealth({ requestId: "unsupported-rpc" });
    assert.equal(health.status, "PROVER_RPC_UNSUPPORTED");
    assert.equal(health.reasons[0].code, "PROVER_RPC_UNSUPPORTED");
  });
});

describe("Phase 4 proof request validation", () => {
  it("accepts only an Invoke V3 intent bound to one allowlisted helper payload", async () => {
    const { client } = createClient();
    const result = await client.prove(validProofInput());
    assert.equal(result.status, "LOCAL_PROVER_VERIFIED");
    assert.match(result.requestFingerprint, /^veil-proof-intent-v1:[0-9a-f]{64}$/u);
    assert.equal(result.broadcastEnabled, false);
    assert.equal(result.canonicalPrepared, false);
    assert.equal(result.liveVerified, false);
    assert.equal(result.shieldEnabled, false);
  });

  it("rejects wrong transaction version and malformed invocation calldata before RPC", async () => {
    const { client, mocked } = createClient();
    await assert.rejects(
      () => client.prove(validProofInput(validCanonical(), validTransaction(validCanonical(), { version: "0x2" }))),
      (error) => error.code === "TRANSACTION_VERSION_UNSUPPORTED",
    );
    await assert.rejects(
      () => client.prove(validProofInput(validCanonical(), validTransaction(validCanonical(), { calldata: ["0x1"] }))),
      (error) => error.code === "PROVER_REQUEST_INVALID",
    );
    assert.equal(mocked.calls.length, 0);
  });

  it("rejects arbitrary helpers, selectors, and multiple application invokes", async () => {
    const cases = [
      [validCanonical({ applicationInvokes: [{ contractAddress: "0x666", selector: "privacy_invoke" }] }), "HELPER_TARGET_NOT_ALLOWED"],
      [validCanonical({ applicationInvokes: [{ contractAddress: HELPER, selector: "arbitrary" }] }), "HELPER_SELECTOR_NOT_ALLOWED"],
      [validCanonical({ applicationInvokes: [
        { contractAddress: HELPER, selector: "privacy_invoke" },
        { contractAddress: HELPER, selector: "privacy_invoke" },
      ] }), "MULTIPLE_EXTERNAL_INVOKES"],
    ];
    for (const [canonical, code] of cases) {
      const { client } = createClient();
      await assert.rejects(
        () => client.prove({ canonical, blockId: "latest", transaction: validTransaction() }),
        (error) => error.code === code,
      );
    }
  });

  it("rejects an InvokeExternal target or payload that differs from the validated canonical intent", async () => {
    const canonical = validCanonical();
    const arbitraryTarget = validTransaction(canonical, { actions: invokeExternalAction(canonical, "0x666") });
    const arbitraryPayload = validTransaction(canonical, { actions: invokeExternalAction(canonical, HELPER, ["0x1"]) });
    for (const [transaction, code] of [
      [arbitraryTarget, "HELPER_TARGET_NOT_ALLOWED"],
      [arbitraryPayload, "PROVER_REQUEST_INVALID"],
    ]) {
      const { client } = createClient();
      await assert.rejects(() => client.prove(validProofInput(canonical, transaction)), (error) => error.code === code);
    }
  });

  it("rejects malformed, unknown, oversized, and more-than-64-chunk payloads", async () => {
    const cases = [
      [validCanonical({ envelope: { ...validEnvelope(), extra: true } }), "PAYLOAD_MALFORMED"],
      [validCanonical({ operation: "unknown" }), "PAYLOAD_MALFORMED"],
      [validCanonical({ envelope: validEnvelope({ version: 2 }) }), "PAYLOAD_VERSION_UNSUPPORTED"],
      [validCanonical({ envelope: validEnvelope({ ciphertext: Buffer.alloc(2_100, 7).toString("base64url") }) }), "PAYLOAD_TOO_LARGE"],
    ];
    for (const [canonical, code] of cases) {
      const { client } = createClient();
      await assert.rejects(
        () => client.prove({ canonical, blockId: "latest", transaction: validTransaction() }),
        (error) => error.code === code,
      );
    }
  });

  it("rejects Deposit, Withdraw, Unshield, and missing InvokeExternal intents", async () => {
    const canonical = validCanonical();
    const invoke = invokeExternalAction(canonical);
    const cases = [
      [validTransaction(canonical, { actionCount: 2, actions: ["0x5", "0x1", "0x1", ...invoke] }), "CANONICAL_CAPABILITY_UNAVAILABLE"],
      [validTransaction(canonical, { actionCount: 2, actions: ["0x7", "0x1", "0x1", "0x1", "0x1", ...invoke] }), "UNSHIELD_UNAVAILABLE"],
      [validTransaction(canonical, { actionCount: 1, actions: ["0x0", "0x1"] }), "PROVER_REQUEST_INVALID"],
    ];
    for (const [transaction, code] of cases) {
      const { client } = createClient();
      await assert.rejects(() => client.prove(validProofInput(canonical, transaction)), (error) => error.code === code);
    }
    for (const operation of ["unshield", "withdraw"]) {
      const { client } = createClient();
      await assert.rejects(
        () => client.prove({ canonical: validCanonical({ operation }), blockId: "latest", transaction: validTransaction() }),
        (error) => error.code === "UNSHIELD_UNAVAILABLE",
      );
    }
  });
});

describe("Phase 4 response, retry, cancellation, and privacy hardening", () => {
  it("rejects response ID mismatch, malformed result, and proof facts unrelated to the Pool message", async () => {
    const mutations = [
      ({ request }) => ({ jsonrpc: "2.0", id: `${request.id}-other`, result: validProofResult() }),
      ({ request }) => ({ jsonrpc: "2.0", id: request.id, result: { proof: "bad" } }),
      ({ request }) => {
        const result = validProofResult();
        result.proof_facts[8] = "0x123";
        return { jsonrpc: "2.0", id: request.id, result };
      },
    ];
    for (const mutation of mutations) {
      const mocked = rpcFetch({ proof: async ({ request }) => jsonResponse(mutation({ request })) });
      const { client } = createClient({ mocked });
      await assert.rejects(() => client.prove(validProofInput()), (error) => error.code === "PROVER_RESPONSE_INVALID");
    }
  });

  it("rejects oversized responses before parsing", async () => {
    const mocked = rpcFetch({
      proof: async ({ request }) => jsonResponse(
        { jsonrpc: "2.0", id: request.id, result: validProofResult() },
        200,
        { "content-length": "2048" },
      ),
    });
    const { client } = createClient({
      mocked,
      limits: { maximumResponseBytes: 1024, maximumProofBytes: 1024 },
    });
    await assert.rejects(() => client.prove(validProofInput()), (error) => error.code === "PROVER_RESPONSE_TOO_LARGE");
  });

  it("times out and forwards cancellation without exposing the underlying failure", async () => {
    const hanging = rpcFetch({
      health: async ({ init }) => new Promise((resolve, reject) => {
        void resolve;
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }),
    });
    const timed = createClient({ mocked: hanging, timeouts: { connectionTimeoutMs: 100 }, retry: { healthMaxRetries: 0 } });
    const timeoutHealth = await timed.client.checkHealth({ requestId: "timeout-health" });
    assert.equal(timeoutHealth.reasons[0].code, "PROVER_TIMEOUT");

    const controller = new AbortController();
    controller.abort();
    const cancelled = createClient({ mocked: rpcFetch() });
    const cancelledHealth = await cancelled.client.checkHealth({ requestId: "cancel-health", signal: controller.signal });
    assert.equal(cancelledHealth.reasons[0].code, "PROVER_CANCELLED");
  });

  it("retries transient failures with bounded deterministic backoff and never retries permanent failures", async () => {
    const delays = [];
    const transient = rpcFetch({
      health: async ({ attempt }) => attempt === 1
        ? jsonResponse({ error: "busy" }, 503)
        : jsonResponse({ status: "ok" }),
    });
    const transientClient = createClient({
      mocked: transient,
      retry: { healthMaxRetries: 1, proofMaxRetries: 0, baseDelayMs: 7, maximumDelayMs: 7 },
      sleep: async (delay) => { delays.push(delay); },
    });
    const ready = await transientClient.client.checkHealth({ requestId: "retry-transient" });
    assert.equal(ready.status, "PROVER_READY_LOCAL");
    assert.equal(ready.retryCount, 1);
    assert.deepEqual(delays, [7]);

    const permanent = rpcFetch({ health: async () => jsonResponse({ error: "bad request" }, 400) });
    const permanentClient = createClient({
      mocked: permanent,
      retry: { healthMaxRetries: 3, proofMaxRetries: 0, baseDelayMs: 0, maximumDelayMs: 0 },
    });
    const failed = await permanentClient.client.checkHealth({ requestId: "no-retry-permanent" });
    assert.equal(failed.reasons[0].code, "PROVER_RESPONSE_INVALID");
    assert.equal(permanent.healthAttempts(), 1);
  });

  it("sanitizes errors and emits a closed log schema without secret fixtures", async () => {
    const events = [];
    const mocked = rpcFetch({ proof: async () => { throw new Error(SECRET_FIXTURE); } });
    const { client } = createClient({ mocked, onStatus: (event) => events.push(event) });
    let thrown;
    try {
      await client.prove(validProofInput());
    } catch (error) {
      thrown = error;
    }
    assert.equal(thrown instanceof TransactionProverError, true);
    assert.equal(JSON.stringify(thrown).includes(SECRET_FIXTURE), false);
    assert.equal(JSON.stringify(events).includes(SECRET_FIXTURE), false);
    assert.deepEqual(Object.keys(events.at(-1)).sort(), [
      "chain",
      "durationMs",
      "errorCode",
      "mode",
      "operation",
      "proverVersion",
      "requestId",
      "responseStatus",
      "retryCount",
      "sdkVersion",
    ]);
  });

  it("keeps local proof, broadcast preparation, canonical runtime, and Shield distinct", async () => {
    const { client } = createClient();
    const proof = await client.prove(validProofInput());
    const candidate = client.prepareBroadcastCandidate(proof);
    assert.equal(proof.status, "LOCAL_PROVER_VERIFIED");
    assert.equal(candidate.broadcastEnabled, false);
    assert.equal(candidate.canonicalPrepared, false);
    assert.equal(candidate.liveVerified, false);
    assert.equal(proof.shieldEnabled, false);
  });

  it("does not contain a legacy fallback and preserves the Direct encrypted legacy label", async () => {
    let directFallbackCalls = 0;
    const mocked = rpcFetch({ proof: async () => jsonResponse({ error: "failure" }, 400) });
    const { client } = createClient({ mocked });
    await assert.rejects(() => client.prove(validProofInput()));
    assert.equal(directFallbackCalls, 0);
    assert.equal(VEIL_DIRECT_ENCRYPTED_LABEL, "Direct encrypted");
    assert.equal(VEIL_PRIVACY_TRANSPORT_STATUS.DIRECT_ENCRYPTED_LEGACY, "DIRECT_ENCRYPTED_LEGACY");
    const direct = new DirectHelperTransport({ helperAddress: HELPER, waitForConfirmation: false });
    assert.deepEqual(direct.supportedModes, ["encrypted-direct", "unshield"]);
    void directFallbackCalls;
  });
});
