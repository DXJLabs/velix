export interface ConsumeRateLimitInput {
  readonly scope: string;
  readonly identityHash: string;
  readonly nowMs: number;
  readonly windowMs: number;
  readonly limit: number;
}

export interface RateLimitConsumption {
  readonly allowed: boolean;
  readonly count: number;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAtMs: number;
}

export interface DistributedRateLimitRepository {
  consume(
    input: ConsumeRateLimitInput,
  ): Promise<RateLimitConsumption>;

  deleteExpired(
    nowMs: number,
    limit: number,
  ): Promise<number>;
}

export class DistributedRateLimitError
  extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "DistributedRateLimitError";

    this.code = code;
  }
}

export async function consumeDistributedRateLimit(
  repository: DistributedRateLimitRepository,
  input: ConsumeRateLimitInput,
): Promise<RateLimitConsumption> {
  validateConsumeInput(input);

  const result =
    await repository.consume(input);

  validateConsumption(
    input,
    result,
  );

  return Object.freeze({
    ...result,
  });
}

function validateConsumeInput(
  input: ConsumeRateLimitInput,
): void {
  if (
    !/^[A-Za-z0-9:_/-]{1,160}$/u
      .test(input.scope)
    || !/^[0-9a-f]{64}$/u
      .test(input.identityHash)
    || !Number.isSafeInteger(input.nowMs)
    || input.nowMs < 0
    || !Number.isSafeInteger(input.windowMs)
    || input.windowMs < 1_000
    || input.windowMs > 60 * 60_000
    || !Number.isSafeInteger(input.limit)
    || input.limit < 1
    || input.limit > 1_000
  ) {
    throw rateLimitError(
      "DISTRIBUTED_RATE_LIMIT_INPUT_INVALID",
      "The distributed rate-limit input is invalid.",
    );
  }
}

function validateConsumption(
  input: ConsumeRateLimitInput,
  result: RateLimitConsumption,
): void {
  if (
    typeof result.allowed !== "boolean"
    || !Number.isSafeInteger(result.count)
    || result.count < 1
    || result.limit !== input.limit
    || !Number.isSafeInteger(result.remaining)
    || result.remaining < 0
    || result.remaining > input.limit
    || !Number.isSafeInteger(result.resetAtMs)
    || result.resetAtMs <= input.nowMs
    || result.allowed
      !== (result.count <= input.limit)
  ) {
    throw rateLimitError(
      "DISTRIBUTED_RATE_LIMIT_RESULT_INVALID",
      "The distributed rate-limit repository returned an invalid result.",
    );
  }
}

function rateLimitError(
  code: string,
  message: string,
): DistributedRateLimitError {
  return new DistributedRateLimitError(
    code,
    message,
  );
}
