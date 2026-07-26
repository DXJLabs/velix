import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeDistributedRateLimit,
  DistributedRateLimitError,
  type DistributedRateLimitRepository,
} from "../services/security/distributed-rate-limit.js";

test(
  "distributed rate limit accepts a request within the limit",
  async () => {
    const repository:
      DistributedRateLimitRepository = {
        async consume(input) {
          assert.equal(
            input.scope,
            "api:messaging:prepare",
          );

          return {
            allowed: true,
            count: 1,
            limit: input.limit,
            remaining: 2,
            resetAtMs: 60_000,
          };
        },

        async deleteExpired() {
          throw new Error("not used");
        },
      };

    const result =
      await consumeDistributedRateLimit(
        repository,
        {
          scope:
            "api:messaging:prepare",

          identityHash:
            "a".repeat(64),

          nowMs:
            1_000,

          windowMs:
            60_000,

          limit:
            3,
        },
      );

    assert.deepEqual(
      result,
      {
        allowed: true,
        count: 1,
        limit: 3,
        remaining: 2,
        resetAtMs: 60_000,
      },
    );
  },
);

test(
  "distributed rate limit rejects invalid input before repository access",
  async () => {
    let called = false;

    const repository:
      DistributedRateLimitRepository = {
        async consume() {
          called = true;

          throw new Error("not used");
        },

        async deleteExpired() {
          throw new Error("not used");
        },
      };

    await assert.rejects(
      () =>
        consumeDistributedRateLimit(
          repository,
          {
            scope:
              "api:messaging:prepare",

            identityHash:
              "not-a-sha256",

            nowMs:
              1_000,

            windowMs:
              60_000,

            limit:
              3,
          },
        ),

      (error: unknown) =>
        error instanceof
          DistributedRateLimitError
        && error.code
          === "DISTRIBUTED_RATE_LIMIT_INPUT_INVALID",
    );

    assert.equal(
      called,
      false,
    );
  },
);

test(
  "distributed rate limit rejects inconsistent repository results",
  async () => {
    const repository:
      DistributedRateLimitRepository = {
        async consume(input) {
          return {
            allowed: false,
            count: 1,
            limit: input.limit,
            remaining: 2,
            resetAtMs: 60_000,
          };
        },

        async deleteExpired() {
          throw new Error("not used");
        },
      };

    await assert.rejects(
      () =>
        consumeDistributedRateLimit(
          repository,
          {
            scope:
              "api:messaging:prepare",

            identityHash:
              "b".repeat(64),

            nowMs:
              1_000,

            windowMs:
              60_000,

            limit:
              3,
          },
        ),

      (error: unknown) =>
        error instanceof
          DistributedRateLimitError
        && error.code
          === "DISTRIBUTED_RATE_LIMIT_RESULT_INVALID",
    );
  },
);
