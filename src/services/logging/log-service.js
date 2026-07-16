export function createVeilLogger({ debugLogsEnabled, dev }) {
  function shouldEmitVeilLog(level) {
    if (level === "error") return true;
    return debugLogsEnabled || dev;
  }

  function veilLog(level, event, details = {}) {
    if (!shouldEmitVeilLog(level)) return;
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...sanitizeLogDetails(details),
    };
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    console[method](JSON.stringify(payload));
  }

  function veilError(event, error, details = {}) {
    const errorDetails = serializeError(error);
    veilLog("error", event, {
      where: details.where || "frontend",
      why: details.why || "The requested operation failed.",
      howToFix: details.howToFix || "Check the preceding VEIL structured logs and retry the failed action.",
      ...errorDetails,
      ...details,
    });
  }

  function tracePrivyStarkZap(traceId, step, details = {}) {
    veilLog("info", `trace.privy_starkzap.${step}`, {
      traceId,
      step,
      ...details,
    });
  }

  return {
    veilLog,
    veilError,
    tracePrivyStarkZap,
    createTraceId,
    readResponsePayload,
  };
}

export function createTraceId(scope) {
  return `${scope}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

export async function readResponsePayload(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {
      code: "NON_JSON_RESPONSE",
      bodyBytes: new TextEncoder().encode(text).byteLength,
    };
  }
}

const SENSITIVE_LOG_KEY = /(?:authorization|cookie|token|secret|private.?key|signing.?key|viewing.?key|channel.?key|claim|registry|nullifier|note|private.?balance|proof|witness|calldata|signature|plaintext|decrypted|message|memo|terms|raw.?body|response.?body|payload|ciphertext)/i;

export function sanitizeLogDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};

  return Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .slice(0, 50)
      .map(([key, value]) => [safeLogKey(key), sanitizeForLog(value, key)]),
  );
}

export function sanitizeForLog(value, key = "", depth = 0, seen = new WeakSet()) {
  if (SENSITIVE_LOG_KEY.test(key)) return "[redacted]";
  if (value === null || value === undefined) return value;
  if (depth > 5) return "[truncated]";
  if (typeof value === "string") return sanitizeLogString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;

  if (value instanceof Error) {
    return {
      name: safeLogLabel(value.name, "Error"),
      code: safeLogLabel(value.code, undefined),
      causeName: safeLogLabel(value.cause?.name, undefined),
      causeCode: safeLogLabel(value.cause?.code, undefined),
    };
  }

  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);

    if (Array.isArray(value)) {
      return value
        .slice(0, 25)
        .map((item) => sanitizeForLog(item, "arrayItem", depth + 1, seen));
    }

    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([nestedKey, nestedValue]) => [
          safeLogKey(nestedKey),
          sanitizeForLog(nestedValue, nestedKey, depth + 1, seen),
        ]),
    );
  }

  return "[unsupported]";
}

function serializeError(error) {
  if (!error) return {};
  const cause = error.cause;
  return {
    errorName: safeLogLabel(error.name, "Error"),
    errorCode: safeLogLabel(error.code, undefined),
    errorCauseName: safeLogLabel(cause?.name, undefined),
    errorCauseCode: safeLogLabel(cause?.code, undefined),
  };
}

function sanitizeLogString(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/([?&](?:token|secret|key|proof|signature|authorization)=)[^&#\s]+/gi, "$1[redacted]")
    .replace(/(["']?(?:token|secret|privateKey|viewingKey|claimSecret|proof|signature)["']?\s*[:=]\s*["']?)[^,"'\s}]+/gi, "$1[redacted]")
    .slice(0, 512);
}

function safeLogKey(value) {
  return safeLogLabel(value, "field");
}

function safeLogLabel(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim();
  return /^[A-Za-z0-9._:/-]{1,128}$/.test(normalized) ? normalized : fallback;
}
