use starknet::ContractAddress;

#[derive(Drop, starknet::Event)]
pub struct EscrowCreated {
    #[key]
    pub escrow_id: felt252,
    #[key]
    pub channel_id: felt252,
    pub buyer: ContractAddress,
    pub seller: ContractAddress,
    pub asset_type: felt252,
    pub asset_reference: felt252,
    pub payment_reference: felt252,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct BuyerDepositConfirmed {
    #[key]
    pub escrow_id: felt252,
    #[key]
    pub channel_id: felt252,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct SellerDepositConfirmed {
    #[key]
    pub escrow_id: felt252,
    #[key]
    pub channel_id: felt252,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct EscrowActivated {
    #[key]
    pub escrow_id: felt252,
    #[key]
    pub channel_id: felt252,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct EscrowSettled {
    #[key]
    pub escrow_id: felt252,
    #[key]
    pub channel_id: felt252,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct EscrowCancelled {
    #[key]
    pub escrow_id: felt252,
    #[key]
    pub channel_id: felt252,
    pub timestamp: u64,
}
