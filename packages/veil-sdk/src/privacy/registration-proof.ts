import {
  createEmptyRegistry,
  createPrivateTransfers,
} from "@starkware-libs/starknet-privacy-sdk";
import type {
  DiscoveryProviderInterface,
  ExecuteResult,
  PrivateRegistry,
  PrivateTransfersUser,
  ProofProviderInterface,
  ProvingBlockId,
  StarknetAddress,
  ViewingKeyProvider,
} from "@starkware-libs/starknet-privacy-sdk";
import { VeilPrivacyError } from "./errors.js";
import type { PrivacyNamespace } from "./namespace.js";
import type { EncryptedViewingKeyVault } from "./viewing-key-vault.js";
import {
  OFFICIAL_MAX_VIEWING_KEY,
  assertViewingKey,
} from "./viewing-key.js";

const VIEWING_KEY_BYTES = 32;
const VIEWING_KEY_TOP_MASK = 0x07;
const MAX_GENERATION_ATTEMPTS = 128;

type RegistrationDiscoveryMethod =
  | "discoverNotes"
  | "discoverChannels"
  | "discoverRequirement";

export class RegistrationDiscoveryAccessError extends Error {
  readonly method: RegistrationDiscoveryMethod;

  constructor(method: RegistrationDiscoveryMethod) {
    super(`Registration proof unexpectedly requested ${method}.`);
    this.name = "RegistrationDiscoveryAccessError";
    this.method = method;
  }
}

export class FailClosedRegistrationDiscoveryProvider
implements DiscoveryProviderInterface {
  discoveryCalls = 0;
  lastMethod: RegistrationDiscoveryMethod | undefined;

  private reject(method: RegistrationDiscoveryMethod): never {
    this.discoveryCalls += 1;
    this.lastMethod = method;
    throw new RegistrationDiscoveryAccessError(method);
  }

  async discoverNotes(
    ..._args: Parameters<DiscoveryProviderInterface["discoverNotes"]>
  ): ReturnType<DiscoveryProviderInterface["discoverNotes"]> {
    return this.reject("discoverNotes");
  }

  async discoverChannels(
    ..._args: Parameters<DiscoveryProviderInterface["discoverChannels"]>
  ): ReturnType<DiscoveryProviderInterface["discoverChannels"]> {
    return this.reject("discoverChannels");
  }

  async discoverRequirement(
    ..._args: Parameters<DiscoveryProviderInterface["discoverRequirement"]>
  ): ReturnType<DiscoveryProviderInterface["discoverRequirement"]> {
    return this.reject("discoverRequirement");
  }
}

export interface RegistrationTransfersLike {
  build(options: {
    registry: PrivateRegistry;
    registryConst: true;
  }): {
    register(): {
      execute(options: {
        provingBlockId: ProvingBlockId;
      }): Promise<ExecuteResult>;
    };
  };
}

export interface RegistrationTransfersFactoryInput {
  account: PrivateTransfersUser;
  viewingKeyProvider: ViewingKeyProvider;
  provingProvider: ProofProviderInterface;
  discoveryProvider: DiscoveryProviderInterface;
  poolContractAddress: StarknetAddress;
  poolMode: "compatibility";
}

export type RegistrationTransfersFactory = (
  input: RegistrationTransfersFactoryInput,
) => RegistrationTransfersLike;

export interface PrepareOfficialRegistrationProofInput {
  user: PrivateTransfersUser;
  namespace: PrivacyNamespace;
  viewingKeyVault: EncryptedViewingKeyVault;
  provingProvider: ProofProviderInterface;
  poolAddress: StarknetAddress;
  provingBlockId: ProvingBlockId;
  registry?: PrivateRegistry;
  crypto?: Crypto;
  createTransfers?: RegistrationTransfersFactory;
}

export interface PreparedOfficialRegistrationProof {
  result: ExecuteResult;
  viewingKeyCreated: boolean;
  proofPresent: boolean;
  proofLength: number;
  proofFactsCount: number;
  discoveryCalls: number;
}

export async function prepareOfficialRegistrationProof(
  input: PrepareOfficialRegistrationProofInput,
): Promise<PreparedOfficialRegistrationProof> {
  assertRegistrationUser(input.user);

  let viewingKey = await input.viewingKeyVault.get(input.namespace);
  const viewingKeyCreated = viewingKey === undefined;

  if (viewingKey === undefined) {
    viewingKey = generateLocalViewingKey(input.crypto);
    // Persist before proving so a failed or interrupted attempt can retry with
    // the same identity instead of silently generating a different key.
    await input.viewingKeyVault.put(input.namespace, viewingKey);
  } else {
    assertViewingKey(viewingKey);
  }

  const discoveryProvider = new FailClosedRegistrationDiscoveryProvider();
  const createTransfers = input.createTransfers ?? defaultRegistrationTransfersFactory;
  const transfers = createTransfers({
    account: input.user,
    viewingKeyProvider: input.viewingKeyVault.createProvider(input.namespace),
    provingProvider: input.provingProvider,
    discoveryProvider,
    poolContractAddress: input.poolAddress,
    poolMode: "compatibility",
  });

  const result = await transfers
    .build({
      registry: input.registry ?? createEmptyRegistry(),
      registryConst: true,
    })
    .register()
    .execute({ provingBlockId: input.provingBlockId });

  if (discoveryProvider.discoveryCalls !== 0) {
    throw new VeilPrivacyError(
      "DISCOVERY_FAILED",
      "Registration proof unexpectedly accessed private-state discovery.",
    );
  }

  const proof = result.callAndProof?.proof;
  const proofFacts = Array.isArray(proof?.proofFacts)
    ? proof.proofFacts
    : [];
  const proofPresent = typeof proof?.data === "string"
    && proof.data.length > 0;

  if (!proofPresent || proofFacts.length === 0) {
    throw new VeilPrivacyError(
      "PROVING_FAILED",
      "Official registration proof did not contain proof data and proof facts.",
    );
  }

  return {
    result,
    viewingKeyCreated,
    proofPresent,
    proofLength: proof.data.length,
    proofFactsCount: proofFacts.length,
    discoveryCalls: discoveryProvider.discoveryCalls,
  };
}

export function generateLocalViewingKey(
  crypto: Crypto = globalThis.crypto,
): bigint {
  if (!crypto?.getRandomValues) {
    throw new VeilPrivacyError(
      "VIEWING_KEY_UNAVAILABLE",
      "Secure browser randomness is unavailable for viewing-key generation.",
    );
  }

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(VIEWING_KEY_BYTES));
    bytes[0] = (bytes[0] ?? 0) & VIEWING_KEY_TOP_MASK;
    const candidate = bytesToBigint(bytes);
    if (candidate >= 1n && candidate <= OFFICIAL_MAX_VIEWING_KEY) {
      return candidate;
    }
  }

  throw new VeilPrivacyError(
    "VIEWING_KEY_UNAVAILABLE",
    "Unable to generate a viewing key in the official SDK range.",
  );
}

function defaultRegistrationTransfersFactory(
  input: RegistrationTransfersFactoryInput,
): RegistrationTransfersLike {
  return createPrivateTransfers(input) as RegistrationTransfersLike;
}

function assertRegistrationUser(user: PrivateTransfersUser): void {
  if (!user?.address || typeof user.signer?.signTransaction !== "function") {
    throw new VeilPrivacyError(
      "PRIVACY_WALLET_UNSUPPORTED",
      "Registration requires a wallet signer with signTransaction.",
      { details: { requiredMethod: "signTransaction" } },
    );
  }
}

function bytesToBigint(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}
