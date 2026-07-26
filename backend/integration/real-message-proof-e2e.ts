import {
  readFile,
} from "node:fs/promises";

import {
  loadProofAccessEnvironment,
} from "../config/proof-access-env.js";

import {
  loadProofPayloadKeyring,
} from "../config/proof-payload-env.js";

import {
  loadProofQueuePolicy,
} from "../config/proof-queue-env.js";

import {
  loadProofWorkerRuntimePolicy,
} from "../config/proof-worker-env.js";

import {
  enqueueAuthenticatedMessageProof,
} from "../services/prover/proof-enqueue-service.js";

import {
  PostgresProofEnqueueRepository,
} from "../services/prover/postgres-proof-enqueue-repository.js";

import {
  PostgresProofJobRepository,
} from "../services/prover/postgres-proof-job-repository.js";

import {
  PostgresProofPayloadRepository,
} from "../services/prover/postgres-proof-payload-repository.js";

import {
  PostgresProofResultRepository,
} from "../services/prover/postgres-proof-result-repository.js";

import {
  PostgresProofSuccessFinalizer,
} from "../services/prover/postgres-proof-success-finalizer.js";

import {
  createPostgresProvider,
} from "../services/prover/postgres-provider.js";

import {
  createBackendProverClient,
} from "../services/prover/prover-client.js";

import {
  readAuthorizedProofResult,
} from "../services/prover/proof-result-access.js";

import {
  runProofWorkerOnce,
} from "../services/prover/proof-worker.js";

import {
  PostgresProofJobAccessRepository,
} from "../services/security/postgres-proof-job-access-repository.js";

interface Fixture {
  readonly schemaVersion:
    "veil-real-message-proof-fixture-v1";

  readonly idempotencyKey:
    string;

  readonly authenticatedSubject:
    string;

  readonly request:
    unknown;
}

async function main():
  Promise<void> {
  if (
    process.env
      .VEIL_REAL_E2E_ACKNOWLEDGE
      !== "true"
  ) {
    throw new Error(
      "Set VEIL_REAL_E2E_ACKNOWLEDGE=true before running the real message proof integration.",
    );
  }

  const fixturePath =
    process.env
      .VEIL_REAL_MESSAGE_FIXTURE
      ?.trim();

  if (!fixturePath) {
    throw new Error(
      "VEIL_REAL_MESSAGE_FIXTURE must point to a wallet/Official SDK generated JSON fixture.",
    );
  }

  const fixture =
    parseFixture(
      JSON.parse(
        await readFile(
          fixturePath,
          "utf8",
        ),
      ) as unknown,
    );

  const provider =
    createPostgresProvider();

  const queue =
    loadProofQueuePolicy();

  const worker =
    loadProofWorkerRuntimePolicy();

  const keyring =
    loadProofPayloadKeyring();

  const access =
    loadProofAccessEnvironment();

  const jobs =
    new PostgresProofJobRepository(
      provider,
    );

  const payloads =
    new PostgresProofPayloadRepository(
      provider,
    );

  const accessRepository =
    new PostgresProofJobAccessRepository(
      provider,
    );

  const results =
    new PostgresProofResultRepository(
      provider,
    );

  const prover =
    createBackendProverClient();

  const enqueue =
    await enqueueAuthenticatedMessageProof(
      {
        prover,

        repository:
          new PostgresProofEnqueueRepository(
            provider,
            queue.maxQueuedJobs,
          ),

        keyring,

        accessSecret:
          access.hmacSecret,
      },
      {
        request:
          fixture.request,

        idempotencyKey:
          fixture.idempotencyKey,

        identityProvider:
          "privy",

        authenticatedSubject:
          fixture.authenticatedSubject,
      },
    );

  const worked =
    await runProofWorkerOnce(
      {
        jobs,
        payloads,
        prover,

        results:
          new PostgresProofSuccessFinalizer(
            provider,
          ),

        keyring,
      },
      {
        leaseOwnerHash:
          worker.leaseOwnerHash,

        leaseDurationMs:
          worker.leaseDurationMs,

        heartbeatIntervalMs:
          worker.heartbeatIntervalMs,

        maxRunningJobs:
          worker.maxRunningJobs,

        recoveryBatchSize:
          worker.recoveryBatchSize,
      },
    );

  if (
    worked.outcome !== "succeeded"
    || worked.jobId
      !== enqueue.jobId
  ) {
    throw new Error(
      `Real durable message proof did not succeed: ${worked.outcome}`,
    );
  }

  const proof =
    await readAuthorizedProofResult(
      {
        jobs,
        access:
          accessRepository,

        results,
        keyring,

        accessSecret:
          access.hmacSecret,
      },
      {
        identityProvider:
          "privy",

        authenticatedSubject:
          fixture.authenticatedSubject,

        jobId:
          enqueue.jobId,
      },
    );

  console.info(
    JSON.stringify({
      schemaVersion:
        "veil-real-message-proof-e2e-result-v1",

      jobState:
        worked.state,

      proverStatus:
        proof.status,

      proofSizeBytes:
        proof.proofSizeBytes,

      retryCount:
        proof.retryCount,

      broadcastEnabled:
        proof.broadcastEnabled,

      canonicalPrepared:
        proof.canonicalPrepared,

      liveVerified:
        proof.liveVerified,

      shieldEnabled:
        proof.shieldEnabled,
    }),
  );
}

function parseFixture(
  value: unknown,
): Fixture {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    throw new Error(
      "The real message proof fixture must be an object.",
    );
  }

  const record =
    value as
      Record<string, unknown>;

  const keys =
    Object.keys(record);

  if (
    keys.length !== 4
    || keys.some(
      (key) =>
        ![
          "schemaVersion",
          "idempotencyKey",
          "authenticatedSubject",
          "request",
        ].includes(key),
    )
    || record.schemaVersion
      !== "veil-real-message-proof-fixture-v1"
    || typeof record.idempotencyKey
      !== "string"
    || !/^[A-Za-z0-9._~-]{16,200}$/u
      .test(
        record.idempotencyKey,
      )
    || typeof record.authenticatedSubject
      !== "string"
    || record.authenticatedSubject.length
      < 1
    || record.authenticatedSubject.length
      > 512
  ) {
    throw new Error(
      "The real message proof fixture schema is invalid.",
    );
  }

  rejectNamedPrivateMaterial(
    record.request,
  );

  return Object.freeze({
    schemaVersion:
      "veil-real-message-proof-fixture-v1",

    idempotencyKey:
      record.idempotencyKey,

    authenticatedSubject:
      record.authenticatedSubject,

    request:
      record.request,
  });
}

function rejectNamedPrivateMaterial(
  value: unknown,
  depth = 0,
): void {
  if (depth > 24) {
    throw new Error(
      "The real message proof fixture exceeds the JSON depth limit.",
    );
  }

  if (
    Array.isArray(value)
  ) {
    for (
      const item
      of value
    ) {
      rejectNamedPrivateMaterial(
        item,
        depth + 1,
      );
    }

    return;
  }

  if (
    typeof value !== "object"
    || value === null
  ) {
    return;
  }

  for (
    const [key, nested]
    of Object.entries(value)
  ) {
    const normalized =
      key.replace(
        /[^a-z0-9]/giu,
        "",
      ).toLowerCase();

    if (
      [
        "privatekey",
        "viewingkey",
        "mnemonic",
        "seedphrase",
        "plaintext",
        "channelsecret",
        "decryptresult",
      ].includes(
        normalized,
      )
    ) {
      throw new Error(
        `Forbidden private material field: ${key}`,
      );
    }

    rejectNamedPrivateMaterial(
      nested,
      depth + 1,
    );
  }
}

main().catch(
  (error: unknown) => {
    console.error(
      JSON.stringify({
        schemaVersion:
          "veil-real-message-proof-e2e-error-v1",

        errorCode:
          typeof error === "object"
          && error !== null
          && "code" in error
          && typeof error.code
            === "string"
            ? error.code
            : "REAL_MESSAGE_PROOF_E2E_FAILED",
      }),
    );

    process.exitCode =
      1;
  },
);
