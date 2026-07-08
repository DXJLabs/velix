use starknet::ContractAddress;
use crate::utils::errors;
use crate::utils::validation::assert_non_zero_address;

pub fn assert_valid_settlement(
    note_id: felt252,
    token: ContractAddress,
    amount: u128,
    settlement_commitment: felt252,
) {
    assert(note_id != 0, errors::ZERO_NOTE_ID);
    assert_non_zero_address(token);
    assert(amount != 0, errors::ZERO_AMOUNT);
    assert(settlement_commitment != 0, errors::INVALID_SETTLEMENT_COMMITMENT);
}
