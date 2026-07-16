/// Persisted public record for one encrypted VEIL message.
///
/// The record contains no sender address, recipient address, reusable
/// conversation identifier, plaintext message kind, or plaintext content.
///
/// Ciphertext chunks are stored separately under:
/// `(message_locator, chunk_index)`.
///
/// `message_locator` must be unique for every message. The VEIL SDK derives
/// and tracks it from private channel state; the helper only enforces that the
/// same locator cannot be stored twice.
///
/// The zero-value encrypted note used as the Privacy Pool replay anchor is
/// created in the same proved action batch and is not referenced publicly by
/// this helper.
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct VeilMessageRecord {
    /// Version of the encrypted-message envelope and commitment format.
    pub envelope_version: u8,

    /// One-time opaque locator used to retrieve this message.
    pub message_locator: felt252,

    /// Domain-separated Poseidon commitment to the envelope fields and all
    /// ciphertext chunks.
    pub payload_commitment: felt252,

    /// Number of ciphertext chunks stored for this message.
    pub payload_chunk_count: u64,
}
