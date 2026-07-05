import { decodePrivacyPoolEvent, type RawStarknetEvent, type StarknetAbi } from "../event_decoder";
import { PRIVACY_POOL_EVENT_ABI, PRIVACY_POOL_SOURCE_CONSTRAINTS } from "../privacy_pool_abi";
import {
  PrivacyPoolTransactionAnalyzer,
  decodeTransactionCalldata,
  type PrivacyPoolTransactionAnalysis,
  type PrivacyPoolTransactionAnalyzerConfig,
  type RawStarknetTransaction,
} from "../transaction_analyzer";
import { RESEARCH_ONLY_ERROR } from "./shared";
import type { PrivacyPoolAdapter, PrivacyPoolAdapterActionResult } from "../types";

export interface ResearchPrivacyPoolAdapterConfig {
  rpcUrl?: string;
  privacyPoolAddress?: string;
  helperAddress?: string;
  abi?: StarknetAbi;
}

// VEIL IMPLEMENTATION NOTE:
// ResearchPrivacyPoolAdapter is intentionally read-only. It decodes transactions,
// calldata, and events using the STRK20 Privacy Pool ABI supplied by the team.
// This is the bridge for learning the real flow before the private SDK is available.
export class ResearchPrivacyPoolAdapter implements PrivacyPoolAdapter {
  readonly mode = "research";
  readonly analyzer: PrivacyPoolTransactionAnalyzer;
  readonly abi: StarknetAbi;

  constructor(config: ResearchPrivacyPoolAdapterConfig = {}) {
    this.abi = config.abi ?? PRIVACY_POOL_EVENT_ABI;
    const analyzerConfig: PrivacyPoolTransactionAnalyzerConfig = {
      abi: this.abi,
    };
    if (config.rpcUrl) analyzerConfig.rpcUrl = config.rpcUrl;
    if (config.privacyPoolAddress) analyzerConfig.privacyPoolAddress = config.privacyPoolAddress;
    if (config.helperAddress) analyzerConfig.helperAddress = config.helperAddress;
    this.analyzer = new PrivacyPoolTransactionAnalyzer(analyzerConfig);
  }

  async analyzeTransaction(transactionHash: string): Promise<PrivacyPoolTransactionAnalysis> {
    return this.analyzer.analyzeTransaction({ transactionHash });
  }

  decodeTransaction(transaction: RawStarknetTransaction) {
    return decodeTransactionCalldata(transaction);
  }

  decodeEvents(events: readonly RawStarknetEvent[]) {
    return events.map((event) => decodePrivacyPoolEvent(event, { abi: this.abi }));
  }

  decodeInvokeExternalPayload(calldata: readonly string[]): PrivacyPoolAdapterActionResult {
    return {
      adapterMode: this.mode,
      action: "InvokeExternal",
      calldata,
      notes: [
        calldata.length >= 4
          ? "Looks like VEIL helper invoke calldata: channel_id, event_type, encrypted_payload, payload_hash."
          : "Not enough felts to identify a VEIL helper invoke payload.",
        PRIVACY_POOL_SOURCE_CONSTRAINTS.standaloneInvokeExternalLikelyReverts
          ? "Source-derived warning: InvokeExternal must be paired with a WriteOnce-producing privacy action for replay protection."
          : "InvokeExternal replay-protection requirement unknown.",
      ],
    };
  }

  async openChannel(): Promise<PrivacyPoolAdapterActionResult> {
    throw new Error(RESEARCH_ONLY_ERROR);
  }

  async openSubchannel(): Promise<PrivacyPoolAdapterActionResult> {
    throw new Error(RESEARCH_ONLY_ERROR);
  }

  async createEncryptedNote(): Promise<PrivacyPoolAdapterActionResult> {
    throw new Error(RESEARCH_ONLY_ERROR);
  }

  async prepareInvokeExternal(): Promise<PrivacyPoolAdapterActionResult> {
    throw new Error(RESEARCH_ONLY_ERROR);
  }
}
