use starknet::ContractAddress;
use crate::escrow::escrow_types::EscrowStatus;

/// Assert that the caller is the buyer.
pub fn assert_only_buyer(
    caller: ContractAddress,
    buyer: ContractAddress,
) {
    assert(
        caller == buyer,
        'Only buyer',
    );
}

/// Assert that the caller is the seller.
pub fn assert_only_seller(
    caller: ContractAddress,
    seller: ContractAddress,
) {
    assert(
        caller == seller,
        'Only seller',
    );
}

/// Assert that the caller is one of the escrow participants.
pub fn assert_participant(
    caller: ContractAddress,
    buyer: ContractAddress,
    seller: ContractAddress,
) {
    assert(
        caller == buyer || caller == seller,
        'Only participant',
    );
}

/// Assert that the escrow is currently in Funding status.
pub fn assert_funding(
    status: EscrowStatus,
) {
    match status {
        EscrowStatus::Funding => (),
        _ => core::panic_with_felt252(
            'Not funding',
        ),
    }
}

/// Assert that the escrow is currently Active.
pub fn assert_active(
    status: EscrowStatus,
) {
    match status {
        EscrowStatus::Active => (),
        _ => core::panic_with_felt252(
            'Not active',
        ),
    }
}

/// Assert that the escrow has not completed.
pub fn assert_not_completed(
    status: EscrowStatus,
) {
    match status {
        EscrowStatus::Completed => {
            core::panic_with_felt252(
                'Already completed',
            )
        },
        _ => (),
    }
}

/// Assert that the escrow has not been cancelled.
pub fn assert_not_cancelled(
    status: EscrowStatus,
) {
    match status {
        EscrowStatus::Cancelled => {
            core::panic_with_felt252(
                'Already cancelled',
            )
        },
        _ => (),
    }
}

/// Assert that a buyer deposit can be confirmed.
///
/// Deposits are only accepted while the escrow is Funding.
pub fn assert_can_confirm_buyer_deposit(
    status: EscrowStatus,
    buyer_deposited: bool,
) {
    match status {
        EscrowStatus::Funding => (),
        _ => core::panic_with_felt252(
            'Cannot deposit',
        ),
    };

    assert(
        !buyer_deposited,
        'Buyer deposit exists',
    );
}

/// Assert that a seller deposit can be confirmed.
///
/// Deposits are only accepted while the escrow is Funding.
pub fn assert_can_confirm_seller_deposit(
    status: EscrowStatus,
    seller_deposited: bool,
) {
    match status {
        EscrowStatus::Funding => (),
        _ => core::panic_with_felt252(
            'Cannot deposit',
        ),
    };

    assert(
        !seller_deposited,
        'Seller deposit exists',
    );
}

/// Assert that the escrow can transition from Funding to Active.
///
/// Both participant deposits must already be confirmed.
pub fn assert_can_activate(
    status: EscrowStatus,
    buyer_deposited: bool,
    seller_deposited: bool,
) {
    match status {
        EscrowStatus::Funding => (),
        _ => core::panic_with_felt252(
            'Cannot activate',
        ),
    };

    assert(
        buyer_deposited,
        'Buyer not deposited',
    );

    assert(
        seller_deposited,
        'Seller not deposited',
    );
}

/// Assert that the escrow can be settled.
///
/// Only an Active escrow can enter settlement.
pub fn assert_can_settle(
    status: EscrowStatus,
) {
    match status {
        EscrowStatus::Active => (),
        _ => core::panic_with_felt252(
            'Cannot settle',
        ),
    }
}

/// Assert that the escrow can be cancelled.
///
/// Current policy:
/// - Created escrows may be cancelled.
/// - Funding escrows may be cancelled before both deposits are confirmed.
/// - Active escrows cannot be cancelled without a dedicated dispute/refund flow.
pub fn assert_can_cancel(
    status: EscrowStatus,
    buyer_deposited: bool,
    seller_deposited: bool,
) {
    match status {
        EscrowStatus::Created => (),

        EscrowStatus::Funding => {
            assert(
                !(buyer_deposited && seller_deposited),
                'Cannot cancel funded',
            );
        },

        _ => core::panic_with_felt252(
            'Cannot cancel',
        ),
    }
}

/// Assert that a felt252 identifier or commitment is non-zero.
pub fn assert_non_zero(
    value: felt252,
    message: felt252,
) {
    assert(
        value != 0,
        message,
    );
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

/// Assert that buyer and seller are different parties.
pub fn assert_different_parties(
    buyer: ContractAddress,
    seller: ContractAddress,
) {
    assert(
        buyer != seller,
        'Same party',
    );
}

/// Assert that a settlement adapter is configured.
pub fn assert_valid_settlement_adapter(
    adapter: ContractAddress,
) {
    assert_non_zero_address(adapter);
}

/// Assert that the next escrow status is a valid lifecycle transition.
///
/// Expected lifecycle:
///
/// Created
///   -> Funding
///   -> Cancelled
///
/// Funding
///   -> Active
///   -> Cancelled
///
/// Active
///   -> Completed
///
/// Completed and Cancelled are terminal.
pub fn assert_valid_status_transition(
    current: EscrowStatus,
    next: EscrowStatus,
) {
    let is_valid = match current {
        EscrowStatus::Created => {
            match next {
                EscrowStatus::Funding => true,
                EscrowStatus::Cancelled => true,
                _ => false,
            }
        },

        EscrowStatus::Funding => {
            match next {
                EscrowStatus::Active => true,
                EscrowStatus::Cancelled => true,
                _ => false,
            }
        },

        EscrowStatus::Active => {
            match next {
                EscrowStatus::Completed => true,
                _ => false,
            }
        },

        EscrowStatus::Completed => false,
        EscrowStatus::Cancelled => false,
    };

    assert(
        is_valid,
        'Invalid transition',
    );
}
