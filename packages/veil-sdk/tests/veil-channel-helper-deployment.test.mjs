import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  SEPOLIA_PRIVACY_POOL_ADDRESS,
  assertDeploymentSummarySafe,
  deployVeilChannelHelper,
  runVeilChannelHelperDeployment,
} from "../../../tools/deploy-veil-channel-helper-sepolia.ts";
import { constants } from "starknet";

const CLASS_HASH = "0x123";
const COMPILED_CLASS_HASH = "0x456";
const CONTRACT_ADDRESS = "0x789";
const DEPLOYER_ADDRESS = "0xabc";
const DECLARE_TX_HASH = "0xaaa";
const DEPLOY_TX_HASH = "0xbbb";
const BLOCK_NUMBER = 777;

function deploymentArtifacts() {
  return {
    sierra: {},
    casm: {},
    classHash: CLASS_HASH,
    compiledClassHash: COMPILED_CLASS_HASH,
  };
}

function successfulReceipt() {
  return {
    finality_status: "ACCEPTED_ON_L2",
    execution_status: "SUCCEEDED",
    block_number: BLOCK_NUMBER,
    isSuccess() { return true; },
    isReverted() { return false; },
  };
}

function deploymentAccount(options = {}) {
  const calls = [];
  return {
    calls,
    async getChainId() {
      calls.push({ method: "getChainId" });
      return constants.StarknetChainId.SN_SEPOLIA;
    },
    async getClassByHash(classHash) {
      calls.push({ method: "getClassByHash", classHash });
      if (options.classAlreadyDeclared !== false) return { abi: [] };
      throw { code: 28 };
    },
    async declare(payload) {
      calls.push({ method: "declare", payload });
      return {
        transaction_hash: DECLARE_TX_HASH,
        class_hash: CLASS_HASH,
      };
    },
    async deploy(payload) {
      calls.push({ method: "deploy", payload });
      return {
        transaction_hash: DEPLOY_TX_HASH,
        contract_address: [CONTRACT_ADDRESS],
      };
    },
    async waitForTransaction(transactionHash, waitOptions) {
      calls.push({ method: "waitForTransaction", transactionHash, waitOptions });
      if (options.revertedTransactionHash === transactionHash) {
        return {
          finality_status: "ACCEPTED_ON_L2",
          execution_status: "REVERTED",
          block_number: BLOCK_NUMBER,
          isSuccess() { return false; },
          isReverted() { return true; },
        };
      }
      return successfulReceipt();
    },
    async getClassHashAt(contractAddress, blockIdentifier) {
      calls.push({ method: "getClassHashAt", contractAddress, blockIdentifier });
      return options.deployedClassHash ?? CLASS_HASH;
    },
  };
}

test("deploy_contract=false validates artifacts without creating an account", async () => {
  let accountCreations = 0;
  const result = await runVeilChannelHelperDeployment({
    VEIL_DEPLOY_CONTRACT: "false",
  }, {
    async loadArtifacts() {
      return deploymentArtifacts();
    },
    createAccount() {
      accountCreations += 1;
      throw new Error("deployment account must not be created");
    },
  });

  assert.equal(accountCreations, 0);
  assert.deepEqual(result, {
    result: "VEIL_CHANNEL_HELPER_ARTIFACTS_VALID",
    contractName: "VeilChannelHelper",
    classHash: CLASS_HASH,
    compiledClassHash: COMPILED_CLASS_HASH,
  });
});

test("class already declared continues to deployment without a declare transaction", async () => {
  const account = deploymentAccount({ classAlreadyDeclared: true });
  const summary = await deployVeilChannelHelper({
    account,
    artifacts: deploymentArtifacts(),
    deployerAddress: DEPLOYER_ADDRESS,
  });

  assert.equal(summary.declareTransactionHash, null);
  assert.equal(account.calls.some((call) => call.method === "declare"), false);
  const deployCall = account.calls.find((call) => call.method === "deploy");
  assert.deepEqual(deployCall.payload, {
    classHash: CLASS_HASH,
    constructorCalldata: [SEPOLIA_PRIVACY_POOL_ADDRESS],
    unique: true,
  });
  assert.equal(summary.contractAddress, CONTRACT_ADDRESS);
});

test("new class waits for both declare and deploy receipts", async () => {
  const account = deploymentAccount({ classAlreadyDeclared: false });
  const summary = await deployVeilChannelHelper({
    account,
    artifacts: deploymentArtifacts(),
    deployerAddress: DEPLOYER_ADDRESS,
  });

  assert.equal(summary.declareTransactionHash, DECLARE_TX_HASH);
  assert.deepEqual(
    account.calls
      .filter((call) => call.method === "waitForTransaction")
      .map((call) => call.transactionHash),
    [DECLARE_TX_HASH, DEPLOY_TX_HASH],
  );
});

test("reverted deployment receipt fails closed", async () => {
  await assert.rejects(
    () => deployVeilChannelHelper({
      account: deploymentAccount({
        classAlreadyDeclared: true,
        revertedTransactionHash: DEPLOY_TX_HASH,
      }),
      artifacts: deploymentArtifacts(),
      deployerAddress: DEPLOYER_ADDRESS,
    }),
    /not accepted and successful on L2/u,
  );
});

test("class hash verification mismatch fails closed", async () => {
  await assert.rejects(
    () => deployVeilChannelHelper({
      account: deploymentAccount({
        classAlreadyDeclared: true,
        deployedClassHash: "0x999",
      }),
      artifacts: deploymentArtifacts(),
      deployerAddress: DEPLOYER_ADDRESS,
    }),
    /does not match the declared artifact/u,
  );
});

test("deployment summary and log result never contain secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "veil-helper-deployment-"));
  const summaryPath = join(directory, "veil-channel-helper-deployment-summary.json");
  const privateKey = "synthetic-private-key-secret";
  const rpcUrl = "https://rpc.example/v0_9/synthetic-api-key";
  try {
    const result = await runVeilChannelHelperDeployment({
      VEIL_DEPLOY_CONTRACT: "true",
      VEIL_POC_ACCOUNT_ADDRESS: DEPLOYER_ADDRESS,
      VEIL_POC_ACCOUNT_PRIVATE_KEY: privateKey,
      STARKNET_SEPOLIA_RPC_URL: rpcUrl,
      VEIL_CHANNEL_HELPER_DEPLOYMENT_SUMMARY_PATH: summaryPath,
    }, {
      async loadArtifacts() {
        return deploymentArtifacts();
      },
      createAccount(config) {
        assert.equal(config.accountPrivateKey, privateKey);
        assert.equal(config.rpcUrl, rpcUrl);
        return deploymentAccount({ classAlreadyDeclared: true });
      },
    });

    const artifactText = await readFile(summaryPath, "utf8");
    const logText = JSON.stringify(result);
    for (const sensitive of [privateKey, rpcUrl, "synthetic-api-key"]) {
      assert.equal(artifactText.includes(sensitive), false);
      assert.equal(logText.includes(sensitive), false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("deployment summary contains only the allowed ordered fields", async () => {
  const summary = await deployVeilChannelHelper({
    account: deploymentAccount({ classAlreadyDeclared: true }),
    artifacts: deploymentArtifacts(),
    deployerAddress: DEPLOYER_ADDRESS,
  });

  assertDeploymentSummarySafe(summary);
  assert.deepEqual(Object.keys(summary), [
    "result",
    "network",
    "contractName",
    "classHash",
    "contractAddress",
    "declareTransactionHash",
    "deployTransactionHash",
    "finalityStatus",
    "executionStatus",
    "deployerAddress",
    "blockNumber",
  ]);
  for (const forbidden of [
    "privateKey",
    "signature",
    "calldata",
    "viewingKey",
    "environment",
    "rpcUrl",
    "apiKey",
    "secret",
  ]) {
    assert.equal(Object.hasOwn(summary, forbidden), false);
  }
});
