import {
  createHash,
} from "node:crypto";

import type {
  PreparedTransactionProofRequest,
  TransactionProofRequestInput,
} from "#veil-sdk/transaction-prover";

import type {
  ProofPayloadKeyring,
} from "../../config/proof-payload-env.js";

import {
  createProofJobAccessRecord,
  deriveProofJobSubjectHash,
  type ProofIdentityProvider,
} from "../security/proof-job-access.js";

import {
  createQueuedProofJob,
  type ProofJobState,
} from "./proof-job.js";

import {
  encryptProofPayload,
} from "./proof-payload.js";

import {
  createOrGetProofEnqueue,
  type ProofEnqueueRepository,
} from "./proof-enqueue-repository.js";

import {
  parseMessageProofRequest,
} from "./proof-request.js";

const IDEMPOTENCY_KEY_PATTERN =
  /^[A-Za-z0-9._~-]{16,200}$/u;

const PAYLOAD_LIFETIME_MS =
  24 * 60 * 60_000;

export interface ProofRequestPreparer {
  prepareRequest(
    input: TransactionProofRequestInput,
  ): Promise<PreparedTransactionProofRequest>;
}

export interface ProofEnqueueServiceDependencies {
  readonly prover: ProofRequestPreparer;
  readonly repository: ProofEnqueueRepository;
  readonly keyring: ProofPayloadKeyring;
  readonly now?: () => number;
}

export interface AuthenticatedProofEnqueueServiceDependencies
extends ProofEnqueueServiceDependencies {
  readonly accessSecret: Uint8Array;
}

export interface EnqueueMessageProofInput {
  readonly request: unknown;
  readonly idempotencyKey: string;
}

export interface AuthenticatedEnqueueMessageProofInput
extends EnqueueMessageProofInput {
  readonly identityProvider:
    ProofIdentityProvider;

  readonly authenticatedSubject:
    string;
}

export interface EnqueueMessageProofResult {
  readonly schemaVersion:
    "veil-proof-enqueue-v1";

  readonly created: boolean;
  readonly jobId: string;
  readonly state: ProofJobState;
  readonly requestFingerprint: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

interface EnqueueIdentity {
  readonly provider:
    ProofIdentityProvider;

  readonly subject:
    string;

  readonly secret:
    Uint8Array;
}

export class ProofEnqueueServiceError
extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofEnqueueServiceError";

    this.code =
      code;
  }
}

export async function enqueueMessageProof(
  dependencies: ProofEnqueueServiceDependencies,
  input: EnqueueMessageProofInput,
): Promise<EnqueueMessageProofResult> {
  return enqueueMessageProofInternal(
    dependencies,
    input,
  );
}

export async function enqueueAuthenticatedMessageProof(
  dependencies:
    AuthenticatedProofEnqueueServiceDependencies,
  input:
    AuthenticatedEnqueueMessageProofInput,
): Promise<EnqueueMessageProofResult> {
  return enqueueMessageProofInternal(
    dependencies,
    input,
    {
      provider:
        input.identityProvider,

      subject:
        input.authenticatedSubject,

      secret:
        dependencies.accessSecret,
    },
  );
}

async function enqueueMessageProofInternal(
  dependencies: ProofEnqueueServiceDependencies,
  input: EnqueueMessageProofInput,
  identity?: EnqueueIdentity,
): Promise<EnqueueMessageProofResult> {
  const idempotencyKey =
    requireIdempotencyKey(
      input.idempotencyKey,
    );

  const nowMs =
    requireTimestamp(
      dependencies.now?.()
        ?? Date.now(),
    );

  const request =
    parseMessageProofRequest(
      input.request,
    );

  /*
   * Canonical validation and fingerprinting remain owned by the SDK.
   * prepareRequest does not contact the transaction prover.
   */
  const prepared =
    await dependencies.prover
      .prepareRequest(request);

  const idempotencyKeyHash =
    sha256Domain(
      "veil-proof-idempotency-v1",
      idempotencyKey,
    );

  const jobId =
    deterministicReference(
      "job",
      "veil-proof-job-reference-v1",
      idempotencyKeyHash,
      prepared.requestFingerprint,
    );

  const payloadReference =
    deterministicReference(
      "payload",
      "veil-proof-payload-reference-v1",
      idempotencyKeyHash,
      prepared.requestFingerprint,
    );

  const expiresAtMs =
    nowMs + PAYLOAD_LIFETIME_MS;

  const keyVersion =
    dependencies.keyring
      .activeKeyVersion;

  const key =
    dependencies.keyring
      .resolveKey(keyVersion);

  const encryptedPayload = (() => {
    try {
      return encryptProofPayload({
        payloadReference,

        requestFingerprint:
          prepared.requestFingerprint,

        keyVersion,
        key,

        payload: {
          schemaVersion:
            "veil-proof-work-item-v1",

          request,
        },

        nowMs,
        expiresAtMs,
      });
    } finally {
      key.fill(0);
    }
  })();

  const job =
    createQueuedProofJob({
      jobId,

      requestFingerprint:
        prepared.requestFingerprint,

      idempotencyKeyHash,
      payloadReference,
      nowMs,
      maxAttempts: 3,
    });

  const access =
    identity === undefined
      ? undefined
      : createProofJobAccessRecord({
          jobId,

          subjectHash:
            deriveProofJobSubjectHash(
              identity.secret,
              identity.provider,
              identity.subject,
              jobId,
            ),

          createdAtMs:
            nowMs,
        });

  const result =
    await createOrGetProofEnqueue(
      dependencies.repository,
      {
        job,

        payload:
          encryptedPayload,

        ...(access === undefined
          ? {}
          : {
              access,
            }),
      },
    );

  return Object.freeze({
    schemaVersion:
      "veil-proof-enqueue-v1",

    created:
      result.created,

    jobId:
      result.job.jobId,

    state:
      result.job.state,

    requestFingerprint:
      result.job.requestFingerprint,

    createdAtMs:
      result.job.createdAtMs,

    expiresAtMs:
      result.payload.expiresAtMs,
  });
}

function requireIdempotencyKey(
  value: string,
): string {
  if (
    typeof value !== "string"
    || value !== value.trim()
    || !IDEMPOTENCY_KEY_PATTERN.test(value)
  ) {
    throw serviceError(
      "PROOF_IDEMPOTENCY_KEY_INVALID",
      "The proof idempotency key must be a bounded opaque value.",
    );
  }

  return value;
}

function requireTimestamp(
  value: number,
): number {
  if (
    !Number.isSafeInteger(value)
    || value < 0
  ) {
    throw serviceError(
      "PROOF_ENQUEUE_TIME_INVALID",
      "The proof enqueue timestamp is invalid.",
    );
  }

  return value;
}

function deterministicReference(
  prefix: "job" | "payload",
  domain: string,
  idempotencyKeyHash: string,
  requestFingerprint: string,
): string {
  return `${prefix}_${sha256Domain(
    domain,
    idempotencyKeyHash,
    requestFingerprint,
  )}`;
}

function sha256Domain(
  domain: string,
  ...values: readonly string[]
): string {
  return createHash("sha256")
    .update(
      [
        domain,
        ...values,
      ].join("\n"),
      "utf8",
    )
    .digest("hex");
}

function serviceError(
  code: string,
  message: string,
): ProofEnqueueServiceError {
  return new ProofEnqueueServiceError(
    code,
    message,
  );
}
