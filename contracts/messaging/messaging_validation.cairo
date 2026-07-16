use crate::utils::constants::{
    MAX_PAYLOAD_CHUNKS, VEIL_MESSAGE_ENVELOPE_VERSION,
};
use crate::utils::errors;

/// Validate the public structure of one encrypted VEIL message.
///
/// This function validates only format, required values, and storage bounds.
/// It does not decrypt the payload, identify participants, or interpret the
/// encrypted application message.
pub fn assert_valid_message_header(
    envelope_version: u8,
    message_locator: felt252,
    payload_commitment: felt252,
    payload_chunk_count: u64,
) {
    assert(
        envelope_version == VEIL_MESSAGE_ENVELOPE_VERSION,
        errors::UNSUPPORTED_ENVELOPE_VERSION,
    );

    assert(
        message_locator != 0,
        errors::ZERO_MESSAGE_LOCATOR,
    );

    assert(
        payload_commitment != 0,
        errors::ZERO_PAYLOAD_COMMITMENT,
    );

    assert(
        payload_chunk_count > 0,
        errors::EMPTY_ENCRYPTED_PAYLOAD,
    );

    assert(
        payload_chunk_count <= MAX_PAYLOAD_CHUNKS,
        errors::TOO_MANY_PAYLOAD_CHUNKS,
    );
}

/// Require that a message exists before its record or chunks are returned.
///
/// Cairo storage maps return default values for keys that were never written,
/// so the explicit existence map prevents a missing message from appearing as
/// a valid all-zero record.
pub fn assert_message_exists(message_exists: bool) {
    assert(
        message_exists,
        errors::MESSAGE_NOT_FOUND,
    );
}

/// Reject reuse of a one-time message locator.
///
/// This prevents a previously stored locator from being overwritten or reused
/// for a different encrypted payload.
pub fn assert_message_not_stored(message_exists: bool) {
    assert(
        !message_exists,
        errors::MESSAGE_LOCATOR_ALREADY_USED,
    );
}

/// Reject reuse of an encrypted-envelope commitment.
///
/// This is helper-level duplicate protection and remains separate from replay
/// protections enforced by the Privacy Pool action and proof system.
pub fn assert_payload_not_committed(is_committed: bool) {
    assert(
        !is_committed,
        errors::PAYLOAD_ALREADY_COMMITTED,
    );
}

/// Validate an index into the ciphertext chunks of an existing message.
pub fn assert_valid_chunk_index(index: u64, count: u64) {
    assert(
        index < count,
        errors::CHUNK_INDEX_OUT_OF_BOUNDS,
    );
}
