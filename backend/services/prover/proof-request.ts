
import {
  buildCanonicalHelperPayload,
  VEIL_CANONICAL_OPERATION_DOMAINS,
} from "#veil-sdk/canonical-payload";
import {
  VeilPrivacyError,
} from "#veil-sdk/errors";
import type {
  TransactionProofRequestInput,
  TransactionProofResult,
  TransactionProverClient,
} from "#veil-sdk/transaction-prover";

const TOP_LEVEL_FIELDS =
  new Set([
    "canonical",
    "blockId",
    "transaction",
  ]);

const CANONICAL_FIELDS =
  new Set([
    "messageReference",
    "requestId",
    "operation",
    "keyDomain",
    "envelope",
    "messageLocator",
    "claimedCommitment",
    "applicationInvokes",
  ]);

const APPLICATION_INVOKE_FIELDS =
  new Set([
    "contractAddress",
    "selector",
  ]);

const FORBIDDEN_PRIVATE_FIELDS =
  new Set([
    "privatekey",
    "accountprivatekey",
    "walletprivatekey",
    "viewingkey",
    "viewingprivatekey",
    "channelkey",
    "channelsecret",
    "sharedsecret",
    "encryptionkey",
    "decryptionkey",
    "mnemonic",
    "seedphrase",
    "secretkey",
    "accountsecret",
    "walletsecret",
    "claimsecret",
    "privatematerial",
    "viewingmaterial",
    "recipientviewingmaterial",
    "witness",
    "plaintext",
    "decryptedmessage",
    "decryptedpayload",
    "decryptedtext",
    "contactname",
    "roomtitle",
    "memotext",
    "offerterms",
  ]);

const FORBIDDEN_PRIVATE_SUFFIX =
  /(?:privatekey|viewingkey|channelkey|channelsecret|sharedsecret|secretkey|seedphrase|plaintext|viewingmaterial|privatematerial|decryptedmessage|decryptedpayload|decryptedtext)$/u;

const MAX_OBJECT_DEPTH = 24;
const MAX_NODE_COUNT = 20_000;
const FELT_LIMIT = 1n << 251n;

export interface MessageProofResponse {
  schemaVersion:
    "veil-message-proof-v1";

  status:
    TransactionProofResult["status"];

  requestId: string;

  operation:
    TransactionProofResult["operation"];

  requestFingerprint: string;
  proof: string;
  proofFacts: readonly string[];

  l2ToL1Messages:
    TransactionProofResult[
      "l2ToL1Messages"
    ];

  proofSizeBytes: number;
  retryCount: number;
  broadcastEnabled: false;
  canonicalPrepared: false;
  liveVerified: false;
  shieldEnabled: false;
}

export function parseMessageProofRequest(
  value: unknown,
): TransactionProofRequestInput {
  /*
   * Scan the complete JSON graph before structural parsing so nested
   * private material is rejected before the prover client is created
   * or contacted.
   */
  assertBoundedObjectGraph(value);

  const body =
    requirePlainRecord(
      value,
      "request body",
    );

  assertOnlyFields(
    body,
    TOP_LEVEL_FIELDS,
    "request body",
  );

  const canonical =
    requirePlainRecord(
      body.canonical,
      "canonical",
    );

  assertOnlyFields(
    canonical,
    CANONICAL_FIELDS,
    "canonical",
  );

  requireOpaqueIdentifier(
    canonical.requestId,
    "canonical.requestId",
    1,
    64,
  );

  requireOpaqueIdentifier(
    canonical.messageReference,
    "canonical.messageReference",
    1,
    128,
  );

  const operation =
    requireExactString(
      canonical.operation,
      "message",
      "Only canonical message operations are accepted by this backend boundary.",
    );

  const keyDomain =
    requireExactString(
      canonical.keyDomain,
      VEIL_CANONICAL_OPERATION_DOMAINS
        .message,
      "The canonical message key domain is invalid.",
    );

  const messageLocator =
    requireNonzeroFelt(
      canonical.messageLocator,
      "canonical.messageLocator",
    );

  const claimedCommitment =
    canonical.claimedCommitment
      === undefined
      ? undefined
      : requireNonzeroFelt(
          canonical.claimedCommitment,
          "canonical.claimedCommitment",
        );

  const applicationInvokes =
    canonical.applicationInvokes;

  if (
    !Array.isArray(applicationInvokes)
    || applicationInvokes.length !== 1
  ) {
    throw invalidRequest(
      "canonical.applicationInvokes must contain exactly one helper invocation.",
    );
  }

  const invoke =
    requirePlainRecord(
      applicationInvokes[0],
      "canonical.applicationInvokes[0]",
    );

  assertOnlyFields(
    invoke,
    APPLICATION_INVOKE_FIELDS,
    "canonical.applicationInvokes[0]",
  );

  requireNonzeroFelt(
    invoke.contractAddress,
    "canonical.applicationInvokes[0].contractAddress",
  );

  requireExactString(
    invoke.selector,
    "privacy_invoke",
    "The canonical application invocation must use privacy_invoke.",
  );

  /*
   * Delegate envelope serialization, AES-GCM envelope validation,
   * key-domain validation, chunk limits, locator normalization, and
   * claimed-commitment verification to the canonical SDK.
   */
  buildCanonicalHelperPayload({
    operation,
    keyDomain,
    envelope:
      canonical.envelope,

    messageLocator,

    ...(claimedCommitment === undefined
      ? {}
      : {
          claimedCommitment,
        }),
  });

  if (body.blockId === undefined) {
    throw invalidRequest(
      "blockId is required.",
    );
  }

  requirePlainRecord(
    body.transaction,
    "transaction",
  );

  /*
   * Invoke V3 parsing and canonical transaction-intent validation are
   * intentionally left to TransactionProverClient. The backend must
   * not maintain a second implementation of official transaction
   * serialization or proof-intent decoding.
   */
  return body as unknown as TransactionProofRequestInput;
}

export async function requestMessageProof(
  client: TransactionProverClient,
  value: unknown,
  signal?: AbortSignal,
): Promise<MessageProofResponse> {
  const parsed =
    parseMessageProofRequest(value);

  const result =
    await client.prove(
      parsed,
      signal,
    );

  return Object.freeze({
    schemaVersion:
      "veil-message-proof-v1",

    status:
      result.status,

    requestId:
      result.requestId,

    operation:
      result.operation,

    requestFingerprint:
      result.requestFingerprint,

    proof:
      result.proof,

    proofFacts:
      result.proofFacts,

    l2ToL1Messages:
      result.l2ToL1Messages,

    proofSizeBytes:
      result.proofSizeBytes,

    retryCount:
      result.retryCount,

    broadcastEnabled:
      result.broadcastEnabled,

    canonicalPrepared:
      result.canonicalPrepared,

    liveVerified:
      result.liveVerified,

    shieldEnabled:
      result.shieldEnabled,
  });
}

function assertBoundedObjectGraph(
  value: unknown,
): void {
  const stack:
    Array<{
      value: unknown;
      depth: number;
    }> = [
      {
        value,
        depth: 0,
      },
    ];

  let nodes = 0;

  while (stack.length > 0) {
    const current =
      stack.pop();

    if (!current) {
      break;
    }

    nodes += 1;

    if (
      nodes > MAX_NODE_COUNT
      || current.depth
        > MAX_OBJECT_DEPTH
    ) {
      throw invalidRequest(
        "The request JSON exceeds the bounded object graph.",
      );
    }

    if (
      Array.isArray(
        current.value,
      )
    ) {
      for (
        const item
        of current.value
      ) {
        stack.push({
          value: item,
          depth:
            current.depth + 1,
        });
      }

      continue;
    }

    if (
      !isPlainRecord(
        current.value,
      )
    ) {
      continue;
    }

    for (
      const [
        key,
        item,
      ]
      of Object.entries(
        current.value,
      )
    ) {
      const normalizedKey =
        normalizeFieldName(key);

      if (
        isForbiddenPrivateField(
          normalizedKey,
        )
      ) {
        throw invalidRequest(
          `Private field ${key} is forbidden at the backend boundary.`,
        );
      }

      stack.push({
        value: item,
        depth:
          current.depth + 1,
      });
    }
  }
}

function isForbiddenPrivateField(
  normalizedKey: string,
): boolean {
  return FORBIDDEN_PRIVATE_FIELDS
    .has(normalizedKey)
    || FORBIDDEN_PRIVATE_SUFFIX
      .test(normalizedKey);
}

function normalizeFieldName(
  value: string,
): string {
  return value
    .replace(
      /[^a-z0-9]/giu,
      "",
    )
    .toLowerCase();
}

function requirePlainRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw invalidRequest(
      `${label} must be a plain JSON object.`,
    );
  }

  return value;
}

function assertOnlyFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  const unknownFields =
    Object.keys(value)
      .filter(
        (key) =>
          !allowed.has(key),
      );

  if (
    unknownFields.length > 0
  ) {
    throw invalidRequest(
      `${label} contains unsupported fields.`,
    );
  }
}

function requireOpaqueIdentifier(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): string {
  if (
    typeof value !== "string"
    || value.length < minimum
    || value.length > maximum
    || !/^[A-Za-z0-9_-]+$/u
      .test(value)
  ) {
    throw invalidRequest(
      `${label} must be a bounded opaque identifier.`,
    );
  }

  return value;
}

function requireExactString<
  T extends string,
>(
  value: unknown,
  expected: T,
  message: string,
): T {
  if (value !== expected) {
    throw invalidRequest(message);
  }

  return expected;
}

function requireNonzeroFelt(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string"
    || !/^(?:0x[0-9a-fA-F]+|[0-9]+)$/u
      .test(value.trim())
  ) {
    throw invalidRequest(
      `${label} must be a Starknet felt.`,
    );
  }

  let parsed: bigint;

  try {
    parsed =
      BigInt(value.trim());
  } catch {
    throw invalidRequest(
      `${label} must be a Starknet felt.`,
    );
  }

  if (
    parsed <= 0n
    || parsed >= FELT_LIMIT
  ) {
    throw invalidRequest(
      `${label} must be a nonzero Starknet felt.`,
    );
  }

  return `0x${parsed.toString(16)}`;
}

function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
  ) {
    return false;
  }

  const prototype =
    Object.getPrototypeOf(value);

  return prototype
    === Object.prototype
    || prototype === null;
}

function invalidRequest(
  message: string,
): VeilPrivacyError {
  return new VeilPrivacyError(
    "PROVER_REQUEST_INVALID",
    message,
  );
}
