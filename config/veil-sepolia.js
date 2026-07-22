const STARKNET_ADDRESS_BOUND = (1n << 251n) - 256n;
const STARKNET_FIELD_PRIME = (1n << 251n) + (17n << 192n) + 1n;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const STARKNET_SEPOLIA_CHAIN_ID = "SN_SEPOLIA";
export const STARKNET_SEPOLIA_CHAIN_ID_HEX = "0x534e5f5345504f4c4941";

export function normalizeStarknetChainId(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";
  if (normalized === STARKNET_SEPOLIA_CHAIN_ID || normalized === STARKNET_SEPOLIA_CHAIN_ID_HEX.toUpperCase()) {
    return STARKNET_SEPOLIA_CHAIN_ID;
  }
  if (normalized === "SN_MAIN" || normalized === "0X534E5F4D41494E") return "SN_MAIN";
  return normalized;
}

export function isStarknetAddress(value) {
  const normalized = String(value || "").trim();
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(normalized)) return false;

  const address = BigInt(normalized);
  return address > 0n && address < STARKNET_ADDRESS_BOUND;
}

export function isStarknetFelt(value) {
  const normalized = String(value || "").trim();
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(normalized)) return false;
  return BigInt(normalized) < STARKNET_FIELD_PRIME;
}

const sepoliaConfig = {
  id: STARKNET_SEPOLIA_CHAIN_ID,
  chainId: STARKNET_SEPOLIA_CHAIN_ID,
  chainIdHex: STARKNET_SEPOLIA_CHAIN_ID_HEX,
  name: "Starknet Sepolia",
  network: "sepolia",
  explorerUrl: "https://sepolia.voyager.online",
  rpc: {
    defaultUrl: "https://api.zan.top/public/starknet-sepolia/rpc/v0_9",
    version: "v0_9",
    specVersion: "0.9.0",
    verifiedAt: "2026-07-16",
  },
  privacyPool: {
    address: "0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5",
    classHash: "0x30b8c540cf04d8ef0f4db2a9098d9cc0e35e83af1cb3325f5a4f40144b4b30b",
    deploymentTransactionHash: "0x04692acc8d3e586a65f394d952934acb9997f580f88781e30da4d39b1da5d3b0",
    compatibility: "legacy-pre-screening",
    screeningCapable: false,
  },
  contracts: {
    channelHelper: {
      name: "VeilChannelHelper",
      address: "0x052390845931a0c8d4735246d853a1a514c3cbf88cb1714937284814c5e57b23",
      classHash: "0x7892efb93c77260c410d2e3e29cf6a28421d8e1ab0c688ffaf64304e7e47d97",
      deploymentTransactionHash: "0x0141b71a2dc7c5be0433e282533a64e9f92caf444d04dae5227fbe8e490e9fd5",
      runtimeDefault: true,
    },
    offer: {
      name: "VeilOffer",
      address: "0x02f31ea76073dbf57f404513d2160fb0ca81d6d7432be594be10cca37441feab",
      classHash: "0x4ac44039e5ea11daa8eb5396c88370d48086d6038258319bd66b6b85c2ae84b",
      deploymentTransactionHash: "0x0283f42a45500051c4c6ed613cc0e5a77bfdcc497bbfe199802062eb7293f1d9",
      compatibility: "legacy-pre-hardening",
      unsafeOrIncomplete: true,
      runtimeDefault: false,
    },
  },
  officialCompatibility: {
    walletApi: {
      version: "0.10.3",
      repository: "https://github.com/starkware-libs/starknet-specs",
      commit: "778270f6091ec14a822c2108f397a48020d3b22a",
      verifiedAt: "2026-07-16",
    },
    repository: "https://github.com/starkware-libs/starknet-privacy",
    poolContract: {
      tag: "PRIVACY-0.14.3-RC.0",
      classHash: "0x052107fadffab71bdcbb6b2ccb68ba3e1b5558d94036538053e159d3076ad633",
    },
    sdk: {
      package: "@starkware-libs/starknet-privacy-sdk",
      version: "0.14.3-rc.2",
      tag: "PRIVACY-0.14.3-RC.2",
      commit: "9bfeb8dd35565a2915a0617dff3f649bd5bb891a",
      repository: "https://github.com/starkware-libs/starknet-privacy",
      artifactShasum: "2720f2836f8760991dd2749d3e7d0b67fdb70bed",
      artifactIntegrity: "sha512-MK4KDeHOdJAwzhoZJTF8MGwAnHxIzhu9B3h/JC7ER+RWK1Z3y6A7Re31p0hV+2D2Z1vhmVFGOCEqd9+3e6VTeQ==",
    },
  },
};

function validateDeployment(name, deployment) {
  if (!isStarknetAddress(deployment.address)) throw new Error(`${name} has an invalid Starknet address.`);
  if (!isStarknetFelt(deployment.classHash)) throw new Error(`${name} has an invalid class hash.`);
  if (!isStarknetFelt(deployment.deploymentTransactionHash)) {
    throw new Error(`${name} has an invalid deployment transaction hash.`);
  }
}

validateDeployment("Privacy Pool", sepoliaConfig.privacyPool);
Object.entries(sepoliaConfig.contracts).forEach(([name, deployment]) => validateDeployment(name, deployment));
if (!isStarknetFelt(sepoliaConfig.officialCompatibility.poolContract.classHash)) {
  throw new Error("Official Privacy Pool compatibility class hash is invalid.");
}

export const VEIL_SEPOLIA_CONFIG = deepFreeze(sepoliaConfig);

export function requireVeilSepoliaConfig(chainId) {
  const normalized = normalizeStarknetChainId(chainId);
  if (normalized !== STARKNET_SEPOLIA_CHAIN_ID) {
    throw new Error(`VEIL runtime supports SN_SEPOLIA only; received ${normalized || "an empty chain ID"}.`);
  }
  return VEIL_SEPOLIA_CONFIG;
}

export function assertVeilRpcCompatibility({ chainId, specVersion }) {
  requireVeilSepoliaConfig(chainId);
  if (String(specVersion || "").trim() !== VEIL_SEPOLIA_CONFIG.rpc.specVersion) {
    throw new Error(
      `VEIL Sepolia RPC spec mismatch: expected ${VEIL_SEPOLIA_CONFIG.rpc.specVersion}, received ${specVersion || "empty"}.`,
    );
  }
  return true;
}
