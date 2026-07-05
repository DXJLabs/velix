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
      why: errorDetails.errorMessage || String(error),
      howToFix: details.howToFix || "Check the preceding VEIL structured logs and retry the failed action.",
      ...errorDetails,
      ...details,
    });
    if (error instanceof Error) console.error(error);
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
    return { rawBody: text.slice(0, 1_000) };
  }
}

function sanitizeLogDetails(details) {
  return Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (/token|secret|authorization/i.test(key)) return [key, "[redacted]"];
        return [key, value];
      }),
  );
}

function serializeError(error) {
  if (!error) return {};
  const cause = error.cause;
  return {
    errorName: error.name,
    errorMessage: error.message || String(error),
    errorStack: error.stack,
    errorCauseName: cause?.name,
    errorCauseMessage: cause?.message || (cause ? String(cause) : undefined),
    errorCauseStack: cause?.stack,
  };
}
