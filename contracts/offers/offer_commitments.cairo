use core::poseidon::poseidon_hash_span;
use crate::utils::constants::OFFER_COMMITMENT_DOMAIN;

/// Separate domain for encrypted offer actions submitted through the pinned
/// Privacy Pool. Keeping this distinct from the direct Offer commitment avoids
/// cross-protocol commitment reuse.
pub const SHIELDED_OFFER_ACTION_DOMAIN: felt252 = 'VEIL_PRIVATE_OFFER_ACTION_V1';

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

pub fn compute_shielded_offer_action_commitment(
    action_kind: felt252,
    conversation_tag: felt252,
    encrypted_payload_commitment: felt252,
    valid_until: u64,
    replay_nullifier: felt252,
) -> felt252 {
    let data = array![
        SHIELDED_OFFER_ACTION_DOMAIN,
        action_kind,
        conversation_tag,
        encrypted_payload_commitment,
        valid_until.into(),
        replay_nullifier,
    ];
    poseidon_hash_span(data.span())
}
