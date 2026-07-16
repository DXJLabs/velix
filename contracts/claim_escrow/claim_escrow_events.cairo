use starknet::ContractAddress;

#[derive(Drop, starknet::Event)]
pub struct ClaimDeposited {
    #[key]
    pub commitment: felt252,
    #[key]
    pub token: ContractAddress,
    pub amount: u128,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct ClaimCompleted {
    #[key]
    pub commitment: felt252,
    #[key]
    pub token: ContractAddress,
    pub note_id: felt252,
    pub amount: u128,
    pub timestamp: u64,
}
