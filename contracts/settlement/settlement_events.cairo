#[derive(Drop, starknet::Event)]
pub struct SettlementPrepared {
    #[key]
    pub settlement_commitment: felt252,
    #[key]
    pub output_note_id: felt252,
    pub amount: u128,
    pub timestamp: u64,
}
