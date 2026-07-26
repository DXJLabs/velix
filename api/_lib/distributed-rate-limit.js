import crypto from "node:crypto";

import {
  consumeDistributedRateLimit,
} from "../../backend/dist/services/security/distributed-rate-limit.js";

import {
  PostgresDistributedRateLimitRepository,
} from "../../backend/dist/services/security/postgres-distributed-rate-limit.js";

import {
  createPostgresProvider,
} from "../../backend/dist/services/prover/postgres-provider.js";

import {
  ApiError,
} from "./privy.js";

const REPOSITORY_CACHE =
  Symbol.for(
    "veil.api.distributed-rate-limit.v1",
  );

export async function enforceDistributedRateLimit(
  request,
  response,
  context,
  options = {},
) {
  const limit =
    boundedInteger(
      options.limit,
      1,
      1_000,
      30,
    );

  const windowMs =
    boundedInteger(
      options.windowMs,
      1_000,
      60 * 60_000,
      60_000,
    );

  const nowMs =
    Number.isSafeInteger(
      options.nowMs,
    )
      ? options.nowMs
      : Date.now();

  let result;

  try {
    result =
      await consumeDistributedRateLimit(
        options.repository
          ?? rateLimitRepository(),
        {
          scope:
            requireScope(
              options.scope
                ?? context.route,
            ),

          identityHash:
            hashClientIdentity(
              request,
            ),

          nowMs,
          windowMs,
          limit,
        },
      );
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      503,
      "RATE_LIMIT_STORAGE_UNAVAILABLE",
      context.route,
      "The distributed rate-limit boundary is unavailable.",
      "Retry later after the server database connection has recovered.",
      {
        errorName:
          error?.name,

        errorCode:
          error?.code,
      },
    );
  }

  response.setHeader(
    "X-RateLimit-Limit",
    String(result.limit),
  );

  response.setHeader(
    "X-RateLimit-Remaining",
    String(result.remaining),
  );

  response.setHeader(
    "X-RateLimit-Reset",
    String(
      Math.ceil(
        result.resetAtMs / 1_000,
      ),
    ),
  );

  if (!result.allowed) {
    response.setHeader(
      "Retry-After",
      String(
        Math.max(
          1,
          Math.ceil(
            (
              result.resetAtMs
                - nowMs
            ) / 1_000,
          ),
        ),
      ),
    );

    throw new ApiError(
      429,
      "RATE_LIMITED",
      context.route,
      "Too many requests were sent to this endpoint.",
      "Wait until the Retry-After interval has elapsed, then retry once.",
    );
  }

  return result;
}

function rateLimitRepository() {
  globalThis[REPOSITORY_CACHE] ||=
    new PostgresDistributedRateLimitRepository(
      createPostgresProvider(),
    );

  return globalThis[REPOSITORY_CACHE];
}

function hashClientIdentity(
  request,
) {
  const secret =
    process.env
      .VEIL_RATE_LIMIT_SECRET
      ?.trim();

  if (
    !secret
    || Buffer.byteLength(
      secret,
      "utf8",
    ) < 32
  ) {
    throw new ApiError(
      503,
      "RATE_LIMIT_SECRET_INVALID",
      "rate-limit",
      "The server rate-limit secret is missing or too short.",
      "Configure VEIL_RATE_LIMIT_SECRET with at least 32 random bytes.",
    );
  }

  return crypto
    .createHmac(
      "sha256",
      secret,
    )
    .update(
      clientIdentity(request),
    )
    .digest("hex");
}

function clientIdentity(
  request,
) {
  const forwarded =
    request.headers
      ?.["x-forwarded-for"];

  const firstForwarded =
    Array.isArray(forwarded)
      ? forwarded[0]
      : String(
          forwarded ?? "",
        ).split(",")[0];

  return String(
    request.headers
      ?.["x-vercel-forwarded-for"]
      || firstForwarded
      || request.headers
        ?.["x-real-ip"]
      || request.socket
        ?.remoteAddress
      || "unknown-client",
  )
    .trim()
    .slice(0, 256);
}

function requireScope(
  value,
) {
  const scope =
    String(value ?? "");

  if (
    !/^[A-Za-z0-9:_/-]{1,160}$/u
      .test(scope)
  ) {
    throw new Error(
      "Invalid distributed rate-limit scope.",
    );
  }

  return scope;
}

function boundedInteger(
  value,
  minimum,
  maximum,
  fallback,
) {
  const parsed =
    Number(value);

  return Number.isSafeInteger(parsed)
    && parsed >= minimum
    && parsed <= maximum
    ? parsed
    : fallback;
}
