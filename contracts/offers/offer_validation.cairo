use starknet::ContractAddress;
use crate::offers::offer_types::OfferStatus;

/// Assert that a felt252 value is non-zero.
pub fn assert_non_zero(
    value: felt252,
    message: felt252,
) {
    assert(value != 0, message);
}

/// Assert that a contract address is non-zero.
pub fn assert_non_zero_address(
    address: ContractAddress,
) {
    let zero_address: ContractAddress =
        0.try_into().unwrap();

    assert(
        address != zero_address,
        'Zero address',
    );
}

/// Assert that maker and taker are different parties.
pub fn assert_different_parties(
    maker: ContractAddress,
    taker: ContractAddress,
) {
    assert(
        maker != taker,
        'Same party',
    );
}

/// Assert that the caller is either maker or taker.
pub fn assert_participant(
    caller: ContractAddress,
    maker: ContractAddress,
    taker: ContractAddress,
) {
    assert(
        caller == maker || caller == taker,
        'Only participant',
    );
}

/// Assert that the caller is the maker.
pub fn assert_maker(
    caller: ContractAddress,
    maker: ContractAddress,
) {
    assert(
        caller == maker,
        'Only maker',
    );
}

/// Assert that the caller is the taker.
pub fn assert_taker(
    caller: ContractAddress,
    taker: ContractAddress,
) {
    assert(
        caller == taker,
        'Only taker',
    );
}

/// Assert that the offer is currently open.
///
/// Countered offers are terminal because a counter-offer
/// must create a new Offer record.
pub fn assert_open(
    status: OfferStatus,
) {
    match status {
        OfferStatus::Open => (),
        _ => core::panic_with_felt252(
            'Offer not open',
        ),
    }
}

/// Assert that the offer can be countered.
///
/// Only an Open offer can produce a new counter-offer.
pub fn assert_can_counter(
    status: OfferStatus,
) {
    match status {
        OfferStatus::Open => (),
        _ => core::panic_with_felt252(
            'Cannot counter',
        ),
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
