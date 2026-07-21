use starknet::ContractAddress;

/// Funds were parked under a one-time custody commitment.
///
/// ERC-20 token, amount, and refund boundary are public because the custody
/// transfer and InvokeExternal calldata are public on-chain.
#[derive(Drop, starknet::Event)]
pub struct PrivateEscrowCustodyFunded {
    #[key]
    pub custody_commitment: felt252,
    #[key]
    pub token: ContractAddress,
    pub amount: u128,
    pub refund_after: u64,
    pub timestamp: u64,
}

/// Custody was consumed through the release-secret path.
#[derive(Drop, starknet::Event)]
pub struct PrivateEscrowCustodyReleased {
    #[key]
    pub custody_commitment: felt252,
    #[key]
    pub output_note_id: felt252,
    pub timestamp: u64,
}

/// Custody was consumed through the timeout refund path.
#[derive(Drop, starknet::Event)]
pub struct PrivateEscrowCustodyRefunded {
    #[key]
    pub custody_commitment: felt252,
    #[key]
    pub output_note_id: felt252,
    pub timestamp: u64,
}
