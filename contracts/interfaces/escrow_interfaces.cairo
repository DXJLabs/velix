use starknet::ContractAddress;
use crate::escrow::escrow_types::{Escrow, EscrowStatus};

#[starknet::interface]
pub trait IVeilEscrow<TContractState> {
    fn create_escrow(
        ref self: TContractState,
        channel_id: felt252,
        seller: ContractAddress,
        asset_type: felt252,
        asset_reference: felt252,
        payment_reference: felt252,
    ) -> felt252;
    fn confirm_buyer_deposit(ref self: TContractState, escrow_id: felt252);
    fn confirm_seller_deposit(ref self: TContractState, escrow_id: felt252);
    fn activate(ref self: TContractState, escrow_id: felt252);
    fn settle(ref self: TContractState, escrow_id: felt252);
    fn cancel(ref self: TContractState, escrow_id: felt252);
    fn get_escrow(self: @TContractState, escrow_id: felt252) -> Escrow;
    fn get_status(self: @TContractState, escrow_id: felt252) -> EscrowStatus;
    fn get_escrow_count(self: @TContractState) -> u64;
}

#[starknet::interface]
pub trait ISettlementAdapter<TContractState> {
    fn validate_settlement_reference(
        self: @TContractState,
        escrow_id: felt252,
        channel_id: felt252,
        asset_type: felt252,
        asset_reference: felt252,
        payment_reference: felt252,
    ) -> bool;

    fn finalize_settlement(
        ref self: TContractState,
        escrow_id: felt252,
        channel_id: felt252,
        payment_reference: felt252,
    ) -> felt252;
}
