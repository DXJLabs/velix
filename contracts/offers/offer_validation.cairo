use crate::utils::constants::{
    MAX_OFFER_PAYLOAD_CHUNKS,
    VEIL_OFFER_ENVELOPE_VERSION,
};
use crate::utils::errors;

/// Validate the public structure of one encrypted VEIL Offer action.
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
/// - identify maker or taker;
/// - interpret the encrypted action kind;
/// - validate offer lifecycle transitions;
/// - validate private expiry;
/// - authorize negotiation participants;
/// - establish Privacy Pool replay protection.
pub fn assert_valid_offer_action_header(
    envelope_version: u8,
    offer_action_locator: felt252,
    payload_commitment: felt252,
    payload_chunk_count: u64,
) {
    assert(
        envelope_version == VEIL_OFFER_ENVELOPE_VERSION,
        errors::UNSUPPORTED_OFFER_ENVELOPE_VERSION,
    );

    assert(
        offer_action_locator != 0,
        errors::ZERO_OFFER_ACTION_LOCATOR,
    );

    assert(
        payload_commitment != 0,
        errors::ZERO_OFFER_PAYLOAD_COMMITMENT,
    );

    assert(
        payload_chunk_count > 0,
        errors::EMPTY_OFFER_PAYLOAD,
    );

    assert(
        payload_chunk_count <= MAX_OFFER_PAYLOAD_CHUNKS,
        errors::TOO_MANY_OFFER_PAYLOAD_CHUNKS,
    );
}

/// Require that an encrypted Offer action exists before its record or
/// ciphertext chunks are returned.
///
/// Cairo storage maps return default values for keys that were never written,
/// so an explicit existence map is required to distinguish a missing action
/// from an all-zero record.
pub fn assert_offer_action_exists(
    offer_action_exists: bool,
) {
    assert(
        offer_action_exists,
        errors::OFFER_ACTION_NOT_FOUND,
    );
}

/// Reject reuse of a one-time encrypted Offer action locator.
///
/// A locator identifies exactly one encrypted action. It must never be
/// overwritten or reused for another payload.
pub fn assert_offer_action_not_stored(
    offer_action_exists: bool,
) {
    assert(
        !offer_action_exists,
        errors::OFFER_ACTION_LOCATOR_ALREADY_USED,
    );
}

/// Reject reuse of an encrypted Offer envelope commitment.
///
/// This is helper-level duplicate protection only. It does not replace the
/// official Privacy Pool requirement that the containing transaction obtain
/// replay protection through a protocol WriteOnce action.
pub fn assert_offer_payload_not_committed(
    is_committed: bool,
) {
    assert(
        !is_committed,
        errors::OFFER_PAYLOAD_ALREADY_COMMITTED,
    );
}

/// Validate an index into the ciphertext chunks of an existing Offer action.
pub fn assert_valid_offer_chunk_index(
    chunk_index: u64,
    payload_chunk_count: u64,
) {
    assert(
        chunk_index < payload_chunk_count,
        errors::OFFER_CHUNK_INDEX_OUT_OF_BOUNDS,
    );
}
