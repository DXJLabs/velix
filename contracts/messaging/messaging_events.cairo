#[derive(Drop, starknet::Event)]
pub struct TimelineCommitmentStored {
    #[key]
    pub conversation_tag: felt252,
    #[key]
    pub event_id: felt252,
    pub payload_hash: felt252,
}
