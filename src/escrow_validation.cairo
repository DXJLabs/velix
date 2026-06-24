use starknet::ContractAddress;
use crate::escrow_types::EscrowStatus;

pub fn assert_only_buyer(caller: ContractAddress, buyer: ContractAddress) {
    assert(caller == buyer, 'Only buyer');
}

pub fn assert_only_seller(caller: ContractAddress, seller: ContractAddress) {
    assert(caller == seller, 'Only seller');
}

pub fn assert_participant(
    caller: ContractAddress, buyer: ContractAddress, seller: ContractAddress,
) {
    assert(caller == buyer || caller == seller, 'Only participant');
}

pub fn assert_active(status: EscrowStatus) {
    match status {
        EscrowStatus::Active => (),
        _ => core::panic_with_felt252('Not active'),
    }
}

pub fn assert_not_completed(status: EscrowStatus) {
    match status {
        EscrowStatus::Completed => core::panic_with_felt252('Already completed'),
        _ => (),
    }
}

pub fn assert_can_cancel(status: EscrowStatus) {
    match status {
        EscrowStatus::Created => (),
        _ => core::panic_with_felt252('Cannot cancel'),
    }
}

pub fn assert_can_activate(
    status: EscrowStatus, buyer_deposited: bool, seller_deposited: bool,
) {
    match status {
        EscrowStatus::Created => (),
        _ => core::panic_with_felt252('Cannot activate'),
    };
    assert(buyer_deposited, 'Buyer not deposited');
    assert(seller_deposited, 'Seller not deposited');
}

pub fn assert_non_zero_address(address: ContractAddress) {
    let zero_address: ContractAddress = 0.try_into().unwrap();
    assert(address != zero_address, 'Zero address');
}

pub fn assert_valid_status_transition(current: EscrowStatus, next: EscrowStatus) {
    let is_valid = match current {
        EscrowStatus::Created => {
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

    assert(is_valid, 'Invalid transition');
}
