use starknet::ContractAddress;
use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
use crate::messaging::messaging_types::VeilTimelineEvent;

#[starknet::interface]
pub trait IVeilChannelHelper<TContractState> {
    /// Shielded/private timeline append path.
    ///
    /// This is the target expected by Privacy Pool `InvokeExternal`, where the
    /// canonical Privacy Pool contract calls VEIL through `privacy_invoke`.
    /// Implementations must reject direct wallet callers here so the UI/indexer
    /// can distinguish shielded provenance from direct helper writes.
    fn privacy_invoke(
        ref self: TContractState,
        calldata: Span<felt252>,
    ) -> Span<OpenNoteDeposit>;

    /// Direct/unshielded timeline append path.
    ///
    /// This remains intentionally separate from `privacy_invoke`; callers must
    /// not label this path as shielded Privacy Pool activity.
    fn invoke(
        ref self: TContractState,
        calldata: Span<felt252>,
    ) -> Span<OpenNoteDeposit>;

    fn get_privacy_pool(
        self: @TContractState,
    ) -> ContractAddress;

    fn get_event_count(
        self: @TContractState,
        conversation_tag: felt252,
    ) -> u64;

    fn get_event(
        self: @TContractState,
        conversation_tag: felt252,
        index: u64,
    ) -> VeilTimelineEvent;

    fn get_payload_chunk(
        self: @TContractState,
        conversation_tag: felt252,
        event_index: u64,
        chunk_index: u64,
    ) -> felt252;
}
