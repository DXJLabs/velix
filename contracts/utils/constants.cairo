/// Maximum number of ciphertext chunks accepted by the VEIL messaging helper.
///
/// This limit bounds calldata size, storage writes, and execution cost.
/// It is a protocol maximum, not a recommended message size.
///
/// The production value must later be confirmed through gas, proving-time,
/// storage-cost, and indexer-performance benchmarks.
pub const MAX_PAYLOAD_CHUNKS: u64 = 64;

/// Current version of the public encrypted-message envelope.
///
/// Changing the calldata layout or commitment input order requires:
/// - a new envelope version;
/// - a new commitment domain;
/// - synchronized SDK and contract updates.
pub const VEIL_MESSAGE_ENVELOPE_VERSION: u8 = 1;

/// Number of fixed felt fields before ciphertext chunks.
///
/// Calldata layout:
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
pub const VEIL_MESSAGE_COMMITMENT_DOMAIN: felt252 = 'VEIL_MSG_COMMIT_V1';

/// Existing application commitment domains.
///
/// These remain unchanged until the Offer, Escrow, and Settlement modules are
/// audited separately.
pub const OFFER_COMMITMENT_DOMAIN: felt252 = 'VEIL_OFFER_V1';
pub const ESCROW_COMMITMENT_DOMAIN: felt252 = 'VEIL_ESCROW_V1';
pub const SETTLEMENT_COMMITMENT_DOMAIN: felt252 = 'VEIL_SETTLE_V1';
