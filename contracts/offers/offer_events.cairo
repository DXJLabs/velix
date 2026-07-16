/// Minimal public event for one encrypted VEIL Offer action.
///
/// The helper does not expose whether the ciphertext represents:
///
/// - create offer;
/// - counter offer;
/// - accept;
/// - reject;
/// - cancel;
/// - expire;
/// - escrow coordination.
///
/// All Offer semantics remain inside the encrypted payload.
///
/// `offer_action_locator` identifies exactly one encrypted action. It must not
/// be reused as a stable offer, conversation, deal-room, channel, participant,
/// or escrow identifier.
///
/// Public metadata that remains visible:
///
/// - the Offer Helper contract was invoked;
/// - one encrypted payload was stored;
/// - its one-time locator;
/// - its payload commitment;
/// - transaction and block timing.
///
/// The ciphertext itself is stored in contract storage and retrieved through
/// the helper getter functions rather than duplicated in this event.
#[derive(Drop, starknet::Event)]
pub struct OfferActionCommitted {
    /// One-time opaque locator for this encrypted Offer action.
    #[key]
    pub offer_action_locator: felt252,

    /// Domain-separated Poseidon commitment to the full encrypted envelope,
    /// including its ciphertext chunks.
    pub payload_commitment: felt252,
}
