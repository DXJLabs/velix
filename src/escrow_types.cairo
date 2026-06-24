use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store)]
pub enum EscrowStatus {
    #[default]
    Created,
    Active,
    Completed,
    Cancelled,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Escrow {
    pub escrow_id: felt252,
    pub channel_id: felt252,
    pub buyer: ContractAddress,
    pub seller: ContractAddress,
    pub asset_type: felt252,
    pub asset_reference: felt252,
    pub payment_reference: felt252,
    pub buyer_deposited: bool,
    pub seller_deposited: bool,
    pub status: EscrowStatus,
    pub created_at: u64,
}
