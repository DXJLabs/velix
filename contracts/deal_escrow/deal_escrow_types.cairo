use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store, PartialEq, Debug)]
pub enum DealStatus {
    #[default]
    Created,
    BuyerFunded,
    SellerFunded,
    Active,
    Released,
    Refunded,
    Cancelled,
}

/// Public escrow state. Negotiated prose and ciphertext are deliberately absent;
/// only the client-produced encrypted-terms commitment is persisted.
#[derive(Copy, Drop, Serde, starknet::Store, PartialEq, Debug)]
pub struct Deal {
    pub deal_id: felt252,
    pub deal_nonce: felt252,
    pub buyer: ContractAddress,
    pub seller: ContractAddress,
    pub payment_token: ContractAddress,
    pub payment_amount: u128,
    pub nft_contract: ContractAddress,
    pub nft_token_id: u256,
    pub encrypted_terms_commitment: felt252,
    pub expiry: u64,
    pub accepted: bool,
    pub payment_deposited: bool,
    pub payment_via_pool: bool,
    pub nft_deposited: bool,
    pub private_payment_authorized: bool,
    pub private_release_authorized: bool,
    pub private_release_note_id: felt252,
    pub status: DealStatus,
    pub created_at: u64,
    pub updated_at: u64,
    pub completed_at: u64,
}

