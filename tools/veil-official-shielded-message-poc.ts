import { pathToFileURL } from "node:url";

import { RpcProvider, ec } from "starknet";

import {
  collectVeilPocIdentitySensitiveValues,
  loadVeilPocIdentityConfig,
} from "./veil-poc-identity.ts";
import type { VeilPocIdentityConfig } from "./veil-poc-identity.ts";
import { DEFAULT_POOL_ADDRESS } from "./veil-official-register-poc.ts";

export const SHIELDED_MESSAGE_IDENTITY_VALID =
  "SHIELDED_MESSAGE_IDENTITY_CONFIG_VALID";

export interface VeilShieldedMessagePocConfig {
  identity: VeilPocIdentityConfig;
  rpcUrl: string;
  proverUrl: string;
  poolAddress: bigint;
}

export interface ShieldedMessageIdentityContext {
  accountAddress: bigint;
  accountPrivateKey: string;
  viewingKey: bigint;
  encryptionViewingKey: bigint;
  decryptionViewingKey: bigint;
}

export interface ShieldedMessageIdentityProvider {
  callContract(call: {
    contractAddress: string;
    entrypoint: string;
    calldata: string[];
  }): Promise<string[]>;
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parsePoolAddress(value: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch (cause) {
    throw new Error("VEIL_POC_PRIVACY_POOL must be a Starknet felt.", { cause });
  }
  if (parsed <= 0n || parsed >= (1n << 251n)) {
    throw new Error("VEIL_POC_PRIVACY_POOL must be a nonzero Starknet felt.");
  }
  return parsed;
}

export function loadVeilShieldedMessagePocConfig(
  env: NodeJS.ProcessEnv = process.env,
): VeilShieldedMessagePocConfig {
  return Object.freeze({
    identity: loadVeilPocIdentityConfig(env),
    rpcUrl: requiredEnv(env, "STARKNET_SEPOLIA_RPC_URL"),
    proverUrl: requiredEnv(env, "VEIL_POC_PROVER_URL"),
    poolAddress: parsePoolAddress(
      env.VEIL_POC_PRIVACY_POOL?.trim() || DEFAULT_POOL_ADDRESS,
    ),
  });
}

export function createShieldedMessageIdentityContext(
  config: VeilShieldedMessagePocConfig,
): ShieldedMessageIdentityContext {
  const { accountAddress, accountPrivateKey, viewingKey } = config.identity;
  return Object.freeze({
    accountAddress,
    accountPrivateKey,
    viewingKey,
    encryptionViewingKey: viewingKey,
    decryptionViewingKey: viewingKey,
  });
}

export function createShieldedMessageIdentityProvider(
  rpcUrl: string,
): ShieldedMessageIdentityProvider {
  return new RpcProvider({ nodeUrl: rpcUrl }) as unknown as ShieldedMessageIdentityProvider;
}

export async function verifyShieldedMessageRegisteredIdentity(input: {
  config: VeilShieldedMessagePocConfig;
  provider: ShieldedMessageIdentityProvider;
}): Promise<void> {
  const context = createShieldedMessageIdentityContext(input.config);
  const response = await input.provider.callContract({
    contractAddress: `0x${input.config.poolAddress.toString(16)}`,
    entrypoint: "get_public_key",
    calldata: [`0x${context.accountAddress.toString(16)}`],
  });
  if (response.length !== 1) {
    throw new Error("Privacy Pool did not return one registered public key.");
  }
  const expectedPublicKey = BigInt(ec.starkCurve.getStarkKey(
    `0x${context.viewingKey.toString(16)}`,
  ));
  if (BigInt(response[0]!) !== expectedPublicKey) {
    throw new Error("VEIL PoC identity is not registered with the configured viewing key.");
  }
}

function isMainModule(): boolean {
  const invokedPath = process.argv[1];
  return invokedPath !== undefined
    && pathToFileURL(invokedPath).href === import.meta.url;
}

if (isMainModule()) {
  try {
    const config = loadVeilShieldedMessagePocConfig();
    await verifyShieldedMessageRegisteredIdentity({
      config,
      provider: createShieldedMessageIdentityProvider(config.rpcUrl),
    });
    console.log(SHIELDED_MESSAGE_IDENTITY_VALID);
  } catch (error) {
    const sensitiveValues = collectVeilPocIdentitySensitiveValues(process.env);
    const errorName = error instanceof Error ? error.name : "UnknownError";
    if (sensitiveValues.some((value) => errorName.includes(value))) {
      console.error("VEIL shielded-message identity preflight failed closed.");
    } else {
      console.error(`VEIL shielded-message identity preflight failed closed: ${errorName}`);
    }
    process.exitCode = 1;
  }
}
