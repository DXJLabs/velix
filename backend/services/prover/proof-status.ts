import type {
  TransactionProverClient,
  TransactionProverHealthSnapshot,
} from "#veil-sdk/transaction-prover";

export interface ProverStatusResponse {
  schemaVersion: "veil-prover-status-v1";
  status: TransactionProverHealthSnapshot["status"];
  mode: TransactionProverHealthSnapshot["mode"];
  processReachable: boolean;
  rpcResponding: boolean;
  rpcSchemaCompatible: boolean;
  proverVersionCompatible: boolean;
  sdkVersionCompatible: boolean;
  poolVersionCompatible: boolean;
  chainCompatible: boolean;
  transactionCompatible: boolean;
  authorizationCompatible: boolean;
  readyToAcceptProofJobs: boolean;
  degraded: boolean;
  retryCount: number;
  reasons: TransactionProverHealthSnapshot["reasons"];
  localProofVerified: false;
  canonicalPrepared: false;
  liveVerified: false;
  shieldEnabled: false;
}

export async function getProverStatus(
  client: TransactionProverClient,
  requestId: string,
  signal?: AbortSignal,
): Promise<ProverStatusResponse> {
  const snapshot = await client.checkHealth({
    requestId,
    ...(signal === undefined ? {} : { signal }),
  });

  return Object.freeze({
    schemaVersion: "veil-prover-status-v1",
    status: snapshot.status,
    mode: snapshot.mode,
    processReachable: snapshot.processReachable,
    rpcResponding: snapshot.rpcResponding,
    rpcSchemaCompatible: snapshot.rpcSchemaCompatible,
    proverVersionCompatible: snapshot.proverVersionCompatible,
    sdkVersionCompatible: snapshot.sdkVersionCompatible,
    poolVersionCompatible: snapshot.poolVersionCompatible,
    chainCompatible: snapshot.chainCompatible,
    transactionCompatible: snapshot.transactionCompatible,
    authorizationCompatible: snapshot.authorizationCompatible,
    readyToAcceptProofJobs: snapshot.readyToAcceptProofJobs,
    degraded: snapshot.degraded,
    retryCount: snapshot.retryCount,
    reasons: snapshot.reasons,
    localProofVerified: snapshot.localProofVerified,
    canonicalPrepared: snapshot.canonicalPrepared,
    liveVerified: snapshot.liveVerified,
    shieldEnabled: snapshot.shieldEnabled,
  });
}
