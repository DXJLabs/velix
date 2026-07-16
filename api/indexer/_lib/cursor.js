import crypto from "node:crypto";

import { ApiError } from "../../_lib/privy.js";

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 2_048;

export function indexerBindingHash({ chainId, helperAddress, conversationTag }) {
  return crypto
    .createHash("sha256")
    .update(`${chainId}|${helperAddress}|${conversationTag}`)
    .digest("base64url");
}

export function encodeIndexerCursor(state, secret, bindingHash) {
  const signingKey = cursorSigningKey(secret);
  const payload = {
    v: CURSOR_VERSION,
    b: bindingHash,
    n: state.nextFromBlock,
    a: state.anchorBlock ?? null,
    h: state.anchorHash ?? null,
  };
  validateCursorPayload(payload, "cursor");

  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", signingKey).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function decodeIndexerCursor(cursor, secret, expectedBindingHash, context) {
  if (typeof cursor !== "string" || cursor.length < 10 || cursor.length > MAX_CURSOR_LENGTH) {
    throw invalidCursor(context);
  }

  const [encoded, signature, extra] = cursor.split(".");
  if (!encoded || !signature || extra !== undefined) throw invalidCursor(context);

  const signingKey = cursorSigningKey(secret, context);
  const expectedSignature = crypto.createHmac("sha256", signingKey).update(encoded).digest();
  let suppliedSignature;
  try {
    suppliedSignature = Buffer.from(signature, "base64url");
  } catch {
    throw invalidCursor(context);
  }
  if (
    suppliedSignature.length !== expectedSignature.length
    || !crypto.timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw invalidCursor(context);
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw invalidCursor(context);
  }
  validateCursorPayload(payload, context?.route || "cursor", context);
  if (payload.b !== expectedBindingHash) {
    throw new ApiError(
      400,
      "INDEXER_CURSOR_SCOPE_MISMATCH",
      context?.route || "cursor",
      "The indexer cursor belongs to a different chain, helper, or conversation tag.",
      "Discard the cursor and start a fresh bounded scan for this conversation tag.",
    );
  }

  return {
    nextFromBlock: payload.n,
    anchorBlock: payload.a,
    anchorHash: payload.h,
  };
}

function cursorSigningKey(secret, context) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new ApiError(
      503,
      "INDEXER_CURSOR_SECRET_MISSING",
      context?.route || "/api/indexer/messages",
      "The indexer cursor signing key is not configured securely.",
      "Set VEIL_INDEXER_CURSOR_SECRET to an independent random value of at least 32 bytes.",
    );
  }
  return secret;
}

function validateCursorPayload(payload, where, context) {
  const exactKeys = ["a", "b", "h", "n", "v"];
  if (
    !payload
    || typeof payload !== "object"
    || Array.isArray(payload)
    || Object.keys(payload).sort().join(",") !== exactKeys.join(",")
    || payload.v !== CURSOR_VERSION
    || typeof payload.b !== "string"
    || !/^[A-Za-z0-9_-]{43}$/.test(payload.b)
    || !Number.isSafeInteger(payload.n)
    || payload.n < 0
    || !(payload.a === null || (Number.isSafeInteger(payload.a) && payload.a >= 0))
    || !(payload.h === null || (typeof payload.h === "string" && /^0x[0-9a-f]{1,64}$/.test(payload.h)))
    || ((payload.a === null) !== (payload.h === null))
  ) {
    throw invalidCursor(context || { route: where });
  }
}

function invalidCursor(context) {
  return new ApiError(
    400,
    "INDEXER_CURSOR_INVALID",
    context?.route || "/api/indexer/messages",
    "The indexer cursor is invalid, expired, or has been modified.",
    "Discard the cursor and start a fresh bounded scan for the same opaque conversation tag.",
  );
}
