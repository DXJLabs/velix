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
}        ),
    }
}

/// Assert that the offer can be accepted.
///
/// Only the currently Open offer in the negotiation chain
/// may be accepted.
pub fn assert_can_accept(
    status: OfferStatus,
) {
    match status {
        OfferStatus::Open => (),
        _ => core::panic_with_felt252(
            'Cannot accept',
        ),
    }
}

/// Assert that the offer can be rejected.
///
/// Only an Open offer may be rejected.
pub fn assert_can_reject(
    status: OfferStatus,
) {
    match status {
        OfferStatus::Open => (),
        _ => core::panic_with_felt252(
            'Cannot reject',
        ),
    }
}

/// Assert that the offer can be cancelled.
///
/// Only an Open offer may be cancelled by its maker.
pub fn assert_can_cancel(
    status: OfferStatus,
) {
    match status {
        OfferStatus::Open => (),
        _ => core::panic_with_felt252(
            'Cannot cancel',
        ),
    }
}

/// Assert that an accepted offer can be converted to escrow.
pub fn assert_can_convert_to_escrow(
    status: OfferStatus,
) {
    match status {
        OfferStatus::Accepted => (),
        _ => core::panic_with_felt252(
            'Offer not accepted',
        ),
    }
}

/// Assert that the offer has not expired.
///
/// expires_at == 0 means no expiry.
pub fn assert_not_expired(
    expires_at: u64,
    now: u64,
) {
    assert(
        expires_at == 0 || now < expires_at,
        'Offer expired',
    );
}

/// Assert that the offer has expired.
///
/// expires_at == 0 means the offer never expires
/// and therefore cannot be materialized as Expired.
pub fn assert_expired(
    expires_at: u64,
    now: u64,
) {
    assert(
        expires_at != 0 && now >= expires_at,
        'Offer not expired',
    );
}

/// Assert that a supplied expiry is valid.
///
/// expires_at == 0 means no expiry.
pub fn assert_valid_expiry(
    expires_at: u64,
    now: u64,
) {
    assert(
        expires_at == 0 || expires_at > now,
        'Invalid expiry',
    );
}

/// Assert that a Privacy Pool action uses one of the fixed offer operation
/// identifiers. No target, selector, or nested calldata is accepted.
pub fn assert_supported_shielded_action(
    action_kind: felt252,
) {
    assert(
        action_kind == SHIELDED_CREATE_ACTION
            || action_kind == SHIELDED_COUNTER_ACTION
            || action_kind == SHIELDED_ACCEPT_ACTION
            || action_kind == SHIELDED_REJECT_ACTION
            || action_kind == SHIELDED_EXPIRE_ACTION
            || action_kind == SHIELDED_CONVERT_ACTION,
        'Invalid offer action',
    );
}

/// Assert that a status transition is valid.
pub fn assert_valid_status_transition(
    current: OfferStatus,
    next: OfferStatus,
) {
    let is_valid = match current {
        OfferStatus::Open => {
            match next {
                OfferStatus::Countered => true,
                OfferStatus::Accepted => true,
                OfferStatus::Rejected => true,
                OfferStatus::Cancelled => true,
                OfferStatus::Expired => true,
                _ => false,
            }
        },

        OfferStatus::Accepted => {
            match next {
                OfferStatus::ConvertedToEscrow => true,
                _ => false,
            }
        },

        OfferStatus::Countered => false,
        OfferStatus::Rejected => false,
        OfferStatus::Cancelled => false,
        OfferStatus::Expired => false,
        OfferStatus::ConvertedToEscrow => false,
    };

    assert(
        is_valid,
        'Invalid transition',
    );
}
