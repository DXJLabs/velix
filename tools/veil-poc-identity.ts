import { MAX_VIEWING_KEY } from "@starkware-libs/starknet-privacy-sdk";

const STARKNET_FELT_BOUND = 1n << 251n;
const NUMERIC_SECRET_PATTERN = /^(?:0x[0-9a-f]+|[0-9]+)$/iu;

export interface VeilPocIdentityConfig {
  accountAddress: bigint;
  accountPrivateKey: string;
  viewingKey: bigint;
}

function requiredIdentityEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function parseVeilPocAccountAddress(value: string): bigint {
  const normalized = value.trim();
  if (!NUMERIC_SECRET_PATTERN.test(normalized)) {
    throw new Error("VEIL_POC_ACCOUNT_ADDRESS must be a Starknet felt.");
  }
  const parsed = BigInt(normalized);
  if (parsed <= 0n || parsed >= STARKNET_FELT_BOUND) {
    throw new Error("VEIL_POC_ACCOUNT_ADDRESS must be a nonzero Starknet felt.");
  }
  return parsed;
}

export function parseVeilPocViewingKey(value: string): bigint {
  const normalized = value.trim();
  if (!NUMERIC_SECRET_PATTERN.test(normalized)) {
    throw new Error("VEIL_POC_VIEWING_KEY must be a numeric felt.");
  }
  const parsed = BigInt(normalized);
  if (parsed < 1n || parsed > MAX_VIEWING_KEY) {
    throw new Error("VEIL_POC_VIEWING_KEY is outside the official SDK viewing-key range.");
  }
  return parsed;
}

export function loadVeilPocIdentityConfig(
  env: NodeJS.ProcessEnv = process.env,
): VeilPocIdentityConfig {
  const accountPrivateKey = requiredIdentityEnv(
    env,
    "VEIL_POC_ACCOUNT_PRIVATE_KEY",
  );
  const accountAddress = parseVeilPocAccountAddress(requiredIdentityEnv(
    env,
    "VEIL_POC_ACCOUNT_ADDRESS",
  ));
  const viewingKey = parseVeilPocViewingKey(requiredIdentityEnv(
    env,
    "VEIL_POC_VIEWING_KEY",
  ));

  return Object.freeze({
    accountAddress,
    accountPrivateKey,
    viewingKey,
  });
}

export function collectVeilPocIdentitySensitiveValues(
  env: NodeJS.ProcessEnv,
  identity?: VeilPocIdentityConfig,
): string[] {
  const values = new Set<string>();
  const add = (value: string | undefined): void => {
    const normalized = value?.trim();
    if (normalized) values.add(normalized);
  };

  add(env.VEIL_POC_ACCOUNT_PRIVATE_KEY);
  add(env.VEIL_POC_VIEWING_KEY);
  if (identity) {
    add(identity.accountPrivateKey);
    add(identity.viewingKey.toString());
    add(`0x${identity.viewingKey.toString(16)}`);
  } else if (env.VEIL_POC_VIEWING_KEY) {
    try {
      const viewingKey = parseVeilPocViewingKey(env.VEIL_POC_VIEWING_KEY);
      add(viewingKey.toString());
      add(`0x${viewingKey.toString(16)}`);
    } catch {
      // Preserve the raw invalid secret for redaction without accepting it.
    }
  }
  return [...values];
}
