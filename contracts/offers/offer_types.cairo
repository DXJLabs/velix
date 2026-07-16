/// Persisted public record for one encrypted VEIL Offer action.
///
/// One record represents exactly one encrypted application-level action, such
/// as create, counter, accept, reject, cancel, expire, or escrow coordination.
///
/// The helper does not parse or publicly store the action semantics.
///
/// This record contains no:
///
/// - maker or taker address;
/// - public action kind;
/// - stable offer id;
/// - conversation or deal-room identifier;
/// - root or parent offer relationship;
/// - public lifecycle status;
/// - asset, payment, price, terms, or expiry;
/// - escrow identifier or participant relationship.
///
/// Ciphertext chunks are stored separately under:
///
/// `(offer_action_locator, chunk_index)`.
///
/// `offer_action_locator` must be unique for every encrypted Offer action. It
/// identifies one action only and must not be reused as a stable offer,
/// conversation, channel, participant, deal-room, or escrow identifier.
///
/// Helper-level locator and commitment uniqueness do not replace the official
/// Privacy Pool replay-protection requirement. The containing pool transaction
/// must independently include the protocol-required WriteOnce action.
///
/// InvokeExternal calldata, including ciphertext, remains public on-chain.
/// Confidentiality depends on VEIL encrypting the complete Offer payload before
/// constructing the calldata.
#[derive(
    Copy,
    Drop,
    Serde,
    PartialEq,
    Debug,
    starknet::Store,
)]
pub struct EncryptedOfferActionRecord {
    /// Version of the encrypted Offer envelope and commitment format.
    pub envelope_version: u8,

    /// One-time opaque locator used to retrieve this encrypted Offer action.
    pub offer_action_locator: felt252,

    /// Domain-separated Poseidon commitment to the envelope fields and every
    /// ciphertext chunk.
    pub payload_commitment: felt252,

    /// Number of ciphertext chunks stored for this Offer action.
    pub payload_chunk_count: u64,
}
