use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::path::Path;
use std::str::FromStr;
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use starknet_core::types::contract::ContractArtifact;
use starknet_core::types::Felt;
use starknet_core::utils::get_selector_from_name;
use starknet_crypto::{get_public_key, poseidon_hash_many, sign};

pub const PRIVACY_POOL_ADDRESS: &str =
    "0x03a91bc44040f4173f30f3233d3cb2510aa05a0b74c22a5ee8240a313a0c8de5";
pub const DEFAULT_RPC_V10: &str = "https://api.zan.top/public/starknet-sepolia/rpc/v0_10";
pub const DEFAULT_PROVER_URL: &str = "http://127.0.0.1:3000";

const STARK_ORDER_HEX: &str = "0x0800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2f";
const STARK_HALF_ORDER_HEX: &str =
    "0x04000000000000087fffffffffffffffdbc08936e573d9190f335120d6e32697";
const INVOKE: &str = "invoke";
const SN_SEPOLIA: &str = "SN_SEPOLIA";
const VIRTUAL_SNOS_HEX: &str = "0x5649525455414c5f534e4f53";
const VIRTUAL_SNOS0_HEX: &str = "0x5649525455414c5f534e4f5330";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResourceBounds {
    pub max_amount: u64,
    pub max_price_per_unit: u128,
}

impl ResourceBounds {
    pub fn zero() -> Self {
        Self {
            max_amount: 0,
            max_price_per_unit: 0,
        }
    }

    pub fn l2_for_private_proving() -> Self {
        Self {
            max_amount: 100_000_000,
            max_price_per_unit: 0,
        }
    }

    pub fn new(max_amount: u64, max_price_per_unit: u128) -> Self {
        Self {
            max_amount,
            max_price_per_unit,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResourceBoundsMap {
    pub l1_gas: ResourceBounds,
    pub l2_gas: ResourceBounds,
    pub l1_data_gas: ResourceBounds,
}

impl Default for ResourceBoundsMap {
    fn default() -> Self {
        Self {
            l1_gas: ResourceBounds::zero(),
            l2_gas: ResourceBounds::l2_for_private_proving(),
            l1_data_gas: ResourceBounds::zero(),
        }
    }
}

impl ResourceBoundsMap {
    pub fn final_apply_actions_for_validation() -> Self {
        Self {
            l1_gas: ResourceBounds::new(1_000_000, 500_000_000_000_000),
            l2_gas: ResourceBounds::new(200_000_000, 100_000_000_000),
            l1_data_gas: ResourceBounds::new(10_000, 5_000_000_000_000),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InvokeV3 {
    #[serde(rename = "type")]
    pub tx_type: String,
    pub version: String,
    pub sender_address: String,
    pub calldata: Vec<String>,
    pub signature: Vec<String>,
    pub nonce: String,
    pub resource_bounds: RpcResourceBoundsMap,
    pub tip: String,
    pub paymaster_data: Vec<String>,
    pub account_deployment_data: Vec<String>,
    pub nonce_data_availability_mode: String,
    pub fee_data_availability_mode: String,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub proof_facts: Vec<String>,
    #[serde(skip_serializing_if = "String::is_empty", default)]
    pub proof: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RpcResourceBounds {
    pub max_amount: String,
    pub max_price_per_unit: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RpcResourceBoundsMap {
    pub l1_gas: RpcResourceBounds,
    pub l2_gas: RpcResourceBounds,
    pub l1_data_gas: RpcResourceBounds,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RedactedPrivateTx {
    pub tx_type: String,
    pub version: String,
    pub sender_address: String,
    pub calldata_shape: String,
    pub signature_len: usize,
    pub nonce: String,
    pub proof_empty: bool,
    pub proof_facts_empty: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProofFactsInfo {
    pub len: usize,
    pub proof_version: String,
    pub program_variant: String,
    pub virtual_program_hash: Option<String>,
    pub os_output_version: Option<String>,
    pub base_block_number: Option<String>,
    pub base_block_hash: Option<String>,
    pub config_hash: Option<String>,
    pub message_count: Option<usize>,
    pub message_hashes: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProveTransactionResponse {
    pub proof: String,
    pub proof_facts: Vec<String>,
    pub l2_to_l1_messages: Vec<L2ToL1Message>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct L2ToL1Message {
    pub from_address: String,
    pub to_address: String,
    pub payload: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FinalTxSummary {
    pub target: String,
    pub selector: String,
    pub calldata_felts: usize,
    pub proof_present: bool,
    pub proof_facts_len: usize,
    pub hash_without_proof_facts: String,
    pub final_hash: String,
    pub signature_len: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RpcCapabilities {
    pub spec_version: String,
    pub chain_id: String,
    pub get_class_at_ok: bool,
    pub entrypoints: BTreeMap<String, bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RpcCallError {
    pub code: Option<i64>,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct JsonRpcRequest<P> {
    jsonrpc: &'static str,
    id: u64,
    method: String,
    params: P,
}

#[derive(Clone, Debug, Deserialize)]
struct JsonRpcResponse<T> {
    result: Option<T>,
    error: Option<RpcCallError>,
}

#[derive(Clone, Debug, Serialize)]
struct ProveParams<'a> {
    block_id: serde_json::Value,
    transaction: &'a InvokeV3,
}

pub fn parse_felt(value: &str) -> Result<Felt> {
    if value.starts_with("0x") || value.starts_with("0X") {
        Felt::from_hex(value).map_err(|e| anyhow!("invalid hex felt {value}: {e}"))
    } else {
        Felt::from_dec_str(value).map_err(|e| anyhow!("invalid decimal felt {value}: {e}"))
    }
}

pub fn felt_hex(felt: &Felt) -> String {
    format!("{:#x}", felt)
}

pub fn short_string_felt(value: &str) -> Felt {
    Felt::from_bytes_be_slice(value.as_bytes())
}

pub fn selector(name: &str) -> Felt {
    get_selector_from_name(name).expect("selector name is valid ascii")
}

pub fn validate_scalar(scalar: &Felt) -> Result<()> {
    let order = parse_felt(STARK_ORDER_HEX)?;
    if *scalar == Felt::ZERO {
        bail!("scalar must be non-zero");
    }
    if scalar >= &order {
        bail!("scalar must be lower than Stark curve order");
    }
    Ok(())
}

pub fn validate_privacy_private_key(scalar: &Felt) -> Result<()> {
    validate_scalar(scalar)?;
    let half_order = parse_felt(STARK_HALF_ORDER_HEX)?;
    if scalar >= &half_order {
        bail!("privacy private key must be canonical, lower than Stark curve order / 2");
    }
    Ok(())
}

pub fn generate_scalar() -> Result<Felt> {
    loop {
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);
        let scalar = Felt::from_bytes_be(&bytes);
        if validate_scalar(&scalar).is_ok() {
            return Ok(scalar);
        }
    }
}

pub fn generate_privacy_private_key() -> Result<Felt> {
    loop {
        let scalar = generate_scalar()?;
        if validate_privacy_private_key(&scalar).is_ok() {
            return Ok(scalar);
        }
    }
}

pub fn derive_public_key(private_scalar: &Felt) -> Result<Felt> {
    validate_privacy_private_key(private_scalar)?;
    Ok(get_public_key(private_scalar))
}

pub fn encode_set_viewing_key_client_actions(random: &Felt) -> Result<Vec<Felt>> {
    if *random == Felt::ZERO {
        bail!("SetViewingKey.random must be non-zero");
    }
    Ok(vec![Felt::ONE, Felt::ZERO, *random])
}

pub fn encode_compile_actions_calldata(
    user_addr: &Felt,
    user_private_key: &Felt,
    random: &Felt,
) -> Result<Vec<Felt>> {
    validate_privacy_private_key(user_private_key)?;
    let mut out = vec![*user_addr, *user_private_key];
    out.extend(encode_set_viewing_key_client_actions(random)?);
    Ok(out)
}

pub fn encode_account_call_array(pool: &Felt, compile_calldata: &[Felt]) -> Vec<Felt> {
    let mut out = vec![
        Felt::ONE,
        *pool,
        selector("compile_actions"),
        Felt::from(compile_calldata.len()),
    ];
    out.extend_from_slice(compile_calldata);
    out
}

pub fn build_private_invoke(
    pool_address: &Felt,
    user_address: &Felt,
    user_private_key: &Felt,
    random: &Felt,
    nonce: &Felt,
    signature: Vec<Felt>,
) -> Result<InvokeV3> {
    let compile_calldata = encode_compile_actions_calldata(user_address, user_private_key, random)?;
    let account_calldata = encode_account_call_array(pool_address, &compile_calldata);
    Ok(InvokeV3 {
        tx_type: "INVOKE".to_string(),
        version: "0x3".to_string(),
        sender_address: felt_hex(pool_address),
        calldata: felts_to_hex(&account_calldata),
        signature: felts_to_hex(&signature),
        nonce: felt_hex(nonce),
        resource_bounds: ResourceBoundsMap::default().into(),
        tip: "0x0".to_string(),
        paymaster_data: vec![],
        account_deployment_data: vec![],
        nonce_data_availability_mode: "L1".to_string(),
        fee_data_availability_mode: "L1".to_string(),
        proof_facts: vec![],
        proof: String::new(),
    })
}

pub fn redact_private_tx(tx: &InvokeV3) -> RedactedPrivateTx {
    RedactedPrivateTx {
        tx_type: tx.tx_type.clone(),
        version: tx.version.clone(),
        sender_address: tx.sender_address.clone(),
        calldata_shape:
            "Call[1] -> privacy_pool.compile_actions(user_addr, <redacted user_private_key>, [SetViewingKey(random)])"
                .to_string(),
        signature_len: tx.signature.len(),
        nonce: tx.nonce.clone(),
        proof_empty: tx.proof.is_empty(),
        proof_facts_empty: tx.proof_facts.is_empty(),
    }
}

impl From<ResourceBoundsMap> for RpcResourceBoundsMap {
    fn from(value: ResourceBoundsMap) -> Self {
        Self {
            l1_gas: value.l1_gas.into(),
            l2_gas: value.l2_gas.into(),
            l1_data_gas: value.l1_data_gas.into(),
        }
    }
}

impl From<ResourceBounds> for RpcResourceBounds {
    fn from(value: ResourceBounds) -> Self {
        Self {
            max_amount: format!("{:#x}", value.max_amount),
            max_price_per_unit: format!("{:#x}", value.max_price_per_unit),
        }
    }
}

pub fn felts_to_hex(values: &[Felt]) -> Vec<String> {
    values.iter().map(felt_hex).collect()
}

pub fn hex_to_felts(values: &[String]) -> Result<Vec<Felt>> {
    values.iter().map(|v| parse_felt(v)).collect()
}

fn hash_chain(values: &[Felt]) -> Felt {
    poseidon_hash_many(values)
}

fn concat_resource(name: &[u8; 7], bounds: &ResourceBounds) -> Felt {
    let mut bytes = [0u8; 32];
    bytes[1..8].copy_from_slice(name);
    bytes[8..16].copy_from_slice(&bounds.max_amount.to_be_bytes());
    bytes[16..32].copy_from_slice(&bounds.max_price_per_unit.to_be_bytes());
    Felt::from_bytes_be(&bytes)
}

fn tip_resource_bounds_hash(bounds: &ResourceBoundsMap, tip: u64) -> Felt {
    let l1_name = *b"\0L1_GAS";
    let l2_name = *b"\0L2_GAS";
    let l1_data_name = *b"L1_DATA";
    hash_chain(&[
        Felt::from(tip),
        concat_resource(&l1_name, &bounds.l1_gas),
        concat_resource(&l2_name, &bounds.l2_gas),
        concat_resource(&l1_data_name, &bounds.l1_data_gas),
    ])
}

fn da_mode_felt(nonce_l1: bool, fee_l1: bool) -> Felt {
    let nonce = if nonce_l1 { 0u64 } else { 1u64 };
    let fee = if fee_l1 { 0u64 } else { 1u64 };
    Felt::from(fee + (nonce << 32))
}

pub fn invoke_v3_hash(tx: &InvokeV3, proof_facts_override: Option<&[String]>) -> Result<Felt> {
    let bounds = rpc_bounds_to_internal(&tx.resource_bounds)?;
    let proof_facts = match proof_facts_override {
        Some(v) => v.to_vec(),
        None => tx.proof_facts.clone(),
    };
    let paymaster = hex_to_felts(&tx.paymaster_data)?;
    let account_deployment = hex_to_felts(&tx.account_deployment_data)?;
    let calldata = hex_to_felts(&tx.calldata)?;
    let mut chain = vec![
        short_string_felt(INVOKE),
        parse_felt(&tx.version)?,
        parse_felt(&tx.sender_address)?,
        tip_resource_bounds_hash(&bounds, parse_u64_hex(&tx.tip)?),
        hash_chain(&paymaster),
        short_string_felt(SN_SEPOLIA),
        parse_felt(&tx.nonce)?,
        da_mode_felt(
            tx.nonce_data_availability_mode == "L1",
            tx.fee_data_availability_mode == "L1",
        ),
        hash_chain(&account_deployment),
        hash_chain(&calldata),
    ];
    if !proof_facts.is_empty() {
        chain.push(hash_chain(&hex_to_felts(&proof_facts)?));
    }
    Ok(hash_chain(&chain))
}

fn parse_u64_hex(value: &str) -> Result<u64> {
    let trimmed = value.strip_prefix("0x").unwrap_or(value);
    u64::from_str_radix(trimmed, 16).map_err(|e| anyhow!("invalid u64 hex {value}: {e}"))
}

fn rpc_bounds_to_internal(value: &RpcResourceBoundsMap) -> Result<ResourceBoundsMap> {
    Ok(ResourceBoundsMap {
        l1_gas: rpc_bound_to_internal(&value.l1_gas)?,
        l2_gas: rpc_bound_to_internal(&value.l2_gas)?,
        l1_data_gas: rpc_bound_to_internal(&value.l1_data_gas)?,
    })
}

fn rpc_bound_to_internal(value: &RpcResourceBounds) -> Result<ResourceBounds> {
    Ok(ResourceBounds {
        max_amount: parse_u64_hex(&value.max_amount)?,
        max_price_per_unit: parse_u128_hex(&value.max_price_per_unit)?,
    })
}

fn parse_u128_hex(value: &str) -> Result<u128> {
    let trimmed = value.strip_prefix("0x").unwrap_or(value);
    u128::from_str_radix(trimmed, 16).map_err(|e| anyhow!("invalid u128 hex {value}: {e}"))
}

pub fn sign_hash(account_private_key: &Felt, hash: &Felt) -> Result<Vec<Felt>> {
    validate_scalar(account_private_key)?;
    let k = generate_scalar()?;
    let signature = sign(account_private_key, hash, &k).map_err(|e| anyhow!("sign failed: {e}"))?;
    Ok(vec![signature.r, signature.s])
}

pub fn proof_facts_info(proof_facts: &[String]) -> Result<ProofFactsInfo> {
    let felts = hex_to_felts(proof_facts)?;
    if felts.len() < 8 {
        bail!("proof_facts too short: {}", felts.len());
    }
    let message_count = felt_to_usize(&felts[7]).ok();
    let hashes = match message_count {
        Some(count) if felts.len() >= 8 + count => {
            felts[8..8 + count].iter().map(felt_hex).collect()
        }
        _ => vec![],
    };
    Ok(ProofFactsInfo {
        len: felts.len(),
        proof_version: felt_hex(&felts[0]),
        program_variant: felt_hex(&felts[1]),
        virtual_program_hash: Some(felt_hex(&felts[2])),
        os_output_version: Some(felt_hex(&felts[3])),
        base_block_number: Some(felt_hex(&felts[4])),
        base_block_hash: Some(felt_hex(&felts[5])),
        config_hash: Some(felt_hex(&felts[6])),
        message_count,
        message_hashes: hashes,
    })
}

fn felt_to_usize(value: &Felt) -> Result<usize> {
    let bytes = value.to_bytes_be();
    if bytes[..24].iter().any(|b| *b != 0) {
        bail!("felt does not fit usize");
    }
    let mut tail = [0u8; 8];
    tail.copy_from_slice(&bytes[24..]);
    Ok(u64::from_be_bytes(tail) as usize)
}

pub fn assert_proof_facts_header(info: &ProofFactsInfo) -> Result<()> {
    let expected_variant = felt_hex(&parse_felt(VIRTUAL_SNOS_HEX)?);
    let expected_output = felt_hex(&parse_felt(VIRTUAL_SNOS0_HEX)?);
    if info.program_variant != expected_variant {
        bail!("invalid program variant: {}", info.program_variant);
    }
    if info.os_output_version.as_deref() != Some(expected_output.as_str()) {
        bail!("invalid OS output version: {:?}", info.os_output_version);
    }
    Ok(())
}

pub fn recover_server_actions_from_l2_message(
    pool_class_hash: &Felt,
    message: &L2ToL1Message,
) -> Result<Vec<String>> {
    let payload = hex_to_felts(&message.payload)?;
    if payload.first() != Some(pool_class_hash) {
        bail!("L2->L1 payload class hash does not match deployed pool class hash");
    }
    // Payload is `[privacy_pool_class_hash, serialized Span<ServerAction>]`.
    // The returned value already includes the Cairo Span length felt.
    Ok(felts_to_hex(&payload[1..]))
}

pub fn compute_message_hash(
    pool_address: &Felt,
    pool_class_hash: &Felt,
    server_actions: &[String],
) -> Result<Felt> {
    let serialized_actions = hex_to_felts(server_actions)?;
    let mut payload = vec![*pool_class_hash];
    payload.extend(serialized_actions);
    let mut message = vec![*pool_address, Felt::ZERO, Felt::from(payload.len())];
    message.extend(payload);
    Ok(hash_chain(&message))
}

pub fn build_final_apply_actions_tx(
    submitter_address: &Felt,
    pool_address: &Felt,
    server_actions: &[String],
    proof: &str,
    proof_facts: &[String],
    nonce: &Felt,
) -> Result<InvokeV3> {
    // `server_actions` is already the full ABI calldata for
    // `apply_actions(actions: Span<ServerAction>)`, including the Span length.
    let mut calldata = vec![
        Felt::ONE,
        *pool_address,
        selector("apply_actions"),
        Felt::from(server_actions.len()),
    ];
    calldata.extend(hex_to_felts(server_actions)?);
    Ok(InvokeV3 {
        tx_type: "INVOKE".to_string(),
        version: "0x3".to_string(),
        sender_address: felt_hex(submitter_address),
        calldata: felts_to_hex(&calldata),
        signature: vec![],
        nonce: felt_hex(nonce),
        resource_bounds: ResourceBoundsMap::final_apply_actions_for_validation().into(),
        tip: "0x0".to_string(),
        paymaster_data: vec![],
        account_deployment_data: vec![],
        nonce_data_availability_mode: "L1".to_string(),
        fee_data_availability_mode: "L1".to_string(),
        proof_facts: proof_facts.to_vec(),
        proof: proof.to_string(),
    })
}

pub fn sign_final_tx(
    mut tx: InvokeV3,
    account_private_key: &Felt,
) -> Result<(InvokeV3, Felt, Felt)> {
    let hash_without = invoke_v3_hash(&tx, Some(&[]))?;
    let final_hash = invoke_v3_hash(&tx, None)?;
    if hash_without == final_hash && !tx.proof_facts.is_empty() {
        bail!("final hash unexpectedly did not change after proof_facts");
    }
    tx.signature = felts_to_hex(&sign_hash(account_private_key, &final_hash)?);
    Ok((tx, hash_without, final_hash))
}

pub fn final_summary(tx: &InvokeV3, hash_without: &Felt, final_hash: &Felt) -> FinalTxSummary {
    FinalTxSummary {
        target: PRIVACY_POOL_ADDRESS.to_string(),
        selector: felt_hex(&selector("apply_actions")),
        calldata_felts: tx.calldata.len(),
        proof_present: !tx.proof.is_empty(),
        proof_facts_len: tx.proof_facts.len(),
        hash_without_proof_facts: felt_hex(hash_without),
        final_hash: felt_hex(final_hash),
        signature_len: tx.signature.len(),
    }
}

pub fn ensure_localhost(url: &str) -> Result<()> {
    let parsed = reqwest::Url::parse(url)?;
    let host = parsed.host_str().unwrap_or_default();
    if !matches!(host, "127.0.0.1" | "localhost" | "::1") {
        bail!("prover URL must be localhost, got {host}");
    }
    Ok(())
}

pub fn rpc_call<T: for<'de> Deserialize<'de>, P: Serialize>(
    url: &str,
    method: &str,
    params: P,
) -> Result<T> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60 * 60))
        .build()?;
    let req = JsonRpcRequest {
        jsonrpc: "2.0",
        id: 1,
        method: method.to_string(),
        params,
    };
    let resp: JsonRpcResponse<T> = client
        .post(url)
        .json(&req)
        .send()
        .with_context(|| format!("RPC request failed: {method}"))?
        .json()
        .with_context(|| format!("RPC response decode failed: {method}"))?;
    if let Some(error) = resp.error {
        bail!("RPC {method} failed: {}", error.message);
    }
    resp.result
        .ok_or_else(|| anyhow!("RPC {method} returned no result"))
}

pub fn prove_transaction(
    prover_url: &str,
    tx: &InvokeV3,
    block_id: serde_json::Value,
) -> Result<ProveTransactionResponse> {
    ensure_localhost(prover_url)?;
    if !tx.proof.is_empty() || !tx.proof_facts.is_empty() {
        bail!("transaction prover input must have empty proof and proof_facts");
    }
    let params = ProveParams {
        block_id,
        transaction: tx,
    };
    rpc_call(prover_url, "starknet_proveTransaction", params)
}

pub fn validate_rpc(url: &str, pool: &str) -> Result<RpcCapabilities> {
    let spec_version: String = rpc_call(url, "starknet_specVersion", Vec::<String>::new())?;
    let chain_id: String = rpc_call(url, "starknet_chainId", Vec::<String>::new())?;
    let class: serde_json::Value = rpc_call(
        url,
        "starknet_getClassAt",
        serde_json::json!(["latest", pool]),
    )?;
    let abi = class.get("abi").cloned().unwrap_or(serde_json::Value::Null);
    let mut entrypoints = BTreeMap::new();
    for name in [
        "__execute__",
        "compile_actions",
        "apply_actions",
        "get_public_key",
    ] {
        entrypoints.insert(name.to_string(), abi_contains_function(&abi, name));
    }
    Ok(RpcCapabilities {
        spec_version,
        chain_id,
        get_class_at_ok: true,
        entrypoints,
    })
}

pub fn compute_contract_class_hash(path: &Path) -> Result<Felt> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("failed to read contract artifact {}", path.display()))?;
    let artifact: ContractArtifact = serde_json::from_str(&raw)
        .with_context(|| format!("failed to parse contract artifact {}", path.display()))?;
    match artifact {
        ContractArtifact::SierraClass(class) => class.class_hash().map_err(Into::into),
        ContractArtifact::CompiledClass(class) => class.class_hash().map_err(Into::into),
        ContractArtifact::LegacyClass(class) => class.class_hash().map_err(Into::into),
    }
}

fn abi_contains_function(value: &serde_json::Value, name: &str) -> bool {
    match value {
        serde_json::Value::String(raw) => serde_json::from_str::<serde_json::Value>(raw)
            .map(|parsed| abi_contains_function(&parsed, name))
            .unwrap_or_else(|_| raw.contains(&format!("\"name\": \"{name}\""))),
        serde_json::Value::Object(map) => {
            map.get("type").and_then(|v| v.as_str()) == Some("function")
                && map.get("name").and_then(|v| v.as_str()) == Some(name)
                || map.values().any(|v| abi_contains_function(v, name))
        }
        serde_json::Value::Array(values) => values.iter().any(|v| abi_contains_function(v, name)),
        _ => false,
    }
}

pub fn artifact_json<T: Serialize>(value: &T) -> Result<String> {
    Ok(serde_json::to_string_pretty(value)?)
}

pub fn read_secret_env(name: &str) -> Result<Felt> {
    let value = std::env::var(name)
        .map_err(|_| anyhow!("{name} is required and must not be passed as a CLI argument"))?;
    let felt = parse_felt(value.trim())?;
    validate_scalar(&felt)?;
    Ok(felt)
}

impl fmt::Display for RpcCallError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.code {
            Some(code) => write!(f, "{code}: {}", self.message),
            None => write!(f, "{}", self.message),
        }
    }
}

impl FromStr for InvokeV3 {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        Ok(serde_json::from_str(s)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_viewing_key_encoding_matches_cairo_serde_shape() {
        let random = Felt::from(7u64);
        let encoded = encode_set_viewing_key_client_actions(&random).unwrap();
        assert_eq!(encoded, vec![Felt::ONE, Felt::ZERO, random]);
    }

    #[test]
    fn zero_scalar_rejected() {
        assert!(validate_scalar(&Felt::ZERO).is_err());
    }

    #[test]
    fn derived_public_key_is_nonzero_for_fixture() {
        let private = parse_felt("0x12345").unwrap();
        let public = derive_public_key(&private).unwrap();
        assert_ne!(public, Felt::ZERO);
    }

    #[test]
    fn private_invoke_shape_has_empty_proof_fields() {
        let pool = parse_felt(PRIVACY_POOL_ADDRESS).unwrap();
        let user = parse_felt("0x123").unwrap();
        let key = parse_felt("0x456").unwrap();
        let random = parse_felt("0x789").unwrap();
        let tx = build_private_invoke(
            &pool,
            &user,
            &key,
            &random,
            &Felt::ZERO,
            vec![Felt::ONE, Felt::TWO],
        )
        .unwrap();
        assert_eq!(tx.sender_address, felt_hex(&pool));
        assert!(tx.proof.is_empty());
        assert!(tx.proof_facts.is_empty());
        assert_eq!(tx.signature.len(), 2);
        assert_eq!(tx.calldata[0], "0x1");
    }

    #[test]
    fn proof_facts_header_deserializes() {
        let facts = vec![
            "0x50524f4f4631".to_string(),
            VIRTUAL_SNOS_HEX.to_string(),
            "0x111".to_string(),
            VIRTUAL_SNOS0_HEX.to_string(),
            "0x10".to_string(),
            "0x20".to_string(),
            "0x30".to_string(),
            "0x1".to_string(),
            "0xabc".to_string(),
        ];
        let info = proof_facts_info(&facts).unwrap();
        assert_eq!(info.message_count, Some(1));
        assert_eq!(info.message_hashes, vec!["0xabc"]);
        assert_proof_facts_header(&info).unwrap();
    }

    #[test]
    fn apply_actions_calldata_excludes_proof_facts() {
        let submitter = parse_felt("0x123").unwrap();
        let pool = parse_felt(PRIVACY_POOL_ADDRESS).unwrap();
        let actions = vec!["0x2".to_string(), "0x4".to_string(), "0x5".to_string()];
        let facts = vec![
            "0x1".to_string(),
            VIRTUAL_SNOS_HEX.to_string(),
            "0x2".to_string(),
        ];
        let tx = build_final_apply_actions_tx(
            &submitter,
            &pool,
            &actions,
            "proof-bytes",
            &facts,
            &Felt::ZERO,
        )
        .unwrap();
        assert!(!tx
            .calldata
            .windows(facts.len())
            .any(|window| window == facts));
        assert_eq!(tx.proof_facts, facts);
        assert_eq!(tx.calldata[3], "0x3");
        assert_eq!(tx.calldata[4], "0x2");
    }

    #[test]
    fn final_hash_includes_proof_facts() {
        let submitter = parse_felt("0x123").unwrap();
        let pool = parse_felt(PRIVACY_POOL_ADDRESS).unwrap();
        let actions = vec!["0x2".to_string(), "0x4".to_string(), "0x5".to_string()];
        let facts = vec![
            "0x50524f4f4631".to_string(),
            VIRTUAL_SNOS_HEX.to_string(),
            "0x2".to_string(),
            VIRTUAL_SNOS0_HEX.to_string(),
            "0x3".to_string(),
            "0x4".to_string(),
            "0x5".to_string(),
            "0x0".to_string(),
            "0x1".to_string(),
            "0x9".to_string(),
        ];
        let tx = build_final_apply_actions_tx(
            &submitter,
            &pool,
            &actions,
            "proof-bytes",
            &facts,
            &Felt::ZERO,
        )
        .unwrap();
        let without = invoke_v3_hash(&tx, Some(&[])).unwrap();
        let with = invoke_v3_hash(&tx, None).unwrap();
        assert_ne!(without, with);
    }

    #[test]
    fn l2_message_recovery_keeps_serialized_server_action_span() {
        let class_hash = parse_felt("0xabc").unwrap();
        let message = L2ToL1Message {
            from_address: "0x1".to_string(),
            to_address: "0x0".to_string(),
            payload: vec![
                "0xabc".to_string(),
                "0x2".to_string(),
                "0x4".to_string(),
                "0x5".to_string(),
            ],
        };
        let actions = recover_server_actions_from_l2_message(&class_hash, &message).unwrap();
        assert_eq!(actions, vec!["0x2", "0x4", "0x5"]);

        let pool = parse_felt(PRIVACY_POOL_ADDRESS).unwrap();
        let expected = compute_message_hash(&pool, &class_hash, &actions).unwrap();
        let payload = vec![
            class_hash,
            Felt::from(2u64),
            Felt::from(4u64),
            Felt::from(5u64),
        ];
        let mut raw_message = vec![pool, Felt::ZERO, Felt::from(payload.len())];
        raw_message.extend(payload);
        assert_eq!(expected, poseidon_hash_many(&raw_message));
    }

    #[test]
    fn localhost_guard_rejects_remote_prover() {
        assert!(ensure_localhost("https://example.com").is_err());
        assert!(ensure_localhost("http://127.0.0.1:3000").is_ok());
    }
}
