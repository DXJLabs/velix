use starknet::ContractAddress;

pub const EVENT_CHAT: felt252 = 1;
pub const EVENT_PAYMENT_MEMO: felt252 = 2;
pub const EVENT_OFFER: felt252 = 3;
pub const EVENT_COUNTER_OFFER: felt252 = 4;
pub const EVENT_ACCEPT_OFFER: felt252 = 5;
pub const EVENT_REJECT_OFFER: felt252 = 6;
pub const EVENT_ESCROW_CREATED: felt252 = 7;
pub const EVENT_ESCROW_DEPOSITED: felt252 = 8;
pub const EVENT_ESCROW_SETTLED: felt252 = 9;
pub const EVENT_ESCROW_CANCELLED: felt252 = 10;
pub const EVENT_PROOF_ATTACHED: felt252 = 11;

#[derive(Copy, Drop, Serde)]
pub struct OpenNoteDeposit {
    pub note_id: felt252,
    pub token: ContractAddress,
    pub amount: u256,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct VeilTimelineEvent {
    pub event_id: felt252,
    pub channel_id: felt252,
    pub event_type: felt252,
    pub encrypted_payload: felt252,
    pub payload_hash: felt252,
    pub created_at: u64,
}

#[starknet::interface]
pub trait IVeilChannelHelper<TContractState> {
    fn privacy_invoke(
        ref self: TContractState, calldata: Span<felt252>,
    ) -> Span<OpenNoteDeposit>;
    fn invoke(ref self: TContractState, calldata: Span<felt252>) -> Span<OpenNoteDeposit>;
    fn get_event_count(self: @TContractState, channel_id: felt252) -> u64;
    fn get_event(self: @TContractState, channel_id: felt252, index: u64) -> VeilTimelineEvent;
}

#[starknet::contract]
pub mod VeilChannelHelper {
    use starknet::get_block_timestamp;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use super::{
        EVENT_ACCEPT_OFFER, EVENT_CHAT, EVENT_COUNTER_OFFER, EVENT_ESCROW_CANCELLED,
        EVENT_ESCROW_CREATED, EVENT_ESCROW_DEPOSITED, EVENT_ESCROW_SETTLED, EVENT_OFFER,
        EVENT_PAYMENT_MEMO, EVENT_PROOF_ATTACHED, EVENT_REJECT_OFFER, IVeilChannelHelper,
        OpenNoteDeposit, VeilTimelineEvent,
    };

    #[storage]
    struct Storage {
        events: Map<(felt252, u64), VeilTimelineEvent>,
        event_count: Map<felt252, u64>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        TimelineEventStored: TimelineEventStored,
    }

    #[derive(Drop, starknet::Event)]
    struct TimelineEventStored {
        #[key]
        channel_id: felt252,
        #[key]
        event_type: felt252,
        #[key]
        event_id: felt252,
        payload_hash: felt252,
        created_at: u64,
    }

    #[abi(embed_v0)]
    impl VeilChannelHelperImpl of IVeilChannelHelper<ContractState> {
        fn privacy_invoke(
            ref self: ContractState, calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            self.store_timeline_event(calldata)
        }

        fn invoke(ref self: ContractState, calldata: Span<felt252>) -> Span<OpenNoteDeposit> {
            self.store_timeline_event(calldata)
        }

        fn get_event_count(self: @ContractState, channel_id: felt252) -> u64 {
            self.event_count.read(channel_id)
        }

        fn get_event(self: @ContractState, channel_id: felt252, index: u64) -> VeilTimelineEvent {
            self.events.read((channel_id, index))
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn store_timeline_event(
            ref self: ContractState, calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            assert(calldata.len() == 4, 'Invalid calldata');

            let channel_id = *calldata.at(0);
            let event_type = *calldata.at(1);
            let encrypted_payload = *calldata.at(2);
            let payload_hash = *calldata.at(3);

            assert(channel_id != 0, 'Invalid channel');
            assert_valid_event_type(event_type);
            assert(encrypted_payload != 0, 'Invalid payload');
            assert(payload_hash != 0, 'Invalid hash');

            let current_count = self.event_count.read(channel_id);
            let event_id = current_count.into() + 1;
            let created_at = get_block_timestamp();
            let timeline_event = VeilTimelineEvent {
                event_id, channel_id, event_type, encrypted_payload, payload_hash, created_at,
            };

            self.events.write((channel_id, current_count), timeline_event);
            self.event_count.write(channel_id, current_count + 1);
            self
                .emit(
                    Event::TimelineEventStored(
                        TimelineEventStored {
                            channel_id, event_type, event_id, payload_hash, created_at,
                        },
                    ),
                );

            ArrayTrait::<OpenNoteDeposit>::new().span()
        }
    }

    fn assert_valid_event_type(event_type: felt252) {
        let is_valid = event_type == EVENT_CHAT
            || event_type == EVENT_PAYMENT_MEMO
            || event_type == EVENT_OFFER
            || event_type == EVENT_COUNTER_OFFER
            || event_type == EVENT_ACCEPT_OFFER
            || event_type == EVENT_REJECT_OFFER
            || event_type == EVENT_ESCROW_CREATED
            || event_type == EVENT_ESCROW_DEPOSITED
            || event_type == EVENT_ESCROW_SETTLED
            || event_type == EVENT_ESCROW_CANCELLED
            || event_type == EVENT_PROOF_ATTACHED;
        assert(is_valid, 'Invalid event type');
    }
}
