use core::poseidon::poseidon_hash_span;

use crate::utils::constants::{
    PRIVATE_ESCROW_ENVELOPE_HEADER_FELTS,
    VEIL_PRIVATE_ESCROW_COMMITMENT_DOMAIN,
};

/// Compute the domain-separated commitment for one encrypted VEIL Private Escrow action.
///
/// Commitment format:
///
/// Poseidon(
///     VEIL_PRIVATE_ESCROW_COMMITMENT_DOMAIN,
///     envelope_version,
///     private_escrow_action_locator,
///     payload_chunk_count,
///     ...ciphertext_chunks
/// )
///
/// SECURITY:
///
/// - the encrypted-envelope version is committed;
/// - the one-time action locator is committed;
/// - the declared ciphertext length is committed;
/// - ciphertext ordering is committed;
/// - changing any ciphertext chunk changes the commitment;
/// - the claimed commitment field itself is not hashed;
/// - Private Escrow lifecycle semantics remain inside ciphertext.
///
/// The caller must validate the exact calldata length before invoking this
/// function.
///
/// Calldata layout:
///
/// 0. envelope_version
/// 1. private_escrow_action_locator
/// 2. claimed_payload_commitment
/// 3. payload_chunk_count
/// 4... ciphertext_chunks
///
/// Helper-level commitment uniqueness does not replace the Privacy Pool's
/// protocol-level WriteOnce replay-protection requirement.
pub fn compute_private_escrow_action_commitment(
    envelope_version: u8,
    private_escrow_action_locator: felt252,
    payload_chunk_count: u64,
    calldata: Span<felt252>,
) -> felt252 {
    let mut hash_input = ArrayTrait::<felt252>::new();

    hash_input.append(VEIL_PRIVATE_ESCROW_COMMITMENT_DOMAIN);
    hash_input.append(envelope_version.into());
    hash_input.append(private_escrow_action_locator);
    hash_input.append(payload_chunk_count.into());

    let mut chunk_index: u64 = 0;

    loop {
        if chunk_index == payload_chunk_count {
            break;
        }

        let chunk_offset: usize = chunk_index
            .try_into()
            .expect('Private Escrow chunk overflow');

        let calldata_index =
            PRIVATE_ESCROW_ENVELOPE_HEADER_FELTS + chunk_offset;

        hash_input.append(
            *calldata.at(calldata_index),
        );

        chunk_index += 1;
    };

    poseidon_hash_span(hash_input.span())
}
