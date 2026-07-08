/// Maximum ciphertext chunks accepted by the VEIL timeline helper.
///
/// This is a storage-abuse and execution-cost boundary. The helper accepts
/// opaque encrypted payload chunks, so this bound is the contract-level guard
/// against unbounded calldata being persisted through either the Privacy Pool
/// `InvokeExternal` path or the direct helper path.
pub const MAX_PAYLOAD_CHUNKS: u64 = 64;

/// Domain separator for the VEIL timeline payload commitment.
///
/// SDK and contract hashing must use this exact felt and input order so payload
/// commitments remain compatible across local signing, indexer verification,
/// and on-chain validation.
pub const TIMELINE_PAYLOAD_DOMAIN: felt252 = 'VEIL_TIMELINE_V1';

pub const OFFER_COMMITMENT_DOMAIN: felt252 = 'VEIL_OFFER_V1';
pub const ESCROW_COMMITMENT_DOMAIN: felt252 = 'VEIL_ESCROW_V1';
pub const SETTLEMENT_COMMITMENT_DOMAIN: felt252 = 'VEIL_SETTLE_V1';
