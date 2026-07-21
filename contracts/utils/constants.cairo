// -----------------------------------------------------------------------------
// Encrypted messaging helper
// -----------------------------------------------------------------------------

/// Maximum number of ciphertext chunks accepted by the VEIL messaging helper.
///
/// This bounds:
///
/// - InvokeExternal calldata size;
/// - contract storage writes;
/// - execution cost;
/// - indexer retrieval cost.
///
/// This is currently an implementation limit. It must be confirmed through
/// gas, proving-time, storage-cost, and indexer-performance benchmarks before
/// being treated as a final production parameter.
pub const MAX_PAYLOAD_CHUNKS: u64 = 64;

/// Current version of the encrypted-message envelope.
///
/// Changing the calldata layout or commitment input order requires:
///
/// - a new envelope version;
/// - a new commitment domain;
/// - synchronized SDK, prover-service, indexer, and contract updates.
pub const VEIL_MESSAGE_ENVELOPE_VERSION: u8 = 1;

/// Number of fixed felt fields before encrypted-message ciphertext chunks.
///
/// Calldata layout:
///
/// 0. envelope_version
/// 1. message_locator
/// 2. claimed_payload_commitment
/// 3. payload_chunk_count
/// 4... ciphertext_chunks
pub const MESSAGE_ENVELOPE_HEADER_FELTS: usize = 4;

/// Domain separator for encrypted VEIL message commitments.
///
/// Commitment format:
///
/// Poseidon(
///     VEIL_MESSAGE_COMMITMENT_DOMAIN,
///     envelope_version,
///     message_locator,
///     payload_chunk_count,
///     ...ciphertext_chunks
/// )
///
/// The SDK and contract must use this exact value and input order.
pub const VEIL_MESSAGE_COMMITMENT_DOMAIN: felt252 =
    'VEIL_MSG_COMMIT_V1';

// -----------------------------------------------------------------------------
// Encrypted Offer helper
// -----------------------------------------------------------------------------

/// Maximum number of ciphertext chunks accepted by the VEIL Offer helper.
///
/// This is separate from `MAX_PAYLOAD_CHUNKS` so Message and Offer envelopes can
/// be benchmarked and versioned independently.
///
/// The value is currently an implementation limit and must be validated through
/// proving-time, gas, storage, calldata, and indexer benchmarks.
pub const MAX_OFFER_PAYLOAD_CHUNKS: u64 = 64;

/// Current version of the encrypted Offer action envelope.
///
/// This version describes only the public encrypted-envelope format. It does
/// not prove that a standalone Offer-only Privacy Pool transaction satisfies
/// the pool's WriteOnce replay-protection requirement.
pub const VEIL_OFFER_ENVELOPE_VERSION: u8 = 1;

/// Number of fixed felt fields before encrypted Offer ciphertext chunks.
///
/// Calldata layout:
///
/// 0. envelope_version
/// 1. offer_action_locator
/// 2. claimed_payload_commitment
/// 3. payload_chunk_count
/// 4... ciphertext_chunks
pub const OFFER_ENVELOPE_HEADER_FELTS: usize = 4;

/// Domain separator for encrypted VEIL Offer action commitments.
///
/// Commitment format:
///
/// Poseidon(
///     VEIL_OFFER_COMMITMENT_DOMAIN,
///     envelope_version,
///     offer_action_locator,
///     payload_chunk_count,
///     ...ciphertext_chunks
/// )
///
/// Offer action type, participant context, lifecycle relationships, terms,
/// expiry, and escrow coordination remain inside ciphertext.
pub const VEIL_OFFER_COMMITMENT_DOMAIN: felt252 =
    'VEIL_OFFER_COMMIT_V1';

// -----------------------------------------------------------------------------
// Encrypted Private Escrow helper
// -----------------------------------------------------------------------------

/// Maximum ciphertext chunks accepted for one encrypted Escrow action.
pub const MAX_PRIVATE_ESCROW_PAYLOAD_CHUNKS: u64 = 64;

/// Current encrypted Private Escrow envelope version.
pub const VEIL_PRIVATE_ESCROW_ENVELOPE_VERSION: u8 = 1;

/// Fixed fields before encrypted Escrow ciphertext chunks.
///
/// Layout:
/// 0. envelope_version
/// 1. private_escrow_action_locator
/// 2. claimed_payload_commitment
/// 3. payload_chunk_count
/// 4... ciphertext_chunks
pub const PRIVATE_ESCROW_ENVELOPE_HEADER_FELTS: usize = 4;

/// Domain separator for encrypted Private Escrow action commitments.
pub const VEIL_PRIVATE_ESCROW_COMMITMENT_DOMAIN: felt252 =
    'VEIL_PRIVATE_ESCROW_COMMIT_V1';

// -----------------------------------------------------------------------------
// Escrow and settlement
//
// Keep these unchanged until their modules are audited separately.
// -----------------------------------------------------------------------------

pub const ESCROW_COMMITMENT_DOMAIN: felt252 =
    'VEIL_ESCROW_V1';

pub const SETTLEMENT_COMMITMENT_DOMAIN: felt252 =
    'VEIL_SETTLE_V1';
