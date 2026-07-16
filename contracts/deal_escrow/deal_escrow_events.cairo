use starknet::ContractAddress;

#[derive(Drop, starknet::Event)]
pub struct DealCreated {
    #[key]
    pub deal_id: felt252,
    #[key]
    pub buyer: ContractAddress,
    #[key]
    pub seller: ContractAddress,
    pub deal_nonce: felt252,
    pub payment_token: ContractAddress,
    pub payment_amount: u128,
    pub nft_contract: ContractAddress,
    pub nft_token_id: u256,
    pub encrypted_terms_commitment: felt252,
    pub expiry: u64,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct DealAccepted {
    #[key]
    pub deal_id: felt252,
    #[key]
    pub seller: ContractAddress,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct PrivatePaymentAuthorized {
    #[key]
    pub deal_id: felt252,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct PaymentDeposited {
    #[key]
    pub deal_id: felt252,
    #[key]
    pub token: ContractAddress,
    pub amount: u128,
    pub via_privacy_pool: bool,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct AssetDeposited {
    #[key]
    pub deal_id: felt252,
    #[key]
    pub nft_contract: ContractAddress,
    pub nft_token_id: u256,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct DealActivated {
    #[key]
    pub deal_id: felt252,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct PrivateReleaseAuthorized {
    #[key]
    pub deal_id: felt252,
    #[key]
    pub note_id: felt252,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct DealReleased {
    #[key]
    pub deal_id: felt252,
    pub via_privacy_pool: bool,
    pub note_id: felt252,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct DealRefunded {
    #[key]
    pub deal_id: felt252,
    pub payment_refunded: bool,
    pub asset_refunded: bool,
    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct DealCancelled {
    #[key]
    pub deal_id: felt252,
    pub timestamp: u64,
}

