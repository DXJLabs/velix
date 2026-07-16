use starknet::ContractAddress;

use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
use crate::messaging::messaging_types::VeilMessageRecord;

#[starknet::interface]
pub trait IVeilChannelHelper<TContractState> {
    /// Store one encrypted VEIL message through the pinned Privacy Pool.
    ///
    /// The caller must be the Privacy Pool configured during deployment.
    /// Successful messaging returns no open-note deposits.
    fn privacy_invoke(
        ref self: TContractState,
        calldata: Span<felt252>,
    ) -> Span<OpenNoteDeposit>;

    /// Return the only Privacy Pool authorized to invoke this helper.
    fn get_privacy_pool(
        self: @TContractState,
    ) -> ContractAddress;

    /// Return whether a one-time message locator has already been stored.
    fn message_exists(
        self: @TContractState,
        message_locator: felt252,
    ) -> bool;

    /// Return the public record associated with an existing message locator.
    ///
    /// The call must revert when the locator has never been stored.
    fn get_message(
        self: @TContractState,
        message_locator: felt252,
    ) -> VeilMessageRecord;

    /// Return one ciphertext chunk belonging to an existing message.
    ///
    /// The call must revert when the message does not exist or when the chunk
    /// index is outside the record's declared ciphertext length.
    fn get_payload_chunk(
        self: @TContractState,
        message_locator: felt252,
        chunk_index: u64,
    ) -> felt252;

    /// Return whether an encrypted-envelope commitment has already been used.
    fn is_payload_committed(
        self: @TContractState,
        payload_commitment: felt252,
    ) -> bool;
}
