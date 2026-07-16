import assert from "node:assert/strict";
import test from "node:test";

import {
  createVeilLogger,
  readResponsePayload,
  sanitizeForLog,
} from "../src/services/logging/log-service.js";

test("frontend structured logs recursively redact private material", () => {
  const marker = "must-never-reach-console";
  const nested = {
    publicStatus: "unavailable",
    child: {
      viewingKey: marker,
      notes: [marker],
      calldata: [marker],
      paymentMemo: marker,
      registry: { entry: marker },
    },
  };
  nested.circular = nested;

  const sanitized = sanitizeForLog(nested);
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, new RegExp(marker));
  assert.match(serialized, /\[redacted\]/);
  assert.match(serialized, /\[circular\]/);
});

test("veilError emits only one sanitized JSON record without raw Error stacks", () => {
  const marker = "claim-secret-marker";
  const lines = [];
  const originalError = console.error;
  console.error = (line) => lines.push(String(line));

  try {
    const logger = createVeilLogger({ debugLogsEnabled: false, dev: false });
    const error = new Error(`claimSecret=${marker}`);
    error.code = "SUBMISSION_FAILED";
    error.cause = new Error(`memo=${marker}`);
    logger.veilError("privacy.submit.failed", error, {
      where: "submitPrivateTransfer",
      payload: { plaintext: marker },
      howToFix: "Rebuild the proof and retry.",
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0], new RegExp(marker));
  assert.doesNotMatch(lines[0], /errorStack|\n\s+at /);
  assert.match(lines[0], /SUBMISSION_FAILED/);
});

test("non-JSON response parsing never returns the raw response body", async () => {
  const marker = "server-secret-marker";
  const response = new Response(`privateKey=${marker}`, {
    headers: { "content-type": "text/plain" },
  });

  const parsed = await readResponsePayload(response);
  assert.equal(parsed.code, "NON_JSON_RESPONSE");
  assert.equal(typeof parsed.bodyBytes, "number");
  assert.doesNotMatch(JSON.stringify(parsed), new RegExp(marker));
});
