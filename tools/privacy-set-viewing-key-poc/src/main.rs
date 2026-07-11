use std::fs;
use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use serde_json::json;
use starknet_core::types::Felt;
use veil_privacy_poc::{
    artifact_json, build_final_apply_actions_tx, build_private_invoke, compute_contract_class_hash,
    compute_message_hash, derive_public_key, felt_hex, final_summary, generate_privacy_private_key,
    generate_scalar, parse_felt, proof_facts_info, prove_transaction, read_secret_env,
    recover_server_actions_from_l2_message, redact_private_tx, selector, sign_final_tx, sign_hash,
    validate_rpc, DEFAULT_PROVER_URL, DEFAULT_RPC_V10, PRIVACY_POOL_ADDRESS,
};

#[derive(Parser)]
#[command(name = "veil-privacy-poc")]
#[command(about = "Local-only VEIL Privacy Pool SetViewingKey proof adapter")]
struct Cli {
    #[arg(long, env = "VEIL_POC_RPC_URL", default_value = DEFAULT_RPC_V10)]
    rpc_url: String,
    #[arg(long, env = "VEIL_POC_PROVER_URL", default_value = DEFAULT_PROVER_URL)]
    prover_url: String,
    #[arg(long, env = "VEIL_POC_PRIVACY_POOL", default_value = PRIVACY_POOL_ADDRESS)]
    privacy_pool: String,
    #[arg(
        long,
        env = "VEIL_POC_OUT_DIR",
        default_value = "tools/privacy-set-viewing-key-poc/target/poc-artifacts"
    )]
    out_dir: PathBuf,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Inspect,
    BuildPrivate {
        #[arg(long)]
        user_address: String,
        #[arg(long, default_value = "0x0")]
        nonce: String,
    },
    Prove {
        #[arg(long)]
        user_address: String,
        #[arg(long, default_value = "latest")]
        block_id: String,
        #[arg(long, default_value = "0x0")]
        nonce: String,
    },
    BuildFinal {
        #[arg(long)]
        submitter_address: String,
        #[arg(long)]
        pool_class_hash: String,
        #[arg(long)]
        proof_response: PathBuf,
        #[arg(long, default_value = "0x0")]
        nonce: String,
    },
    ValidateRpc,
    ClassHash {
        #[arg(long)]
        artifact: PathBuf,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match &cli.command {
        Command::Inspect => inspect(&cli),
        Command::BuildPrivate {
            user_address,
            nonce,
        } => build_private(&cli, user_address, nonce),
        Command::Prove {
            user_address,
            block_id,
            nonce,
        } => prove(&cli, user_address, block_id, nonce),
        Command::BuildFinal {
            submitter_address,
            pool_class_hash,
            proof_response,
            nonce,
        } => build_final(
            &cli,
            submitter_address,
            pool_class_hash,
            proof_response,
            nonce,
        ),
        Command::ValidateRpc => validate(&cli),
        Command::ClassHash { artifact } => class_hash(artifact),
    }
}

fn inspect(cli: &Cli) -> Result<()> {
    let caps = validate_rpc(&cli.rpc_url, &cli.privacy_pool)?;
    println!("{}", artifact_json(&caps)?);
    Ok(())
}

fn build_private(cli: &Cli, user_address: &str, nonce: &str) -> Result<()> {
    fs::create_dir_all(&cli.out_dir)?;
    let pool = parse_felt(&cli.privacy_pool)?;
    let user = parse_felt(user_address)?;
    let nonce = parse_felt(nonce)?;
    let user_private_key = generate_privacy_private_key()?;
    let random = generate_scalar()?;
    let user_public_key = derive_public_key(&user_private_key)?;
    let virtual_unsigned =
        build_private_invoke(&pool, &user, &user_private_key, &random, &nonce, vec![])?;
    let virtual_hash = veil_privacy_poc::invoke_v3_hash(&virtual_unsigned, None)?;
    let account_key = read_secret_env("VEIL_POC_ACCOUNT_PRIVATE_KEY")
        .context("private tx signing requires a valid deployed user account key in env")?;
    let signature = sign_hash(&account_key, &virtual_hash)?;
    let tx = build_private_invoke(&pool, &user, &user_private_key, &random, &nonce, signature)?;
    let redacted = json!({
        "user_address": felt_hex(&user),
        "derived_public_key": felt_hex(&user_public_key),
        "virtual_tx_hash": felt_hex(&virtual_hash),
        "redacted_tx": redact_private_tx(&tx)
    });
    write_artifact(cli, "private-redacted.json", &redacted)?;
    println!("{}", artifact_json(&redacted)?);
    Ok(())
}

fn prove(cli: &Cli, user_address: &str, block_id: &str, nonce: &str) -> Result<()> {
    fs::create_dir_all(&cli.out_dir)?;
    let pool = parse_felt(&cli.privacy_pool)?;
    let user = parse_felt(user_address)?;
    let nonce = parse_felt(nonce)?;
    let user_private_key = generate_privacy_private_key()?;
    let random = generate_scalar()?;
    let virtual_unsigned =
        build_private_invoke(&pool, &user, &user_private_key, &random, &nonce, vec![])?;
    let virtual_hash = veil_privacy_poc::invoke_v3_hash(&virtual_unsigned, None)?;
    let account_key = read_secret_env("VEIL_POC_ACCOUNT_PRIVATE_KEY")
        .context("proving requires user account key for Privacy Pool __execute__ signature")?;
    let signature = sign_hash(&account_key, &virtual_hash)?;
    let tx = build_private_invoke(&pool, &user, &user_private_key, &random, &nonce, signature)?;
    let block = if block_id == "latest" {
        json!("latest")
    } else {
        json!({ "block_number": block_id.parse::<u64>()? })
    };
    let response = prove_transaction(&cli.prover_url, &tx, block)?;
    if response.proof.is_empty() || response.proof_facts.is_empty() {
        bail!("prover returned empty proof or proof_facts");
    }
    let facts = proof_facts_info(&response.proof_facts)?;
    veil_privacy_poc::assert_proof_facts_header(&facts)?;
    let safe_response = json!({
        "proof": response.proof,
        "proof_facts": response.proof_facts,
        "l2_to_l1_messages": response.l2_to_l1_messages,
        "proof_facts_info": facts
    });
    write_artifact(cli, "prove-response.json", &safe_response)?;
    println!("{}", artifact_json(&safe_response)?);
    Ok(())
}

fn build_final(
    cli: &Cli,
    submitter_address: &str,
    pool_class_hash: &str,
    proof_response_path: &PathBuf,
    nonce: &str,
) -> Result<()> {
    fs::create_dir_all(&cli.out_dir)?;
    let response_json: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(proof_response_path)?)?;
    let response: veil_privacy_poc::ProveTransactionResponse = serde_json::from_value(json!({
        "proof": response_json.get("proof").cloned().unwrap_or_default(),
        "proof_facts": response_json.get("proof_facts").cloned().unwrap_or_default(),
        "l2_to_l1_messages": response_json.get("l2_to_l1_messages").cloned().unwrap_or_default()
    }))?;
    if response.l2_to_l1_messages.len() != 1 {
        bail!(
            "expected exactly one L2->L1 message, got {}",
            response.l2_to_l1_messages.len()
        );
    }
    let pool = parse_felt(&cli.privacy_pool)?;
    let pool_class_hash = parse_felt(pool_class_hash)?;
    let server_actions =
        recover_server_actions_from_l2_message(&pool_class_hash, &response.l2_to_l1_messages[0])?;
    let computed_hash = compute_message_hash(&pool, &pool_class_hash, &server_actions)?;
    let facts = proof_facts_info(&response.proof_facts)?;
    let committed_hash = facts
        .message_hashes
        .first()
        .ok_or_else(|| anyhow::anyhow!("proof_facts did not include a message hash"))?;
    if felt_hex(&computed_hash) != *committed_hash {
        bail!(
            "message hash mismatch: computed {}, proof {}",
            felt_hex(&computed_hash),
            committed_hash
        );
    }
    let submitter = parse_felt(submitter_address)?;
    let nonce = parse_felt(nonce)?;
    let tx = build_final_apply_actions_tx(
        &submitter,
        &pool,
        &server_actions,
        &response.proof,
        &response.proof_facts,
        &nonce,
    )?;
    let account_key = read_secret_env("VEIL_POC_ACCOUNT_PRIVATE_KEY")
        .context("final signing requires submitter account key in env")?;
    let (signed_tx, hash_without, final_hash) = sign_final_tx(tx, &account_key)?;
    let summary = final_summary(&signed_tx, &hash_without, &final_hash);
    write_artifact(cli, "final-transaction.json", &signed_tx)?;
    write_artifact(cli, "final-summary.json", &summary)?;
    println!("{}", artifact_json(&summary)?);
    Ok(())
}

fn validate(cli: &Cli) -> Result<()> {
    let caps = validate_rpc(&cli.rpc_url, &cli.privacy_pool)?;
    println!("{}", artifact_json(&caps)?);
    Ok(())
}

fn class_hash(artifact: &PathBuf) -> Result<()> {
    let hash = compute_contract_class_hash(artifact)?;
    println!(
        "{}",
        artifact_json(&json!({
            "artifact": artifact.display().to_string(),
            "class_hash": felt_hex(&hash)
        }))?
    );
    Ok(())
}

fn write_artifact<T: serde::Serialize>(cli: &Cli, name: &str, value: &T) -> Result<()> {
    let path = cli.out_dir.join(name);
    fs::write(path, artifact_json(value)?)?;
    Ok(())
}

#[allow(dead_code)]
fn _selector_probe() -> Felt {
    selector("apply_actions")
}
