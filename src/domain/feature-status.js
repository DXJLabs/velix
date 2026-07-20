export const FEATURE_STATUS = Object.freeze({
  WORKING: "WORKING",
  PARTIAL: "PARTIAL",
  BLOCKED: "BLOCKED",
  UNVERIFIED: "UNVERIFIED",
  DISABLED: "DISABLED",
});

export const PRIVACY_TRANSPORT_STATUS = Object.freeze({
  DIRECT_ENCRYPTED_LEGACY: "DIRECT_ENCRYPTED_LEGACY",
  CANONICAL_PREPARED: "CANONICAL_PREPARED",
  CANONICAL_UNAVAILABLE: "CANONICAL_UNAVAILABLE",
  CANONICAL_FAILED: "CANONICAL_FAILED",
  CANONICAL_SUBMITTED: "CANONICAL_SUBMITTED",
  CANONICAL_ACCEPTED: "CANONICAL_ACCEPTED",
});

const FEATURE_STATUS_VALUES = Object.freeze(Object.values(FEATURE_STATUS));

export function isFeatureStatus(value) {
  return FEATURE_STATUS_VALUES.includes(value);
}

export function createFeatureStatusModel(statuses) {
  if (!statuses || typeof statuses !== "object" || Array.isArray(statuses)) {
    throw new Error("Feature statuses must be supplied as an object.");
  }

  const entries = Object.entries(statuses);
  entries.forEach(([feature, status]) => {
    if (!feature.trim()) throw new Error("Feature status keys must not be empty.");
    if (!isFeatureStatus(status)) throw new Error(`Invalid status for ${feature}: ${status}`);
  });
  return Object.freeze(Object.fromEntries(entries));
}

export const VEIL_PHASE1_FEATURE_STATUS = createFeatureStatusModel({
  directEncryptedMessaging: FEATURE_STATUS.WORKING,
  privacyWalletApi: FEATURE_STATUS.UNVERIFIED,
  shield: FEATURE_STATUS.BLOCKED,
  privateTransfer: FEATURE_STATUS.BLOCKED,
  unshield: FEATURE_STATUS.DISABLED,
  shieldedPaymentMemo: FEATURE_STATUS.BLOCKED,
  pureShieldedChat: FEATURE_STATUS.UNVERIFIED,
  officialPrivacyTransport: FEATURE_STATUS.BLOCKED,
  offer: FEATURE_STATUS.DISABLED,
  legacyEscrow: FEATURE_STATUS.DISABLED,
  unsafeSettlement: FEATURE_STATUS.DISABLED,
  paymaster: FEATURE_STATUS.DISABLED,
});

export const VEIL_PHASE3_PRIVACY_TRANSPORT_STATE = Object.freeze({
  legacy: Object.freeze({
    status: PRIVACY_TRANSPORT_STATUS.DIRECT_ENCRYPTED_LEGACY,
    label: "Direct encrypted",
  }),
  canonical: Object.freeze({
    status: PRIVACY_TRANSPORT_STATUS.CANONICAL_UNAVAILABLE,
    prepared: false,
    liveVerified: false,
  }),
  unshield: Object.freeze({ available: false }),
});
