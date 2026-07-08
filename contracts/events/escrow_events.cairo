#[derive(Drop, starknet::Event)]
pub struct EscrowCreated {
    #[key]
    pub escrow_id: felt252,

    /// Accepted offer that originated this escrow.
    pub offer_id: felt252,

    /// Opaque Veil application-level conversation tag.
    ///
    /// Intentionally not marked as #[key] to reduce
    /// public indexing and linkability.
    pub conversation_tag: felt252,

    /// Commitment-based negotiation data.
    pub asset_type_commitment: felt252,
    pub asset_commitment: felt252,
    pub payment_commitment: felt252,

    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct EscrowFundingStarted {
    #[key]
    pub escrow_id: felt252,

    pub conversation_tag: felt252,

    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct BuyerDepositConfirmed {
    #[key]
    pub escrow_id: felt252,

    /// Commitment/reference binding this state transition
    /// to the buyer-side deposit.
    pub deposit_commitment: felt252,

    pub conversation_tag: felt252,

    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct SellerDepositConfirmed {
    #[key]
    pub escrow_id: felt252,

    /// Commitment/reference binding this state transition
    /// to the seller-side deposit.
    pub deposit_commitment: felt252,

    pub conversation_tag: felt252,

    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct EscrowActivated {
    #[key]
    pub escrow_id: felt252,

    pub conversation_tag: felt252,

    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct EscrowSettled {
    #[key]
    pub escrow_id: felt252,

    /// Adapter-defined settlement result, receipt,
    /// commitment, or execution reference.
    pub settlement_result: felt252,

    pub conversation_tag: felt252,

    pub timestamp: u64,
}

#[derive(Drop, starknet::Event)]
pub struct EscrowCancelled {
    #[key]
    pub escrow_id: felt252,

    pub conversation_tag: felt252,

    pub timestamp: u64,
}
