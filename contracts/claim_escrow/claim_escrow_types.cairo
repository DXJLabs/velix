use starknet::ContractAddress;

/// A parked claim-link deposit. The preimage secret is never stored.
#[derive(Copy, Drop, Serde, starknet::Store, PartialEq, Debug)]
pub struct ClaimEntry {
    pub commitment: felt252,
    pub token: ContractAddress,
    pub amount: u128,
    pub claimed: bool,
    pub created_at: u64,
    pub claimed_at: u64,
}
