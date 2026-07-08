use core::poseidon::poseidon_hash_span;
use crate::utils::constants::ESCROW_COMMITMENT_DOMAIN;

pub fn compute_escrow_commitment(
    conversation_tag: felt252,
    deal_nonce: felt252,
    accepted_offer_commitment: felt252,
    asset_commitment: felt252,
    payment_commitment: felt252,
    buyer_deposit_commitment: felt252,
    seller_deposit_commitment: felt252,
    deadline: u64,
) -> felt252 {
    let data = array![
        ESCROW_COMMITMENT_DOMAIN,
        conversation_tag,
        deal_nonce,
        accepted_offer_commitment,
        asset_commitment,
        payment_commitment,
        buyer_deposit_commitment,
        seller_deposit_commitment,
        deadline.into(),
    ];
    poseidon_hash_span(data.span())
}
