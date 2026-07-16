use starknet::ContractAddress;

use crate::deal_escrow::deal_escrow_types::{Deal, DealStatus};
use crate::interfaces::privacy_pool_types::OpenNoteDeposit;

#[starknet::interface]
pub trait IVeilDealEscrow<TState> {
    fn create_deal(
        ref self: TState,
        seller: ContractAddress,
        payment_token: ContractAddress,
        payment_amount: u128,
        nft_contract: ContractAddress,
        nft_token_id: u256,
        encrypted_terms_commitment: felt252,
        deal_nonce: felt252,
        expiry: u64,
    ) -> felt252;

    fn accept_deal(ref self: TState, deal_id: felt252);
    fn deposit_payment(ref self: TState, deal_id: felt252);
    fn authorize_private_payment(ref self: TState, deal_id: felt252);
    fn deposit_asset(ref self: TState, deal_id: felt252);
    fn activate(ref self: TState, deal_id: felt252);
    fn release(ref self: TState, deal_id: felt252);
    fn authorize_private_release(
        ref self: TState, deal_id: felt252, output_note_id: felt252,
    );
    fn refund_expired(ref self: TState, deal_id: felt252);
    fn cancel(ref self: TState, deal_id: felt252);

    /// Pinned Privacy Pool InvokeExternal entrypoint.
    ///
    /// Fixed schemas only:
    /// - private buyer funding: `[1, deal_id]`
    /// - private seller settlement: `[2, deal_id, output_note_id]`
    fn privacy_invoke(
        ref self: TState, calldata: Span<felt252>,
    ) -> Span<OpenNoteDeposit>;

    fn get_deal(self: @TState, deal_id: felt252) -> Deal;
    fn get_status(self: @TState, deal_id: felt252) -> DealStatus;
    fn get_deal_count(self: @TState) -> u64;
    fn get_privacy_pool(self: @TState) -> ContractAddress;
    fn get_reserved_amount(self: @TState, token: ContractAddress) -> u128;

    /// Deliberately false until a real proof-backed two-account E2E is proven.
    fn is_privacy_path_e2e_verified(self: @TState) -> bool;
}

