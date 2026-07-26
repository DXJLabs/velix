import assert from "node:assert/strict";
import test from "node:test";
import { hash } from "starknet";
import {
  buildCanonicalHelperPayload,
} from "#veil-sdk/canonical-payload";
import {
  VEIL_TRANSACTION_PROVER_PIN,
  type TransactionProofRequestInput,
} from "#veil-sdk/transaction-prover";
import { loadProverEnvironment } from "../config/backend-env.js";
import {
  computePayloadCommitment,
  computeTimelineCommitment,
  verifyPayloadCommitment,
  verifyTimelineCommitment,
} from "../services/discovery/commitment-verifier.js";
import {
  discoverVerifiedTimelineCiphertexts,
} from "../services/discovery/timeline-discovery.js";
import { RpcDiscoveryClient } from "../services/discovery/rpc-discovery.js";
import { createBackendProverClient } from "../services/prover/prover-client.js";
import { parseMessageProofRequest, requestMessageProof } from "../services/prover/proof-request.js";
import {
  enqueueAuthenticatedMessageProof,
  enqueueMessageProof,
} from "../services/prover/proof-enqueue-service.js";
import {
  decryptProofPayload,
  encryptProofPayload,
} from "../services/prover/proof-payload.js";
import {
  claimProofJob,
  createQueuedProofJob,
} from "../services/prover/proof-job.js";
import {
  runProofWorkerOnce,
} from "../services/prover/proof-worker.js";
import type {
  ProofEnqueueInput,
  ProofEnqueueRepository,
} from "../services/prover/proof-enqueue-repository.js";
import { getProverStatus } from "../services/prover/proof-status.js";

/*
 * Test transaction felts must use the canonical lowercase form
 * required by TransactionProverClient: no leading zero after 0x.
 */
const POOL =
  "0x3a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5";

const HELPER =
  "0x52390845931a0c8d4735246d853a1a514c3cbf88cb1714937284814c5e57b23";
const COMPILE_ACTIONS_SELECTOR = hash.getSelectorFromName("compile_actions");
const PROOF_PROGRAM = "0x5649525455414c5f534e4f53";
const PROOF_OUTPUT = "0x5649525455414c5f534e4f5330";

function backendEnv(): NodeJS.ProcessEnv {
  return {
    STARKNET_CHAIN_ID: "SN_SEPOLIA",
    STARKNET_RPC_URL: "https://rpc.example.test",
    VEIL_PRIVACY_POOL_ADDRESS: POOL,
    VEIL_CHANNEL_HELPER_ADDRESS: HELPER,
    VEIL_PROVER_URL: "http://127.0.0.1:3000",
    VEIL_PROVER_MODE: "local",

    VEIL_EXPERIMENTAL_DIRECT_PROVER:
      "true",

    VEIL_DISCOVERY_URL: "http://127.0.0.1:3000/api/indexer/messages",
    VEIL_PROVER_HEALTH_RETRIES: "0",
    VEIL_PROVER_JOB_RETRIES: "0",
    VEIL_PROVER_RETRY_BASE_MS: "0",
    VEIL_PROVER_RETRY_MAX_MS: "0",
  };
}

function validEnvelope() {
  return {
    version: 1,
    algorithm: "A256GCM",
    salt: Buffer.alloc(32, 1).toString("base64url"),
    nonce: Buffer.alloc(12, 2).toString("base64url"),
    ciphertext: Buffer.alloc(64, 3).toString("base64url"),
  };
}

function validCanonical() {
  return {
    messageReference: "message-backend-e2e-1",
    requestId: "backend-e2e-request-1",
    operation: "message",
    keyDomain: "VEIL_MESSAGE_KEY_V1",
    envelope: validEnvelope(),
    messageLocator: "0x77",
    applicationInvokes: [{ contractAddress: HELPER, selector: "privacy_invoke" }],
  };
}

function toHex(value: string | number | bigint): string {
  return `0x${BigInt(value).toString(16)}`;
}

function validTransaction(canonical = validCanonical()) {
  const payload = buildCanonicalHelperPayload(canonical);
  const helperCalldata = payload.calldata.map(toHex);
  const action = ["0x8", HELPER, toHex(helperCalldata.length), ...helperCalldata];
  const inner = ["0x123", "0x456", "0x1", ...action];
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
    proof: Buffer.from("backend-e2e-proof").toString("base64"),
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

function proverFetch(): typeof fetch {
  return async (input, init = {}) => {
    const url = String(input);
    if (init.method === "GET" && url.endsWith("/health")) {
      return jsonResponse({ status: "ok" });
    }
    const request = JSON.parse(String(init.body)) as { id: string; method: string };
    if (request.method === "starknet_specVersion") {
      return jsonResponse({ jsonrpc: "2.0", id: request.id, result: VEIL_TRANSACTION_PROVER_PIN.rpcSpecVersion });
    }
    if (request.method === VEIL_TRANSACTION_PROVER_PIN.rpcMethod) {
      return jsonResponse({ jsonrpc: "2.0", id: request.id, result: validProofResult() });
    }
    return jsonResponse({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "unknown" } });
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test(
  "backend environment fails closed when the experimental direct prover is not acknowledged",
  () => {
    const environment = backendEnv();

    delete environment
      .VEIL_EXPERIMENTAL_DIRECT_PROVER;

    assert.throws(
      () =>
        loadProverEnvironment(
          environment,
        ),

      /experimental/u,
    );
  },
);

test("backend environment fails closed for insecure remote prover endpoints", () => {
  assert.throws(
    () => loadProverEnvironment({
      ...backendEnv(),
      VEIL_PROVER_URL: "http://prover.example.test",
      VEIL_PROVER_MODE: "live-unverified",
    }),
    (error: unknown) => error instanceof Error && error.message.includes("HTTPS"),
  );
});

test("messaging proof boundary reaches the pinned SDK prover client end to end", async () => {
  const client = createBackendProverClient({ env: backendEnv(), fetch: proverFetch() });
  const request: TransactionProofRequestInput = {
    canonical: validCanonical(),
    blockId: "latest",
    transaction: validTransaction(),
  };

  const health = await getProverStatus(client, "backend-e2e-health");
  assert.equal(health.status, "PROVER_READY_LOCAL");
  assert.equal(health.readyToAcceptProofJobs, true);

  const result = await requestMessageProof(client, request);
  assert.equal(result.schemaVersion, "veil-message-proof-v1");
  assert.equal(result.status, "LOCAL_PROVER_VERIFIED");
  assert.match(result.requestFingerprint, /^veil-proof-intent-v1:[0-9a-f]{64}$/u);
  assert.equal(result.broadcastEnabled, false);
  assert.equal(result.canonicalPrepared, false);
  assert.equal(result.liveVerified, false);
  assert.equal(result.shieldEnabled, false);
});

test("proof request rejects private material before contacting the prover", () => {
  assert.throws(
    () => parseMessageProofRequest({
      canonical: validCanonical(),
      blockId: "latest",
      transaction: validTransaction(),
      viewingKey: "never-send-this",
    }),
    /unsupported fields|Private field/u,
  );
});


test(
  "proof request rejects nested private-material aliases",
  () => {
    assert.throws(
      () =>
        parseMessageProofRequest({
          canonical:
            validCanonical(),

          blockId:
            "latest",

          transaction: {
            ...validTransaction(),

            metadata: {
              recipientViewingMaterial:
                "never-send-this",
            },
          },
        }),

      /Private field/u,
    );
  },
);

test(
  "proof request rejects non-message product operations",
  () => {
    const canonical = {
      ...validCanonical(),

      operation:
        "offer",

      keyDomain:
        "VEIL_OFFER_KEY_V1",
    };

    assert.throws(
      () =>
        parseMessageProofRequest({
          canonical,

          blockId:
            "latest",

          transaction:
            validTransaction(
              canonical,
            ),
        }),

      /Only canonical message operations/u,
    );
  },
);

test(
  "proof request rejects unknown canonical envelope fields",
  () => {
    assert.throws(
      () =>
        parseMessageProofRequest({
          canonical: {
            ...validCanonical(),

            envelope: {
              ...validEnvelope(),

              extra:
                "not-allowed",
            },
          },

          blockId:
            "latest",

          transaction:
            validTransaction(),
        }),

      /unknown or missing fields/u,
    );
  },
);

test(
  "proof request requires one exact privacy_invoke application boundary",
  () => {
    assert.throws(
      () =>
        parseMessageProofRequest({
          canonical: {
            ...validCanonical(),

            applicationInvokes: [
              {
                contractAddress:
                  HELPER,

                selector:
                  "invoke",
              },
            ],
          },

          blockId:
            "latest",

          transaction:
            validTransaction(),
        }),

      /privacy_invoke/u,
    );
  },
);

test("transaction status is read through the bounded Starknet RPC boundary", async () => {
  const fetchMock: typeof fetch = async (_input, init = {}) => {
    const request = JSON.parse(String(init.body)) as { id: string; method: string; params: unknown[] };
    assert.equal(request.method, "starknet_getTransactionReceipt");
    return jsonResponse({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        transaction_hash: "0xabc",
        finality_status: "ACCEPTED_ON_L2",
        execution_status: "SUCCEEDED",
        block_number: 123,
        block_hash: "0xdef",
      },
    });
  };
  const rpc = new RpcDiscoveryClient({ rpcUrl: "https://rpc.example.test", fetch: fetchMock });
  const status = await rpc.transactionStatus("0xabc");
  assert.equal(status.finalityStatus, "ACCEPTED_ON_L2");
  assert.equal(status.executionStatus, "SUCCEEDED");
  assert.equal(status.blockNumber, 123);
});

test(
  "RPC chain verification rejects a non-Sepolia endpoint",
  async () => {
    const fetchMock:
      typeof fetch =
      async (_input, init = {}) => {
        const request =
          JSON.parse(
            String(init.body),
          ) as {
            id: string;
            method: string;
          };

        assert.equal(
          request.method,
          "starknet_chainId",
        );

        return jsonResponse({
          jsonrpc: "2.0",
          id: request.id,

          result:
            "0x534e5f4d41494e",
        });
      };

    const rpc =
      new RpcDiscoveryClient({
        rpcUrl:
          "https://rpc.example.test",

        fetch:
          fetchMock,
      });

    await assert.rejects(
      () =>
        rpc.assertChainId(
          "SN_SEPOLIA",
        ),

      /not Starknet Sepolia/u,
    );
  },
);

test("canonical commitment verifier binds locator, chunk count, and ciphertext chunks", () => {
  const input = { messageLocator: "0x77", payloadChunks: ["0x1", "0x2", "0x3"] };
  const commitment = computePayloadCommitment(input);
  const verified = verifyPayloadCommitment({ ...input, claimedCommitment: commitment });
  assert.equal(verified.valid, true);
  assert.equal(verified.chunkCount, 3);
  assert.throws(
    () => verifyPayloadCommitment({ ...input, payloadChunks: ["0x1", "0x2", "0x4"], claimedCommitment: commitment }),
    /does not match/u,
  );
});


test(
  "timeline commitment verifier uses the deployed Helper domain",
  () => {
    const input = {
      conversationTag:
        "0x77",

      eventType:
        "0x2",

      encryptedPayload:
        "0x3",

      payloadChunks: [
        "0x4",
        "0x5",
      ],
    };

    const timelineCommitment =
      computeTimelineCommitment(
        input,
      );

    const verified =
      verifyTimelineCommitment({
        ...input,

        claimedCommitment:
          timelineCommitment,
      });

    assert.equal(
      verified.valid,
      true,
    );

    assert.equal(
      verified.chunkCount,
      2,
    );

    const canonicalCommitment =
      computePayloadCommitment({
        messageLocator:
          input.conversationTag,

        payloadChunks:
          input.payloadChunks,
      });

    assert.notEqual(
      timelineCommitment,
      canonicalCommitment,
    );

    assert.throws(
      () =>
        verifyTimelineCommitment({
          ...input,

          payloadChunks: [
            "0x4",
            "0x6",
          ],

          claimedCommitment:
            timelineCommitment,
        }),

      /does not match/u,
    );
  },
);

function selectorHex(
  name: string,
): string {
  return `0x${BigInt(
    hash.getSelectorFromName(
      name,
    ),
  ).toString(16)}`;
}

function createVerifiedTimelineFixture(
  privacyPoolOrigin:
    "0x0" | "0x1",
) {
  const conversationTag =
    "0x77";

  const eventId =
    "0x1";

  const eventType =
    "0x2";

  const encryptedPayload =
    "0x3";

  const payloadChunks = [
    "0x4",
    "0x5",
  ];

  const payloadHash =
    computeTimelineCommitment({
      conversationTag,
      eventType,
      encryptedPayload,
      payloadChunks,
    });

  return {
    conversationTag,
    eventId,
    eventType,
    encryptedPayload,
    payloadChunks,
    payloadHash,

    rpc: {
      async getEvents() {
        return {
          events: [
            {
              from_address:
                HELPER,

              keys: [
                hash.getSelectorFromName(
                  "TimelineCommitmentStored",
                ),

                conversationTag,
                eventId,
              ],

              data: [
                payloadHash,
              ],

              block_number:
                123,

              block_hash:
                "0xabc",

              transaction_hash:
                "0xdef",

              event_index:
                7,
            },
          ],

          continuationToken:
            null,
        };
      },

      async callContract(
        input: {
          entrypointSelector:
            string;

          calldata:
            readonly string[];
        },
      ): Promise<
        readonly string[]
      > {
        if (
          input.entrypointSelector
          === selectorHex(
            "get_event",
          )
        ) {
          return [
            eventId,
            conversationTag,
            eventType,
            encryptedPayload,
            payloadHash,
            "0x2",
            "0x64",
          ];
        }

        if (
          input.entrypointSelector
          === selectorHex(
            "get_payload_chunk",
          )
        ) {
          const chunkIndex =
            Number(
              BigInt(
                input.calldata[2]
                ?? "0x0",
              ),
            );

          const chunk =
            payloadChunks[
              chunkIndex
            ];

          if (
            chunk === undefined
          ) {
            throw new Error(
              "Unexpected timeline chunk index.",
            );
          }

          return [
            chunk,
          ];
        }

        if (
          input.entrypointSelector
          === selectorHex(
            "is_payload_committed",
          )
        ) {
          return [
            "0x1",
          ];
        }

        if (
          input.entrypointSelector
          === selectorHex(
            "is_privacy_pool_event",
          )
        ) {
          return [
            privacyPoolOrigin,
          ];
        }

        throw new Error(
          "Unexpected Helper reader selector.",
        );
      },
    },
  };
}

test(
  "verified timeline discovery accepts Privacy Pool ciphertext",
  async () => {
    const fixture =
      createVerifiedTimelineFixture(
        "0x1",
      );

    const messages =
      await discoverVerifiedTimelineCiphertexts(
        fixture.rpc,
        {
          helperAddress:
            HELPER,

          conversationTag:
            fixture.conversationTag,

          fromBlock:
            123,

          toBlock:
            123,

          maximumEvents:
            10,
        },
      );

    assert.equal(
      messages.length,
      1,
    );

    const message =
      messages[0];

    assert.ok(message);

    assert.equal(
      message.provenance,
      "privacy-pool",
    );

    assert.equal(
      message.commitmentVerified,
      true,
    );

    assert.equal(
      message.eventId,
      fixture.eventId,
    );

    assert.equal(
      message.conversationTag,
      fixture.conversationTag,
    );

    assert.equal(
      message.payloadHash,
      fixture.payloadHash,
    );

    assert.equal(
      message.blockNumber,
      123,
    );

    assert.equal(
      message.blockHash,
      "0xabc",
    );

    assert.equal(
      message.transactionHash,
      "0xdef",
    );

    assert.equal(
      message.eventIndex,
      7,
    );

    assert.equal(
      message.timestamp,
      100_000,
    );

    assert.deepEqual(
      message.payloadChunks,
      fixture.payloadChunks,
    );
  },
);

test(
  "verified timeline discovery rejects direct Helper events",
  async () => {
    const fixture =
      createVerifiedTimelineFixture(
        "0x0",
      );

    await assert.rejects(
      () =>
        discoverVerifiedTimelineCiphertexts(
          fixture.rpc,
          {
            helperAddress:
              HELPER,

            conversationTag:
              fixture.conversationTag,

            fromBlock:
              123,

            toBlock:
              123,

            maximumEvents:
              10,
          },
        ),

      (
        error: unknown,
      ) =>
        error instanceof Error
        && error.name
          === "TimelineDiscoveryError"
        && "code" in error
        && error.code
          === "TIMELINE_DIRECT_EVENT_FORBIDDEN",
    );
  },
);


test(
  "durable enqueue validates, encrypts, and stores one canonical proof work item",
  async () => {
    const request:
      TransactionProofRequestInput = {
        canonical:
          validCanonical(),

        blockId:
          "latest",

        transaction:
          validTransaction(),
      };

    const stored:
      ProofEnqueueInput[] = [];

    const repository:
      ProofEnqueueRepository = {
        async createOrGet(input) {
          stored.push(input);

          return {
            created:
              true,

            job:
              input.job,

            payload:
              input.payload,
          };
        },
      };

    const key =
      Buffer.alloc(32, 7);

    const client =
      createBackendProverClient({
        env:
          backendEnv(),

        fetch: async () => {
          throw new Error(
            "prepareRequest must not contact the prover.",
          );
        },
      });

    const result =
      await enqueueMessageProof(
        {
          prover:
            client,

          repository,

          keyring: {
            activeKeyVersion:
              "v1",

            resolveKey() {
              return Buffer.from(key);
            },
          },

          now:
            () => 1_000,
        },
        {
          request,

          idempotencyKey:
            "enqueue-message-request-0001",
        },
      );

    assert.equal(
      result.created,
      true,
    );

    assert.equal(
      result.state,
      "queued",
    );

    assert.match(
      result.jobId,
      /^job_[0-9a-f]{64}$/u,
    );

    assert.match(
      result.requestFingerprint,
      /^veil-proof-intent-v1:[0-9a-f]{64}$/u,
    );

    assert.equal(
      stored.length,
      1,
    );

    const persisted =
      stored[0];

    assert.ok(persisted);

    assert.equal(
      persisted.job.payloadReference,
      persisted.payload.payloadReference,
    );

    const decrypted =
      decryptProofPayload(
        persisted.payload,
        key,
        1_001,
      ) as {
        schemaVersion: string;
        request: TransactionProofRequestInput;
      };

    assert.equal(
      decrypted.schemaVersion,
      "veil-proof-work-item-v1",
    );

    assert.deepEqual(
      decrypted.request,
      request,
    );
  },
);


test(
  "durable proof worker decrypts, proves, stores a result reference, and completes the job",
  async () => {
    const request:
      TransactionProofRequestInput = {
        canonical:
          validCanonical(),

        blockId:
          "latest",

        transaction:
          validTransaction(),
      };

    const client =
      createBackendProverClient({
        env:
          backendEnv(),

        fetch:
          proverFetch(),
      });

    const prepared =
      await client.prepareRequest(
        request,
      );

    const key =
      Buffer.alloc(32, 9);

    const payloadReference =
      `payload_${"c".repeat(64)}`;

    const payload =
      encryptProofPayload({
        payloadReference,

        requestFingerprint:
          prepared.requestFingerprint,

        keyVersion:
          "v1",

        key,

        payload: {
          schemaVersion:
            "veil-proof-work-item-v1",

          request,
        },

        nowMs:
          1_000,

        expiresAtMs:
          100_000,
      });

    const leaseOwnerHash =
      "d".repeat(64);

    const queued =
      createQueuedProofJob({
        jobId:
          `job_${"a".repeat(64)}`,

        requestFingerprint:
          prepared.requestFingerprint,

        idempotencyKeyHash:
          "b".repeat(64),

        payloadReference,

        nowMs:
          1_000,

        maxAttempts:
          3,
      });

    const claimed =
      claimProofJob(
        queued,
        {
          leaseOwnerHash,

          nowMs:
            1_000,

          leaseDurationMs:
            10_000,
        },
      );

    let storedResultReference:
      string | null = null;

    const result =
      await runProofWorkerOnce(
        {
          jobs: {
            async createOrGetByIdempotency() {
              throw new Error(
                "not used",
              );
            },

            async getById() {
              return null;
            },

            async getByIdempotencyKeyHash() {
              return null;
            },

            async recoverExpired() {

              return [];

            },


            async claimNextAvailable() {
              return claimed;
            },

            async compareAndSwap(input) {
              assert.equal(
                input.expectedRevision,
                claimed.revision,
              );

              return input.next;
            },
          },

          payloads: {
            async createOrGet() {
              throw new Error(
                "not used",
              );
            },

            async getByReference(reference) {
              assert.equal(
                reference,
                payloadReference,
              );

              return payload;
            },

            async deleteByReference() {
              throw new Error(
                "not used",
              );
            },

            async deleteExpired() {
              throw new Error(
                "not used",
              );
            },
          },

          prover: {
            async prove(input, signal) {
              return client.prove(
                input,
                signal,
              );
            },
          },

          results: {
            async persist(input) {
              assert.equal(
                input.job.jobId,
                claimed.jobId,
              );

              assert.equal(
                input.result.requestFingerprint,
                prepared.requestFingerprint,
              );

              storedResultReference =
                "proof_result_0001";

              return {
                resultReference:
                  storedResultReference,
              };
            },
          },

          keyring: {
            activeKeyVersion:
              "v1",

            resolveKey(version) {
              assert.equal(
                version,
                "v1",
              );

              return Buffer.from(
                key,
              );
            },
          },

          now:
            () => 1_000,
        },
        {
          leaseOwnerHash,

          leaseDurationMs:
            10_000,

          maxRunningJobs:
            1,


          recoveryBatchSize:
            50,
        },
      );

    assert.equal(
      result.outcome,
      "succeeded",
    );

    assert.equal(
      result.state,
      "succeeded",
    );

    assert.equal(
      result.attempts,
      1,
    );

    assert.equal(
      storedResultReference,
      "proof_result_0001",
    );
  },
);


test(
  "authenticated durable enqueue stores only a job-scoped identity hash",
  async () => {
    const request:
      TransactionProofRequestInput = {
        canonical:
          validCanonical(),

        blockId:
          "latest",

        transaction:
          validTransaction(),
      };

    const stored:
      ProofEnqueueInput[] = [];

    const repository:
      ProofEnqueueRepository = {
        async createOrGet(input) {
          stored.push(input);

          return {
            created:
              true,

            job:
              input.job,

            payload:
              input.payload,

            ...(input.access === undefined
              ? {}
              : {
                  access:
                    input.access,
                }),
          };
        },
      };

    const key =
      Buffer.alloc(
        32,
        7,
      );

    const accessSecret =
      Buffer.alloc(
        32,
        8,
      );

    const client =
      createBackendProverClient({
        env:
          backendEnv(),

        fetch: async () => {
          throw new Error(
            "prepareRequest must not contact the prover.",
          );
        },
      });

    const authenticatedSubject =
      "did:privy:user-private-001";

    const result =
      await enqueueAuthenticatedMessageProof(
        {
          prover:
            client,

          repository,

          keyring: {
            activeKeyVersion:
              "v1",

            resolveKey() {
              return Buffer.from(
                key,
              );
            },
          },

          accessSecret,

          now:
            () => 1_000,
        },
        {
          request,

          idempotencyKey:
            "authenticated-message-request-0001",

          identityProvider:
            "privy",

          authenticatedSubject,
        },
      );

    assert.equal(
      result.state,
      "queued",
    );

    const persisted =
      stored[0];

    assert.ok(persisted);
    assert.ok(
      persisted.access,
    );

    assert.equal(
      persisted.access.jobId,
      result.jobId,
    );

    assert.match(
      persisted.access.subjectHash,
      /^[0-9a-f]{64}$/u,
    );

    const serialized =
      JSON.stringify(
        persisted.access,
      );

    assert.equal(
      serialized.includes(
        authenticatedSubject,
      ),
      false,
    );

    assert.equal(
      serialized.includes(
        "requestFingerprint",
      ),
      false,
    );

    assert.equal(
      serialized.includes(
        "payloadReference",
      ),
      false,
    );
  },
);
