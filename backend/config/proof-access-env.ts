export interface ProofAccessEnvironment {
  readonly hmacSecret: Buffer;
}

export class ProofAccessEnvironmentError
extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "ProofAccessEnvironmentError";

    this.code =
      code;
  }
}

export function loadProofAccessEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): ProofAccessEnvironment {
  const raw =
    env.VEIL_PROOF_ACCESS_SECRET
      ?.trim();

  if (!raw) {
    throw environmentError(
      "PROOF_ACCESS_ENV_MISSING",
      "VEIL_PROOF_ACCESS_SECRET must be configured.",
    );
  }

  if (raw.includes("${{")) {
    throw environmentError(
      "PROOF_ACCESS_ENV_UNRESOLVED",
      "VEIL_PROOF_ACCESS_SECRET contains an unresolved environment reference.",
    );
  }

  const secret =
    Buffer.from(
      raw,
      "utf8",
    );

  if (
    secret.byteLength < 32
    || secret.byteLength > 4_096
  ) {
    secret.fill(0);

    throw environmentError(
      "PROOF_ACCESS_SECRET_INVALID",
      "VEIL_PROOF_ACCESS_SECRET must contain between 32 and 4096 UTF-8 bytes.",
    );
  }

  return Object.freeze({
    hmacSecret:
      secret,
  });
}

function environmentError(
  code: string,
  message: string,
): ProofAccessEnvironmentError {
  return new ProofAccessEnvironmentError(
    code,
    message,
  );
}
