#[derive(Copy, Drop, Serde, starknet::Store, PartialEq, Debug)]
pub struct SettlementReceipt {
    pub settlement_commitment: felt252,
    pub output_note_id: felt252,
    pub output_amount: u128,
    pub completed_at: u64,
}
