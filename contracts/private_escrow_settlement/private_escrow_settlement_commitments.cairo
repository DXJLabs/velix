use core::poseidon::poseidon_hash_span;

/// Domain separator for release-secret commitments.
pub const PRIVATE_ESCROW_RELEASE_DOMAIN: felt252 =
    'VEIL_ESCROW_RELEASE_V1';

/// Domain separator for refund-secret commitments.
pub const PRIVATE_ESCROW_REFUND_DOMAIN: felt252 =
    'VEIL_ESCROW_REFUND_V1';

/// Bind a client-held release secret to exactly one custody commitment.
pub fn compute_private_escrow_release_commitment(
    custody_commitment: felt252,
    release_secret: felt252,
) -> felt252 {
    poseidon_hash_span(
        array![
            PRIVATE_ESCROW_RELEASE_DOMAIN,
            custody_commitment,
            release_secret,
        ]
            .span(),
    )
}

/// Bind a client-held refund secret to exactly one custody commitment.
pub fn compute_private_escrow_refund_commitment(
    custody_commitment: felt252,
    refund_secret: felt252,
) -> felt252 {
    poseidon_hash_span(
        array![
            PRIVATE_ESCROW_REFUND_DOMAIN,
            custody_commitment,
            refund_secret,
        ]
            .span(),
    )
}
