import {
  VeilPrivacyError,
} from "#veil-sdk/errors";
import type {
  TransactionProofRequestInput,
  TransactionProofResult,
  TransactionProverClient,
} from "#veil-sdk/transaction-prover";

const TOP_LEVEL_FIELDS = new Set(["canonical", "blockId", "transaction"]);
const CANONICAL_FIELDS = new Set([
  "messageReference",
  "requestId",
  "operation",
  "keyDomain",
  "envelope",
  "messageLocator",
  "claimedCommitment",
  "applicationInvokes",
]);
const FORBIDDEN_PRIVATE_FIELDS = new Set([
  "privatekey",
  "viewingkey",
  "channelkey",
  "plaintext",
  "mnemonic",
  "seedphrase",
  "secretkey",
  "claimsecret",
]);
const MAX_OBJECT_DEPTH = 24;
const MAX_NODE_COUNT = 20_000;

export interface MessageProofResponse {
  schemaVersion: "veil-message-proof-v1";
  status: TransactionProofResult["status"];
  requestId: string;
  operation: TransactionProofResult["operation"];
  requestFingerprint: string;
  proof: string;
  proofFacts: readonly string[];
  l2ToL1Messages: TransactionProofResult["l2ToL1Messages"];
  proofSizeBytes: number;
  retryCount: number;
  broadcastEnabled: false;
  canonicalPrepared: false;
  liveVerified: false;
  shieldEnabled: false;
}

export function parseMessageProofRequest(value: unknown): TransactionProofRequestInput {
  assertBoundedObjectGraph(value);
  const body = requirePlainRecord(value, "request body");
  assertOnlyFields(body, TOP_LEVEL_FIELDS, "request body");

  const canonical = requirePlainRecord(body.canonical, "canonical");
  assertOnlyFields(canonical, CANONICAL_FIELDS, "canonical");
  requireBoundedString(canonical.requestId, "canonical.requestId", 1, 128);
  requireBoundedString(canonical.messageReference, "canonical.messageReference", 1, 256);
  requireBoundedString(canonical.operation, "canonical.operation", 1, 64);
  requireBoundedString(canonical.keyDomain, "canonical.keyDomain", 1, 64);
  requirePlainRecord(canonical.envelope, "canonical.envelope");
  if (!Array.isArray(canonical.applicationInvokes) || canonical.applicationInvokes.length !== 1) {
    throw invalidRequest("canonical.applicationInvokes must contain exactly one helper invocation.");
  }
  requirePlainRecord(body.transaction, "transaction");
  if (body.blockId === undefined) throw invalidRequest("blockId is required.");

  return body as unknown as TransactionProofRequestInput;
}

export async function requestMessageProof(
  client: TransactionProverClient,
  value: unknown,
  signal?: AbortSignal,
): Promise<MessageProofResponse> {
  const result = await client.prove(parseMessageProofRequest(value), signal);
  return Object.freeze({
    schemaVersion: "veil-message-proof-v1",
    status: result.status,
    requestId: result.requestId,
    operation: result.operation,
    requestFingerprint: result.requestFingerprint,
    proof: result.proof,
    proofFacts: result.proofFacts,
    l2ToL1Messages: result.l2ToL1Messages,
    proofSizeBytes: result.proofSizeBytes,
    retryCount: result.retryCount,
    broadcastEnabled: result.broadcastEnabled,
    canonicalPrepared: result.canonicalPrepared,
    liveVerified: result.liveVerified,
    shieldEnabled: result.shieldEnabled,
  });
}

function assertBoundedObjectGraph(value: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > MAX_NODE_COUNT || current.depth > MAX_OBJECT_DEPTH) {
      throw invalidRequest("The request JSON exceeds the bounded object graph.");
    }
    if (Array.isArray(current.value)) {
      for (const item of current.value) stack.push({ value: item, depth: current.depth + 1 });
      continue;
    }
    if (!isPlainRecord(current.value)) continue;
    for (const [key, item] of Object.entries(current.value)) {
      const normalizedKey = key.replace(/[^a-z0-9]/giu, "").toLowerCase();
      if (FORBIDDEN_PRIVATE_FIELDS.has(normalizedKey)) {
        throw invalidRequest(`Private field ${key} is forbidden at the backend boundary.`);
      }
      stack.push({ value: item, depth: current.depth + 1 });
    }
  }
}

function requirePlainRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainRecord(value)) throw invalidRequest(`${label} must be a plain JSON object.`);
  return value;
}

function assertOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw invalidRequest(`${label} contains unsupported fields.`);
}

function requireBoundedString(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    throw invalidRequest(`${label} must be a bounded string.`);
  }
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalidRequest(message: string): VeilPrivacyError {
  return new VeilPrivacyError("PROVER_REQUEST_INVALID", message);
}
