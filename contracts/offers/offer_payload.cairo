/// Plain SDK-side schema that MUST be encrypted before it is appended to the
/// shielded timeline. The helper contract never parses these fields.
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct OfferPayload {
    pub offer_nonce: felt252,
    pub asset_type_commitment: felt252,
    pub asset_commitment: felt252,
    pub payment_commitment: felt252,
    pub price_commitment: felt252,
    pub terms_hash: felt252,
    pub expires_at: u64,
}

#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct CounterOfferPayload {
    pub root_offer_nonce: felt252,
    pub parent_offer_nonce: felt252,
    pub price_commitment: felt252,
    pub terms_hash: felt252,
    pub expires_at: u64,
}
