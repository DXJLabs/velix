import assert from "node:assert/strict";
import test from "node:test";

import {
  enforceDistributedRateLimit,
} from "../_lib/distributed-rate-limit.js";

const CONTEXT = {
  route:
    "/api/messaging/prepare",

  requestId:
    "rate-limit-test",
};

function createResponse() {
  const headers =
    new Map();

  return {
    headers,

    setHeader(name, value) {
      headers.set(
        String(name).toLowerCase(),
        String(value),
      );
    },
  };
}

test(
  "distributed API limiter hashes identity and permits an allowed request",
  async () => {
    const previousSecret =
      process.env
        .VEIL_RATE_LIMIT_SECRET;

    process.env
      .VEIL_RATE_LIMIT_SECRET =
        "test-rate-limit-secret-that-is-at-least-32-bytes";

    try {
      let received;

      const response =
        createResponse();

      const result =
        await enforceDistributedRateLimit(
          {
            headers: {
              "x-forwarded-for":
                "192.0.2.10",
            },
          },
          response,
          CONTEXT,
          {
            scope:
              "api:messaging:prepare",

            limit:
              3,

            windowMs:
              60_000,

            nowMs:
              1_000,

            repository: {
              async consume(input) {
                received =
                  input;

                return {
                  allowed:
                    true,

                  count:
                    1,

                  limit:
                    3,

                  remaining:
                    2,

                  resetAtMs:
                    60_000,
                };
              },

              async deleteExpired() {
                throw new Error(
                  "not used",
                );
              },
            },
          },
        );

      assert.equal(
        result.allowed,
        true,
      );

      assert.match(
        received.identityHash,
        /^[0-9a-f]{64}$/u,
      );

      assert.notEqual(
        received.identityHash,
        "192.0.2.10",
      );

      assert.equal(
        response.headers.get(
          "x-ratelimit-remaining",
        ),
        "2",
      );
    } finally {
      restoreSecret(
        previousSecret,
      );
    }
  },
);

test(
  "distributed API limiter returns 429 with retry headers",
  async () => {
    const previousSecret =
      process.env
        .VEIL_RATE_LIMIT_SECRET;

    process.env
      .VEIL_RATE_LIMIT_SECRET =
        "test-rate-limit-secret-that-is-at-least-32-bytes";

    try {
      const response =
        createResponse();

      await assert.rejects(
        () =>
          enforceDistributedRateLimit(
            {
              headers: {
                "x-forwarded-for":
                  "192.0.2.11",
              },
            },
            response,
            CONTEXT,
            {
              scope:
                "api:messaging:prepare",

              limit:
                3,

              windowMs:
                60_000,

              nowMs:
                1_000,

              repository: {
                async consume() {
                  return {
                    allowed:
                      false,

                    count:
                      4,

                    limit:
                      3,

                    remaining:
                      0,

                    resetAtMs:
                      60_000,
                  };
                },

                async deleteExpired() {
                  throw new Error(
                    "not used",
                  );
                },
              },
            },
          ),

        (error) =>
          error?.code
            === "RATE_LIMITED"
          && error?.status
            === 429,
      );

      assert.equal(
        response.headers.get(
          "retry-after",
        ),
        "59",
      );
    } finally {
      restoreSecret(
        previousSecret,
      );
    }
  },
);

test(
  "distributed API limiter fails closed when its HMAC secret is missing",
  async () => {
    const previousSecret =
      process.env
        .VEIL_RATE_LIMIT_SECRET;

    delete process.env
      .VEIL_RATE_LIMIT_SECRET;

    let repositoryCalled =
      false;

    try {
      await assert.rejects(
        () =>
          enforceDistributedRateLimit(
            {
              headers: {
                "x-forwarded-for":
                  "192.0.2.12",
              },
            },
            createResponse(),
            CONTEXT,
            {
              scope:
                "api:messaging:prepare",

              repository: {
                async consume() {
                  repositoryCalled =
                    true;

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
            },
          ),

        (error) =>
          error?.code
            === "RATE_LIMIT_SECRET_INVALID"
          && error?.status
            === 503,
      );

      assert.equal(
        repositoryCalled,
        false,
      );
    } finally {
      restoreSecret(
        previousSecret,
      );
    }
  },
);

function restoreSecret(value) {
  if (value === undefined) {
    delete process.env
      .VEIL_RATE_LIMIT_SECRET;

    return;
  }

  process.env
    .VEIL_RATE_LIMIT_SECRET =
      value;
}
