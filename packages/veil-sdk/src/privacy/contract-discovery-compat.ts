import type { DiscoveryOptions } from "@starkware-libs/starknet-privacy-sdk";
import type { ContractDiscoveryProvider, PoolContractInterface } from "@starkware-libs/starknet-privacy-sdk/testing";

export interface DevelopmentContractDiscoveryConfig {
  pool: PoolContractInterface;
  options?: DiscoveryOptions;
  developmentOnly: true;
}

/**
 * RC.2 exposes ContractDiscoveryProvider only through the official testing subpath.
 * Keep that compatibility boundary isolated and opt-in; production uses IndexerDiscoveryProvider.
 */
export async function createDevelopmentContractDiscoveryProvider(
  config: DevelopmentContractDiscoveryConfig,
): Promise<ContractDiscoveryProvider> {
  if (config.developmentOnly !== true) throw new Error("Contract discovery is development-only.");
  const { ContractDiscoveryProvider: OfficialContractDiscoveryProvider } = await import(
    "@starkware-libs/starknet-privacy-sdk/testing"
  );
  return new OfficialContractDiscoveryProvider(config.pool, config.options);
}
