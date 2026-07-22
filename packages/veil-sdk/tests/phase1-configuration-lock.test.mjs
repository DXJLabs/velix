import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STARKNET_SEPOLIA_CHAIN_ID_HEX,
  VEIL_SEPOLIA_CONFIG,
  assertVeilRpcCompatibility,
  isStarknetAddress,
  requireVeilSepoliaConfig,
} from "../../../config/veil-sepolia.js";
import { createRuntimeConfig } from "../../../src/app/runtime-config.js";
import {
  FEATURE_STATUS,
  PRIVACY_TRANSPORT_STATUS,
  VEIL_PHASE1_FEATURE_STATUS,
  VEIL_PHASE3_PRIVACY_TRANSPORT_STATE,
  createFeatureStatusModel,
} from "../../../src/domain/feature-status.js";
import {
  WALLET_PRIVACY_CAPABILITY,
  WALLET_PRIVACY_SUPPORT,
  createWalletPrivacyCapabilityModel,
} from "../../../src/domain/privacy-capabilities.js";

describe("Phase 1 Sepolia configuration lock", () => {
  it("contains the verified network, deployment, and official SDK pins", () => {
    assert.equal(VEIL_SEPOLIA_CONFIG.chainId, "SN_SEPOLIA");
    assert.equal(VEIL_SEPOLIA_CONFIG.chainIdHex, "0x534e5f5345504f4c4941");
    assert.equal(VEIL_SEPOLIA_CONFIG.rpc.version, "v0_9");
    assert.equal(VEIL_SEPOLIA_CONFIG.rpc.specVersion, "0.9.0");
    assert.equal(
      VEIL_SEPOLIA_CONFIG.privacyPool.address,
      "0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5",
    );
    assert.equal(
      VEIL_SEPOLIA_CONFIG.privacyPool.classHash,
      "0x30b8c540cf04d8ef0f4db2a9098d9cc0e35e83af1cb3325f5a4f40144b4b30b",
    );
    assert.equal(VEIL_SEPOLIA_CONFIG.privacyPool.compatibility, "legacy-pre-screening");
    assert.equal(VEIL_SEPOLIA_CONFIG.privacyPool.screeningCapable, false);
    assert.equal(VEIL_SEPOLIA_CONFIG.contracts.offer.runtimeDefault, false);
    assert.equal(VEIL_SEPOLIA_CONFIG.contracts.offer.unsafeOrIncomplete, true);

    const sdk = VEIL_SEPOLIA_CONFIG.officialCompatibility.sdk;
    assert.equal(sdk.package, "@starkware-libs/starknet-privacy-sdk");
    assert.equal(sdk.version, "0.14.3-rc.2");
    assert.equal(sdk.tag, "PRIVACY-0.14.3-RC.2");
    assert.equal(sdk.commit, "9bfeb8dd35565a2915a0617dff3f649bd5bb891a");
    assert.equal(VEIL_SEPOLIA_CONFIG.officialCompatibility.walletApi.version, "0.10.3");
    assert.equal(
      VEIL_SEPOLIA_CONFIG.officialCompatibility.walletApi.commit,
      "778270f6091ec14a822c2108f397a48020d3b22a",
    );
    assert.equal(
      VEIL_SEPOLIA_CONFIG.officialCompatibility.poolContract.classHash,
      "0x052107fadffab71bdcbb6b2ccb68ba3e1b5558d94036538053e159d3076ad633",
    );
    assert.equal(Object.isFrozen(VEIL_SEPOLIA_CONFIG), true);
    assert.equal(Object.isFrozen(VEIL_SEPOLIA_CONFIG.contracts), true);
  });

  it("accepts only the verified Sepolia chain and RPC spec", () => {
    assert.equal(requireVeilSepoliaConfig("SN_SEPOLIA"), VEIL_SEPOLIA_CONFIG);
    assert.equal(requireVeilSepoliaConfig(STARKNET_SEPOLIA_CHAIN_ID_HEX), VEIL_SEPOLIA_CONFIG);
    assert.equal(assertVeilRpcCompatibility({ chainId: "SN_SEPOLIA", specVersion: "0.9.0" }), true);
    assert.throws(() => requireVeilSepoliaConfig("SN_MAIN"), /supports SN_SEPOLIA only/);
    assert.throws(
      () => assertVeilRpcCompatibility({ chainId: "SN_SEPOLIA", specVersion: "0.10.0" }),
      /RPC spec mismatch/,
    );
  });

  it("fails fast instead of using Sepolia deployments on another chain or invalid overrides", () => {
    assert.throws(
      () => createRuntimeConfig({ VITE_STARKNET_CHAIN_ID: "SN_MAIN" }, ""),
      /supports SN_SEPOLIA only/,
    );
    assert.throws(
      () => createRuntimeConfig({ VITE_VEIL_CHANNEL_HELPER_ADDRESS: "invalid" }, ""),
      /not a valid Starknet address/,
    );
    assert.throws(
      () => createRuntimeConfig({ VITE_VEIL_CHANNEL_HELPER_ADDRESS: "0x123" }, ""),
      /does not match the verified VEIL Sepolia deployment/,
    );
    assert.throws(
      () => createRuntimeConfig({ VITE_STARKNET_RPC_URL: "https://rpc.example/rpc/v0_10" }, ""),
      /locked to v0_9/,
    );
    assert.equal(isStarknetAddress("0x0"), false);
  });

  it("keeps unsafe and unverified runtime routes off by default", () => {
    const defaults = createRuntimeConfig({}, "");
    assert.equal(defaults.expectedChainId, "SN_SEPOLIA");
    assert.equal(defaults.offerAddress, "");
    assert.equal(defaults.avnuPaymasterEnabled, false);
    assert.equal(defaults.onchainPayloads, false);
    assert.equal(defaults.privacyRuntime.sdk.enabled, false);
    assert.equal(defaults.privacyRuntime.sdk.installed, true);
    assert.equal(defaults.privacyRuntime.sdk.compatible, true);
    assert.equal(defaults.privacyRuntime.wallet.capable, false);
    assert.equal(defaults.privacyRuntime.pool.compatible, false);
    assert.equal(defaults.privacyRuntime.legacy.status, "DIRECT_ENCRYPTED_LEGACY");
    assert.equal(defaults.privacyRuntime.legacy.label, "Direct encrypted");
    assert.equal(defaults.privacyRuntime.canonical.status, "CANONICAL_UNAVAILABLE");
    assert.equal(defaults.privacyRuntime.canonical.prepared, false);
    assert.equal(defaults.privacyRuntime.canonical.liveVerified, false);
    assert.equal(defaults.privacyRuntime.unshield.available, false);
    assert.equal(defaults.privacyRuntime.prover.mode, "disabled");
    assert.equal(defaults.privacyRuntime.prover.configured, false);
    assert.equal(defaults.privacyRuntime.prover.localVerified, false);
    assert.equal(defaults.privacyRuntime.prover.liveVerified, false);
    assert.equal(defaults.privacyRuntime.prover.broadcastEnabled, false);
    assert.equal(defaults.privacyRuntime.discovery.provider, "contract");
    assert.equal(defaults.privacyRuntime.screening.capable, false);

    const explicitlyEnabled = createRuntimeConfig({ VITE_VEIL_ONCHAIN_PAYLOADS: "true" }, "");
    assert.equal(explicitlyEnabled.onchainPayloads, true);
    assert.equal(explicitlyEnabled.avnuPaymasterEnabled, false);
    assert.throws(
      () => createRuntimeConfig({ VITE_VEIL_OFFER_ADDRESS: VEIL_SEPOLIA_CONFIG.contracts.offer.address }, ""),
      /predates the hardened VeilOffer/,
    );
    assert.throws(
      () => createRuntimeConfig({ VITE_AVNU_PAYMASTER_ENABLED: "true" }, ""),
      /proof-aware submission path/,
    );
    assert.throws(
      () => createRuntimeConfig({ VITE_STRK20_SCREENING_CAPABLE: "true" }, ""),
      /not screening-capable/,
    );
    assert.throws(
      () => createRuntimeConfig({ VITE_STRK20_SDK_ENABLED: "true" }, ""),
      /foundation is installed/,
    );
    assert.throws(
      () => createRuntimeConfig({
        VITE_STRK20_PROVER_MODE: "self-hosted",
        VITE_STRK20_PROVER_URL: "https://prover.example",
      }, ""),
      /loopback endpoint only/,
    );
    assert.throws(
      () => createRuntimeConfig({
        VITE_STRK20_PROVER_MODE: "hosted",
        VITE_STRK20_PROVER_URL: "http://prover.example",
      }, ""),
      /requires HTTPS/,
    );
    assert.throws(
      () => createRuntimeConfig({
        VITE_STRK20_PROVER_MODE: "hosted",
        VITE_STRK20_PROVER_URL: "https://user:secret@prover.example",
      }, ""),
      /cannot contain credentials/,
    );
    const localProver = createRuntimeConfig({
      VITE_STRK20_PROVER_MODE: "self-hosted",
      VITE_STRK20_PROVER_URL: "http://127.0.0.1:3000",
    }, "");
    assert.equal(localProver.privacyRuntime.prover.configured, true);
    assert.equal(localProver.privacyRuntime.prover.localVerified, false);
    assert.equal(localProver.privacyRuntime.canonical.prepared, false);
    assert.equal(localProver.privacyRuntime.canonical.liveVerified, false);
  });
});

describe("Phase 1 privacy capability and feature status models", () => {
  it("does not infer privacy support from account connection or signing", () => {
    const signerOnly = createWalletPrivacyCapabilityModel({ accountConnected: true, signing: true });
    assert.equal(signerOnly.support, WALLET_PRIVACY_SUPPORT.UNSUPPORTED);
    assert.equal(signerOnly.capabilities.strk20WalletApi, false);
  });

  it("classifies explicit privacy capability subsets as partial and the complete set as full", () => {
    const partial = createWalletPrivacyCapabilityModel({ strk20WalletApi: true, privateTransfer: true });
    assert.equal(partial.support, WALLET_PRIVACY_SUPPORT.PARTIAL);

    const complete = Object.fromEntries(Object.values(WALLET_PRIVACY_CAPABILITY).map((key) => [key, true]));
    const full = createWalletPrivacyCapabilityModel(complete);
    assert.equal(full.support, WALLET_PRIVACY_SUPPORT.FULL);
    assert.equal(Object.isFrozen(full.capabilities), true);
  });

  it("allows only the locked feature status vocabulary", () => {
    assert.deepEqual(Object.values(FEATURE_STATUS), [
      "WORKING",
      "PARTIAL",
      "BLOCKED",
      "UNVERIFIED",
      "DISABLED",
    ]);
    assert.equal(VEIL_PHASE1_FEATURE_STATUS.directEncryptedMessaging, FEATURE_STATUS.WORKING);
    assert.equal(VEIL_PHASE1_FEATURE_STATUS.shield, FEATURE_STATUS.BLOCKED);
    assert.equal(VEIL_PHASE1_FEATURE_STATUS.unshield, FEATURE_STATUS.DISABLED);
    assert.equal(VEIL_PHASE1_FEATURE_STATUS.officialPrivacyTransport, FEATURE_STATUS.BLOCKED);
    assert.equal(Object.isFrozen(VEIL_PHASE1_FEATURE_STATUS), true);
    assert.equal(
      VEIL_PHASE3_PRIVACY_TRANSPORT_STATE.legacy.status,
      PRIVACY_TRANSPORT_STATUS.DIRECT_ENCRYPTED_LEGACY,
    );
    assert.equal(VEIL_PHASE3_PRIVACY_TRANSPORT_STATE.canonical.prepared, false);
    assert.equal(VEIL_PHASE3_PRIVACY_TRANSPORT_STATE.canonical.liveVerified, false);
    assert.throws(() => createFeatureStatusModel({ shield: "working" }), /Invalid status/);
  });
});
