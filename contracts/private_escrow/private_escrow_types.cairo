/// Persisted public record for one encrypted VEIL Private Escrow action.
///
/// One record represents exactly one encrypted application-level action, such
/// as create, accept, funding intent, funding confirmation, activation, release, refund, cancel, dispute, or resolution.
///
/// The helper does not parse or publicly store the action semantics.
///
/// This record contains no:
///
/// - participant address;
/// - public action kind;
/// - stable private escrow id;
/// - conversation or deal-room identifier;
/// - root or parent escrow action relationship;
/// - public lifecycle status;
/// - asset, payment, funding, settlement terms, or expiry;
/// - escrow identifier or participant relationship.
///
/// Ciphertext chunks are stored separately under:
///
/// `(private_escrow_action_locator, chunk_index)`.
///
/// `private_escrow_action_locator` must be unique for every encrypted Private Escrow action. It
/// identifies one action only and must not be reused as a stable private escrow,
/// conversation, channel, participant, deal-room, or escrow identifier.
///
/// Helper-level locator and commitment uniqueness do not replace the official
/// Privacy Pool replay-protection requirement. The containing pool transaction
/// must independently include the protocol-required WriteOnce action.
///
/// InvokeExternal calldata, including ciphertext, remains public on-chain.
/// Confidentiality depends on VEIL encrypting the complete Private Escrow payload before
/// constructing the calldata.
#[derive(
    Copy,
    Drop,
    Serde,
    PartialEq,
    Debug,
    starknet::Store,
)]
pub struct EncryptedPrivateEscrowActionRecord {
    /// Version of the encrypted Private Escrow envelope and commitment format.
    pub envelope_version: u8,

    /// One-time opaque locator used to retrieve this encrypted Private Escrow action.
    pub private_escrow_action_locator: felt252,

    /// Domain-separated Poseidon commitment to the envelope fields and every
    /// ciphertext chunk.
    pub payload_commitment: felt252,

    /// Number of ciphertext chunks stored for this Private Escrow action.
    pub payload_chunk_count: u64,
}
