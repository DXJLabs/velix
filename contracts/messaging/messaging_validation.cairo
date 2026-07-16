use crate::utils::constants::MAX_PAYLOAD_CHUNKS;
use crate::utils::errors;

pub fn assert_valid_timeline_header(
    conversation_tag: felt252, payload_hash: felt252, payload_chunk_count: u64,
) {
    assert(conversation_tag != 0, errors::ZERO_CONVERSATION_TAG);
    assert(payload_hash != 0, errors::ZERO_PAYLOAD_HASH);
    assert(payload_chunk_count <= MAX_PAYLOAD_CHUNKS, errors::TOO_MANY_PAYLOAD_CHUNKS);
}

/// Reject exact ciphertext replays under one opaque conversation tag.
///
/// This is deliberately narrower than participant authentication: it prevents
/// submitting the same committed envelope twice, but does not make the direct
/// fallback participant-authenticated or prove the still-unverified pure-chat
/// Privacy Pool action pattern.
pub fn assert_payload_not_committed(is_committed: bool) {
    assert(!is_committed, errors::TIMELINE_REPLAY);
}

pub fn assert_valid_event_index(index: u64, count: u64) {
    assert(index < count, errors::EVENT_INDEX_OUT_OF_BOUNDS);
}

pub fn assert_valid_chunk_index(index: u64, count: u64) {
    assert(index < count, errors::CHUNK_INDEX_OUT_OF_BOUNDS);
}
