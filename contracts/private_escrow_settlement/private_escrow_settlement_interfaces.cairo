use starknet::ContractAddress;

use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
use crate::private_escrow_settlement::
    private_escrow_settlement_types::PrivateEscrowCustody;

/// ERC-20 custody and private-output settlement for encrypted VEIL Escrow.
///
/// Only the configured Privacy Pool may call `privacy_invoke`.
///
/// Calldata layouts:
///
/// Deposit:
///
/// ```text
/// [1, custody_commitment, release_commitment, refund_commitment,
///  refund_after, token, amount]
/// ```
///
/// Release before the refund boundary:
///
/// ```text
/// [2, custody_commitment, release_secret, output_note_id]
/// ```
///
/// Refund at or after the refund boundary:
///
/// ```text
/// [3, custody_commitment, refund_secret, output_note_id]
/// ```
#[starknet::interface]
pub trait IVeilPrivateEscrowSettlement<TState> {
    fn privacy_invoke(
        ref self: TState,
        calldata: Span<felt252>,
    ) -> Span<OpenNoteDeposit>;

    fn compute_release_commitment(
        self: @TState,
        custody_commitment: felt252,
        release_secret: felt252,
    ) -> felt252;

    fn compute_refund_commitment(
        self: @TState,
        custody_commitment: felt252,
        refund_secret: felt252,
    ) -> felt252;

    fn get_privacy_pool(
        self: @TState,
    ) -> ContractAddress;

    fn custody_exists(
        self: @TState,
        custody_commitment: felt252,
    ) -> bool;

    fn is_consumed(
        self: @TState,
        custody_commitment: felt252,
    ) -> bool;

    fn get_custody(
        self: @TState,
        custody_commitment: felt252,
    ) -> PrivateEscrowCustody;

    fn get_reserved_amount(
        self: @TState,
        token: ContractAddress,
    ) -> u128;
}
