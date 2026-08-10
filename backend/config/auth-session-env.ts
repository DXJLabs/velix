export interface AuthSessionEnvironment {
  readonly hmacSecret: Buffer;
}

export class AuthSessionEnvironmentError
extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);

    this.name =
      "AuthSessionEnvironmentError";

    this.code =
      code;
  }
}

export function loadAuthSessionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): AuthSessionEnvironment {
  const raw =
    env.VEIL_AUTH_SESSION_SECRET
      ?.trim();

  if (!raw) {
    throw environmentError(
      "AUTH_SESSION_ENV_MISSING",
      "VEIL_AUTH_SESSION_SECRET must be configured.",
    );
  }

  if (raw.includes("${{")) {
    throw environmentError(
      "AUTH_SESSION_ENV_UNRESOLVED",
      "VEIL_AUTH_SESSION_SECRET contains an unresolved environment reference.",
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
      "AUTH_SESSION_SECRET_INVALID",
      "VEIL_AUTH_SESSION_SECRET must contain between 32 and 4096 UTF-8 bytes.",
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
): AuthSessionEnvironmentError {
  return new AuthSessionEnvironmentError(
    code,
    message,
  );
}
