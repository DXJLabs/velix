#[derive(Drop, starknet::Event)]
pub struct OfferCreated {
    #[key]
    pub offer_id: felt252,

    /// Opaque application-level conversation tag.
    /// Do not use a raw wallet address, recipient address,
    /// or Canonical Privacy Pool channel identifier here.
    pub conversation_tag: felt252,

    /// Commitments only. Do not emit plaintext asset/payment/price data.
    pub asset_commitment: felt252,
    pub payment_commitment: felt252,
    pub price_commitment: felt252,

    /// Commitment/hash of the negotiated terms.
    pub terms_hash: felt252,

    pub expires_at: u64,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct CounterOfferCreated {
    #[key]
    pub offer_id: felt252,

    /// Previous offer in the negotiation chain.
    /// Intentionally not marked as #[key] to reduce public indexing/linkability.
    pub counter_of: felt252,

    pub conversation_tag: felt252,

    /// Counter-offer data remains commitment-based.
    pub price_commitment: felt252,
    pub terms_hash: felt252,

    pub expires_at: u64,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct OfferAccepted {
    #[key]
    pub offer_id: felt252,

    /// Cross-reference for the Veil conversation timeline.
    pub conversation_tag: felt252,

    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct OfferRejected {
    #[key]
    pub offer_id: felt252,

    /// Cross-reference for the Veil conversation timeline.
    pub conversation_tag: felt252,

    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct OfferCancelled {
    #[key]
    pub offer_id: felt252,

    /// Cross-reference for the Veil conversation timeline.
    pub conversation_tag: felt252,

    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct OfferExpired {
    #[key]
    pub offer_id: felt252,

    /// Cross-reference for the Veil conversation timeline.
    pub conversation_tag: felt252,

    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct OfferConvertedToEscrow {
    #[key]
    pub offer_id: felt252,

    /// Escrow cross-reference.
    /// Intentionally not marked as #[key] to reduce public indexing/linkability.
    pub escrow_id: felt252,

    /// Keeps the offer -> conversation -> escrow relationship explicit
    /// for the Veil application layer.
    pub conversation_tag: felt252,

    pub timestamp: u64,
}
