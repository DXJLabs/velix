use starknet::ContractAddress;

use crate::claim_escrow::claim_escrow_types::ClaimEntry;
use crate::interfaces::privacy_pool_types::OpenNoteDeposit;

#[starknet::interface]
pub trait IVeilClaimEscrow<TState> {
    /// Privacy Pool InvokeExternal entry point.
    ///
    /// Deposit calldata: `[1, commitment, token, amount]`.
    /// Claim calldata: `[2, secret, output_note_id]`.
    fn privacy_invoke(
        ref self: TState, calldata: Span<felt252>,
    ) -> Span<OpenNoteDeposit>;

    fn compute_commitment(self: @TState, secret: felt252) -> felt252;
    fn get_privacy_pool(self: @TState) -> ContractAddress;
    fn claim_exists(self: @TState, commitment: felt252) -> bool;
    fn is_claimed(self: @TState, commitment: felt252) -> bool;
    fn get_claim(self: @TState, commitment: felt252) -> ClaimEntry;
    fn get_reserved_amount(self: @TState, token: ContractAddress) -> u128;
}
