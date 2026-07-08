/// Minimal public event emitted for indexer discovery.
///
/// The event exposes only the opaque conversation tag, monotonic event id, and
/// payload commitment. Ciphertext chunks are stored in contract storage and are
/// not duplicated into logs, reducing avoidable public metadata expansion.
#[derive(Drop, starknet::Event)]
pub struct TimelineCommitmentStored {
    /// Opaque tag chosen by the application/SDK.
    #[key]
    pub conversation_tag: felt252,

    /// Monotonic event id under the tag.
    #[key]
    pub event_id: felt252,

    /// Domain-separated commitment to the encrypted payload.
    pub payload_hash: felt252,
}
