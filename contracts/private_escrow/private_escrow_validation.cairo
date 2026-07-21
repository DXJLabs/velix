use crate::utils::constants::{
    MAX_PRIVATE_ESCROW_PAYLOAD_CHUNKS,
    VEIL_PRIVATE_ESCROW_ENVELOPE_VERSION,
};
use crate::utils::errors;

/// Validate the public structure of one encrypted VEIL Private Escrow action.
///
/// This function validates only:
///
/// - supported envelope version;
/// - required non-zero public fields;
/// - non-empty ciphertext;
/// - ciphertext storage bounds.
///
/// It does not:
///
/// - decrypt the payload;
/// - identify escrow participants;
/// - interpret the encrypted action kind;
/// - validate private escrow lifecycle transitions;
/// - validate private expiry;
/// - authorize escrow participants;
/// - establish Privacy Pool replay protection.
pub fn assert_valid_private_escrow_action_header(
    envelope_version: u8,
    private_escrow_action_locator: felt252,
    payload_commitment: felt252,
    payload_chunk_count: u64,
) {
    assert(
        envelope_version == VEIL_PRIVATE_ESCROW_ENVELOPE_VERSION,
        errors::UNSUPPORTED_PRIVATE_ESCROW_ENVELOPE_VERSION,
    );

    assert(
        private_escrow_action_locator != 0,
        errors::ZERO_PRIVATE_ESCROW_ACTION_LOCATOR,
    );

    assert(
        payload_commitment != 0,
        errors::ZERO_PRIVATE_ESCROW_PAYLOAD_COMMITMENT,
    );

    assert(
        payload_chunk_count > 0,
        errors::EMPTY_PRIVATE_ESCROW_PAYLOAD,
    );

    assert(
        payload_chunk_count <= MAX_PRIVATE_ESCROW_PAYLOAD_CHUNKS,
        errors::TOO_MANY_PRIVATE_ESCROW_PAYLOAD_CHUNKS,
    );
}

/// Require that an encrypted Private Escrow action exists before its record or
/// ciphertext chunks are returned.
///
/// Cairo storage maps return default values for keys that were never written,
/// so an explicit existence map is required to distinguish a missing action
/// from an all-zero record.
pub fn assert_private_escrow_action_exists(
    private_escrow_action_exists: bool,
) {
    assert(
        private_escrow_action_exists,
        errors::PRIVATE_ESCROW_ACTION_NOT_FOUND,
    );
}

/// Reject reuse of a one-time encrypted Private Escrow action locator.
///
/// A locator identifies exactly one encrypted action. It must never be
/// overwritten or reused for another payload.
pub fn assert_private_escrow_action_not_stored(
    private_escrow_action_exists: bool,
) {
    assert(
        !private_escrow_action_exists,
        errors::PRIVATE_ESCROW_ACTION_LOCATOR_ALREADY_USED,
    );
}

/// Reject reuse of an encrypted Private Escrow envelope commitment.
///
/// This is helper-level duplicate protection only. It does not replace the
/// official Privacy Pool requirement that the containing transaction obtain
/// replay protection through a protocol WriteOnce action.
pub fn assert_private_escrow_payload_not_committed(
    is_committed: bool,
) {
    assert(
        !is_committed,
        errors::PRIVATE_ESCROW_PAYLOAD_ALREADY_COMMITTED,
    );
}

/// Validate an index into the ciphertext chunks of an existing Private Escrow action.
pub fn assert_valid_private_escrow_chunk_index(
    chunk_index: u64,
    payload_chunk_count: u64,
) {
    assert(
        chunk_index < payload_chunk_count,
        errors::PRIVATE_ESCROW_CHUNK_INDEX_OUT_OF_BOUNDS,
    );
}
