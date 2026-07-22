export const WALLET_PRIVACY_SUPPORT = Object.freeze({
  FULL: "full",
  PARTIAL: "partial",
  UNSUPPORTED: "unsupported",
});

export const WALLET_PRIVACY_CAPABILITY = Object.freeze({
  ACCOUNT_CONNECTED: "accountConnected",
  SIGNING: "signing",
  STRK20_WALLET_API: "strk20WalletApi",
  REGISTRATION: "registration",
  SHIELD: "shield",
  PRIVATE_TRANSFER: "privateTransfer",
  CUSTOM_ANONYMIZER_INVOCATION: "customAnonymizerInvocation",
  WALLET_PROOF_MANAGEMENT: "walletProofManagement",
  SCREENING_CAPABLE_DEPOSIT: "screeningCapableDeposit",
});

const CAPABILITY_KEYS = Object.freeze(Object.values(WALLET_PRIVACY_CAPABILITY));
const PRIVACY_SPECIFIC_KEYS = Object.freeze(CAPABILITY_KEYS.filter((key) => (
  key !== WALLET_PRIVACY_CAPABILITY.ACCOUNT_CONNECTED
  && key !== WALLET_PRIVACY_CAPABILITY.SIGNING
)));

function normalizeCapabilities(input = {}) {
  return Object.freeze(Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, input[key] === true])));
}

export function classifyWalletPrivacySupport(input = {}) {
  const capabilities = normalizeCapabilities(input);
  if (CAPABILITY_KEYS.every((key) => capabilities[key])) return WALLET_PRIVACY_SUPPORT.FULL;
  if (PRIVACY_SPECIFIC_KEYS.some((key) => capabilities[key])) return WALLET_PRIVACY_SUPPORT.PARTIAL;
  return WALLET_PRIVACY_SUPPORT.UNSUPPORTED;
}

export function createWalletPrivacyCapabilityModel(input = {}) {
  const capabilities = normalizeCapabilities(input);
  return Object.freeze({
    support: classifyWalletPrivacySupport(capabilities),
    capabilities,
  });
}

export function walletHasPrivacyCapability(model, capability) {
  if (!CAPABILITY_KEYS.includes(capability)) throw new Error(`Unknown wallet privacy capability: ${capability}`);
  return model?.capabilities?.[capability] === true;
}
