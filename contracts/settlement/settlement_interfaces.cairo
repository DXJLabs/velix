use starknet::ContractAddress;
use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
use crate::settlement::settlement_types::SettlementReceipt;

#[starknet::interface]
pub trait IVeilSettlementHelper<TState> {
    fn privacy_invoke(
        ref self: TState,
        output_note_id: felt252,
        output_token: ContractAddress,
        output_amount: u128,
        settlement_commitment: felt252,
    ) -> Span<OpenNoteDeposit>;
    fn get_privacy_pool(self: @TState) -> ContractAddress;
    fn is_settled(self: @TState, settlement_commitment: felt252) -> bool;
    fn get_receipt(self: @TState, settlement_commitment: felt252) -> SettlementReceipt;
}
