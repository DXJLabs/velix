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
    fn privacy_invoke(ref self: TContractState, calldata: Span<felt252>) -> Span<OpenNoteDeposit>;

    /// Direct/unshielded timeline append path.
    ///
    /// This remains intentionally separate from `privacy_invoke`; callers must
    /// not label this path as shielded Privacy Pool activity.
    fn invoke(ref self: TContractState, calldata: Span<felt252>) -> Span<OpenNoteDeposit>;

    fn get_privacy_pool(self: @TContractState) -> ContractAddress;

    fn get_event_count(self: @TContractState, conversation_tag: felt252) -> u64;

    fn get_event(self: @TContractState, conversation_tag: felt252, index: u64) -> VeilTimelineEvent;

    fn get_payload_chunk(
        self: @TContractState, conversation_tag: felt252, event_index: u64, chunk_index: u64,
    ) -> felt252;

    /// Return true only when the stored event entered through the pinned
    /// Privacy Pool caller. The value is derived by the contract, never from
    /// user calldata, so clients can keep direct and shielded provenance apart.
    fn is_privacy_pool_event(
        self: @TContractState, conversation_tag: felt252, event_index: u64,
    ) -> bool;

    /// Return whether an exact domain-separated ciphertext commitment has
    /// already been stored under the opaque conversation tag.
    fn is_payload_committed(
        self: @TContractState, conversation_tag: felt252, payload_hash: felt252,
    ) -> bool;
}
