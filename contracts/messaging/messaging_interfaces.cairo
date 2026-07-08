use starknet::ContractAddress;
use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
use crate::messaging::veil_channel_helper::VeilTimelineEvent;

#[starknet::interface]
pub trait IVeilTimeline<TState> {
    fn privacy_invoke(ref self: TState, calldata: Span<felt252>) -> Span<OpenNoteDeposit>;
    fn invoke(ref self: TState, calldata: Span<felt252>) -> Span<OpenNoteDeposit>;
    fn get_privacy_pool(self: @TState) -> ContractAddress;
    fn get_event_count(self: @TState, conversation_tag: felt252) -> u64;
    fn get_event(self: @TState, conversation_tag: felt252, index: u64) -> VeilTimelineEvent;
}
