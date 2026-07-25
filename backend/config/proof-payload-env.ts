import {
  BackendEnvironmentError,
} from "./backend-env.js";

const KEY_BYTES = 32;
const KEY_VERSION_PATTERN =
  /^[A-Za-z0-9._-]{1,32}$/u;

export interface ProofPayloadKeyring {
  readonly activeKeyVersion: string;

  resolveKey(
    keyVersion: string,
  ): Buffer;
}

export function loadProofPayloadKeyring(
  env: NodeJS.ProcessEnv = process.env,
): ProofPayloadKeyring {
  const activeKeyVersion =
    requireKeyVersion(
      requireEnvironment(
        env,
        "VEIL_PROOF_PAYLOAD_ACTIVE_KEY_VERSION",
      ),
    );

  const rawKeyring =
    requireEnvironment(
      env,
      "VEIL_PROOF_PAYLOAD_KEYS",
    );

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawKeyring);
  } catch {
    throw environmentError(
      "VEIL_PROOF_PAYLOAD_KEYS_INVALID",
      "VEIL_PROOF_PAYLOAD_KEYS must be a JSON object.",
    );
  }

  if (!isPlainRecord(parsed)) {
    throw environmentError(
      "VEIL_PROOF_PAYLOAD_KEYS_INVALID",
      "VEIL_PROOF_PAYLOAD_KEYS must be a JSON object.",
    );
  }

  const keys = new Map<string, Buffer>();

  for (
    const [keyVersion, encodedKey]
    of Object.entries(parsed)
  ) {
    const normalizedVersion =
      requireKeyVersion(keyVersion);

    if (typeof encodedKey !== "string") {
      throw environmentError(
        "VEIL_PROOF_PAYLOAD_KEY_INVALID",
        "Every proof payload key must be a Base64 string.",
      );
    }

    keys.set(
      normalizedVersion,
      decodeKey(encodedKey),
    );
  }

  if (keys.size < 1 || keys.size > 8) {
    throw environmentError(
      "VEIL_PROOF_PAYLOAD_KEYS_INVALID",
      "The proof payload keyring must contain between one and eight keys.",
    );
  }

  if (!keys.has(activeKeyVersion)) {
    throw environmentError(
      "VEIL_PROOF_PAYLOAD_ACTIVE_KEY_MISSING",
      "The active proof payload key version is not present in the keyring.",
    );
  }

  return Object.freeze({
    activeKeyVersion,

    resolveKey(
      keyVersion: string,
    ): Buffer {
      const normalizedVersion =
        requireKeyVersion(keyVersion);

      const key =
        keys.get(normalizedVersion);

      if (!key) {
        throw environmentError(
          "VEIL_PROOF_PAYLOAD_KEY_NOT_FOUND",
          "The requested proof payload key version is unavailable.",
        );
      }

      return Buffer.from(key);
    },
  });
}

function decodeKey(
  encodedValue: string,
): Buffer {
  const encoded = encodedValue.trim();

  if (
    encoded.length < 1
    || !/^[A-Za-z0-9+/]+={0,2}$/u
      .test(encoded)
  ) {
    throw environmentError(
      "VEIL_PROOF_PAYLOAD_KEY_INVALID",
      "A proof payload key is not valid Base64.",
    );
  }

  const key =
    Buffer.from(encoded, "base64");

  if (
    key.length !== KEY_BYTES
    || key.toString("base64") !== encoded
  ) {
    throw environmentError(
      "VEIL_PROOF_PAYLOAD_KEY_INVALID",
      "Each proof payload key must decode to exactly 32 bytes.",
    );
  }

  return key;
}

function requireKeyVersion(
  value: string,
): string {
  const normalized = value.trim();

  if (
    !KEY_VERSION_PATTERN
      .test(normalized)
  ) {
    throw environmentError(
      "VEIL_PROOF_PAYLOAD_KEY_VERSION_INVALID",
      "The proof payload key version is invalid.",
    );
  }

  return normalized;
}

function requireEnvironment(
  env: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = env[name]?.trim();

  if (!value) {
    throw environmentError(
      `${name}_MISSING`,
      `${name} must be configured in the server environment.`,
    );
  }

  return value;
}

function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value)
      === Object.prototype
  );
}

function environmentError(
  code: string,
  message: string,
): BackendEnvironmentError {
  return new BackendEnvironmentError(
    code,
    message,
  );
}
