use core::poseidon::poseidon_hash_span;
use crate::utils::constants::TIMELINE_PAYLOAD_DOMAIN;

/// Compute the domain-separated payload commitment.
///
/// Commitment:
///
/// Poseidon(
///   TIMELINE_PAYLOAD_DOMAIN,
///   conversation_tag,
///   encrypted_event_type,
///   encrypted_payload,
///   payload_chunk_count,
///   ...payload_chunks
/// )
///
/// Including `conversation_tag` prevents the same payload
/// commitment from being silently reused across unrelated
/// VEIL conversations.
pub fn compute_payload_hash(
    conversation_tag: felt252,
    encrypted_event_type: felt252,
    encrypted_payload: felt252,
    payload_chunk_count: u64,
    calldata: Span<felt252>,
) -> felt252 {
    let mut hash_input =
        ArrayTrait::<felt252>::new();

    hash_input.append(
        TIMELINE_PAYLOAD_DOMAIN,
    );

    hash_input.append(
        conversation_tag,
    );

    hash_input.append(
        encrypted_event_type,
    );

    hash_input.append(
        encrypted_payload,
    );

    hash_input.append(
        payload_chunk_count.into(),
    );

    let mut chunk_index: u64 = 0;

    loop {
        if chunk_index
            == payload_chunk_count
        {
            break;
        }

        let chunk_offset: usize =
            chunk_index
                .try_into()
                .expect('Chunk index overflow');

        let calldata_index =
            5 + chunk_offset;

        hash_input.append(
            *calldata.at(
                calldata_index,
            ),
        );

        chunk_index += 1;
    };

    poseidon_hash_span(
        hash_input.span(),
    )
}
