use core::poseidon::poseidon_hash_span;
use crate::utils::constants::OFFER_COMMITMENT_DOMAIN;

pub fn compute_offer_commitment(
    conversation_tag: felt252,
    offer_nonce: felt252,
    asset_type_commitment: felt252,
    asset_commitment: felt252,
    payment_commitment: felt252,
    price_commitment: felt252,
    terms_hash: felt252,
    expires_at: u64,
) -> felt252 {
    let data = array![
        OFFER_COMMITMENT_DOMAIN,
        conversation_tag,
        offer_nonce,
        asset_type_commitment,
        asset_commitment,
        payment_commitment,
        price_commitment,
        terms_hash,
        expires_at.into(),
    ];
    poseidon_hash_span(data.span())
}
