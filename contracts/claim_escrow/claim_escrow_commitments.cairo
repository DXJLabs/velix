use core::poseidon::poseidon_hash_span;

/// Client and contract commitment domain locked by the VEIL claim-link flow.
pub const CLAIM_COMMITMENT_DOMAIN: felt252 = 'VEIL_CLAIM_V1';

/// Computes the public claim commitment from a client-held non-zero secret.
///
/// The secret is deliberately the only value after the domain so the Cairo
/// implementation stays byte-for-byte compatible with the client vector:
/// `Poseidon([VEIL_CLAIM_V1, secret_felt])`.
pub fn compute_claim_commitment(secret: felt252) -> felt252 {
    poseidon_hash_span(array![CLAIM_COMMITMENT_DOMAIN, secret].span())
}
