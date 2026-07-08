/// SDK-side encrypted escrow negotiation payload.
/// It is intentionally not a public buyer/seller registry.
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct EscrowPayload {
    pub deal_nonce: felt252,
    pub accepted_offer_commitment: felt252,
    pub asset_commitment: felt252,
    pub payment_commitment: felt252,
    pub buyer_deposit_commitment: felt252,
    pub seller_deposit_commitment: felt252,
    pub deadline: u64,
}
