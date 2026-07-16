/// Minimal public event emitted when one encrypted VEIL message is stored.
///
/// PRIVACY:
/// - `message_locator` must be unique to one message.
/// - It must never be reused as a conversation, channel, deal, sender, or
///   recipient identifier.
/// - Message type, private sequence, participants, and content remain inside
///   authenticated ciphertext.
///
/// PUBLIC METADATA:
/// - one helper invocation occurred;
/// - the one-time message locator;
/// - the encrypted-envelope commitment;
/// - transaction and block timing.
#[derive(Drop, starknet::Event)]
pub struct MessageCommitted {
    /// One-time opaque locator used by clients and indexers to retrieve the
    /// encrypted message record and its ciphertext chunks.
    #[key]
    pub message_locator: felt252,

    /// Domain-separated Poseidon commitment to the complete encrypted envelope.
    pub payload_commitment: felt252,
}
