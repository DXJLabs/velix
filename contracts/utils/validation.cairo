use starknet::ContractAddress;
use crate::utils::errors;

pub fn assert_non_zero(value: felt252) {
    assert(value != 0, errors::ZERO_PAYLOAD_HASH);
}

pub fn assert_non_zero_address(address: ContractAddress) {
    let zero: ContractAddress = 0.try_into().unwrap();
    assert(address != zero, errors::ZERO_ADDRESS);
}

pub fn assert_deadline_in_future(deadline: u64, now: u64) {
    assert(deadline == 0 || deadline > now, 'INVALID_DEADLINE');
}
