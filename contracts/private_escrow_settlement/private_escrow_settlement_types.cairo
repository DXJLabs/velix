use starknet::ContractAddress;

/// Public custody record for one private Escrow settlement.
///
/// This record deliberately does not contain:
///
/// - buyer or seller addresses;
/// - a Deal Room identifier;
/// - a conversation identifier;
/// - plaintext Escrow terms;
/// - a public participant relationship.
///
/// Token, amount, refund boundary, commitments, and settlement state remain
/// public because they are required by this ERC-20 custody primitive.
#[derive(Copy, Drop, Serde, starknet::Store, PartialEq, Debug)]
pub struct PrivateEscrowCustody {
    pub custody_commitment: felt252,
    pub release_commitment: felt252,
    pub refund_commitment: felt252,
    pub token: ContractAddress,
    pub amount: u128,
    pub refund_after: u64,
    pub consumed: bool,
    pub refunded: bool,
    pub created_at: u64,
    pub settled_at: u64,
}
