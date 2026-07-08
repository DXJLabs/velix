use crate::utils::errors;
use crate::utils::constants::MAX_PAYLOAD_CHUNKS;

pub fn assert_valid_timeline_header(
    conversation_tag: felt252,
    payload_hash: felt252,
    payload_chunk_count: u64,
) {
    assert(conversation_tag != 0, errors::ZERO_CONVERSATION_TAG);
    assert(payload_hash != 0, errors::ZERO_PAYLOAD_HASH);
    assert(payload_chunk_count <= MAX_PAYLOAD_CHUNKS, errors::TOO_MANY_PAYLOAD_CHUNKS);
}

pub fn assert_valid_event_index(index: u64, count: u64) {
    assert(index < count, errors::EVENT_INDEX_OUT_OF_BOUNDS);
}

pub fn assert_valid_chunk_index(index: u64, count: u64) {
    assert(index < count, errors::CHUNK_INDEX_OUT_OF_BOUNDS);
}
