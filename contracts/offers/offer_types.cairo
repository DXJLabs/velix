use starknet::ContractAddress;

#[derive(Copy, Drop, Serde, starknet::Store)]
pub enum OfferStatus {
    #[default]
    Open,

    /// This offer has been superseded by a newer counter-offer.
    Countered,

    /// The offer has been accepted by the counterparty.
    Accepted,

    /// The offer has been rejected by the counterparty.
    Rejected,

    /// The offer has been cancelled by the maker.
    Cancelled,

    /// The offer expired before reaching an agreement.
    Expired,

    /// The accepted offer has been bound to a concrete escrow.
    ConvertedToEscrow,
}

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct Offer {
    pub offer_id: felt252,

    /// Opaque application-level conversation identifier.
    ///
    /// This must NOT be:
    /// - a wallet address
    /// - a recipient address
    /// - a Canonical Privacy Pool channel identifier
    pub conversation_tag: felt252,

    /// Direct participants for the stateful (unshielded) flow.
    ///
    /// Shielded negotiation should remain inside
    /// VeilChannelHelper until anonymous authorization
    /// is supported.
    pub maker: ContractAddress,
    pub taker: ContractAddress,

    /// Commitment to the negotiated asset type.
    pub asset_type_commitment: felt252,

    /// Commitment to the negotiated asset.
    pub asset_commitment: felt252,

    /// Commitment to the payment reference.
    pub payment_commitment: felt252,

    /// Commitment to the negotiated price.
    pub price_commitment: felt252,

    /// Commitment/hash of the complete agreement.
    pub terms_hash: felt252,

    /// UNIX timestamp after which the offer expires.
    pub expires_at: u64,

    /// Offer creation timestamp.
    pub created_at: u64,

    /// Last modification timestamp.
    pub updated_at: u64,

    /// Root offer of the negotiation thread.
    ///
    /// For the initial offer:
    /// root_offer_id == offer_id
    pub root_offer_id: felt252,

    /// Previous offer in the negotiation chain.
    ///
    /// For the initial offer:
    /// parent_offer_id == 0
    pub parent_offer_id: felt252,

    /// Current lifecycle status.
    pub status: OfferStatus,

    /// Escrow bound to this offer.
    ///
    /// Zero means no escrow has been created yet.
    pub escrow_id: felt252,
}
