use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store)]
pub enum EscrowStatus {
    #[default]
    Created,

    /// The escrow is waiting for one or both participant deposits.
    Funding,

    /// Both required deposits have been confirmed and
    /// the escrow is ready for settlement.
    Active,

    /// Settlement has completed successfully.
    Completed,

    /// The escrow has been cancelled before completion.
    Cancelled,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Escrow {
    /// Unique escrow identifier.
    pub escrow_id: felt252,

    /// Opaque Veil application-level conversation tag.
    ///
    /// This must NOT be:
    /// - a wallet address
    /// - a recipient address
    /// - a Canonical Privacy Pool channel identifier
    pub conversation_tag: felt252,

    /// Accepted offer that created this escrow.
    ///
    /// This provides the explicit relationship:
    ///
    /// Conversation
    ///   -> Offer
    ///   -> Escrow
    pub offer_id: felt252,

    /// Direct participants for the stateful escrow flow.
    ///
    /// These ContractAddress identities represent the direct/unshielded
    /// authorization model.
    ///
    /// A separate proof-backed authorization mechanism is required before
    /// this stateful escrow can honestly claim anonymous shielded roles.
    pub buyer: ContractAddress,
    pub seller: ContractAddress,

    /// Commitment to the negotiated asset type.
    pub asset_type_commitment: felt252,

    /// Commitment to the concrete asset being exchanged.
    pub asset_commitment: felt252,

    /// Commitment to the payment terms or payment reference.
    pub payment_commitment: felt252,

    /// Commitment/reference proving the buyer-side deposit.
    ///
    /// Zero means no buyer deposit has been confirmed yet.
    pub buyer_deposit_commitment: felt252,

    /// Commitment/reference proving the seller-side deposit.
    ///
    /// Zero means no seller deposit has been confirmed yet.
    pub seller_deposit_commitment: felt252,

    /// Whether the buyer-side deposit has been confirmed.
    pub buyer_deposited: bool,

    /// Whether the seller-side deposit has been confirmed.
    pub seller_deposited: bool,

    /// Settlement adapter selected for this escrow.
    ///
    /// The adapter is responsible for validating and finalizing
    /// the concrete settlement flow.
    pub settlement_adapter: ContractAddress,

    /// Current escrow lifecycle status.
    pub status: EscrowStatus,

    /// Escrow creation timestamp.
    pub created_at: u64,

    /// Last escrow state modification timestamp.
    pub updated_at: u64,

    /// Completion timestamp.
    ///
    /// Zero means the escrow has not completed yet.
    pub completed_at: u64,
}
