use starknet::ContractAddress;
use crate::offers::offer_types::{Offer, OfferStatus};

#[starknet::interface]
pub trait IVeilOffer<TContractState> {
    /// Create a new stateful offer.
    ///
    /// IMPORTANT:
    /// This interface is intended for the direct/unshielded stateful path
    /// because authorization relies on ContractAddress participants.
    ///
    /// Shielded negotiation should use:
    /// Canonical Privacy Pool
    ///   -> InvokeExternal
    ///   -> VeilChannelHelper.privacy_invoke(...)
    ///
    /// until Veil has proof-backed anonymous authorization.
    fn create_offer(
        ref self: TContractState,

        /// Opaque Veil application-level conversation tag.
        ///
        /// This is NOT:
        /// - a wallet address
        /// - a recipient address
        /// - a Canonical Privacy Pool channel id
        conversation_tag: felt252,

        /// Direct/unshielded counterparty.
        taker: ContractAddress,

        /// Commitment to the asset class/type.
        ///
        /// Do not pass plaintext values such as:
        /// NFT / ERC20 / USDC / STRK as directly readable metadata
        /// if privacy is expected.
        asset_type_commitment: felt252,

        /// Commitment to the concrete asset being negotiated.
        asset_commitment: felt252,

        /// Commitment to payment terms/reference.
        payment_commitment: felt252,

        /// Commitment to price/value.
        price_commitment: felt252,

        /// Hash/commitment of the complete negotiated terms.
        terms_hash: felt252,

        /// Unix timestamp after which this offer can no longer be accepted,
        /// rejected, or countered.
        expires_at: u64,
    ) -> felt252;

    /// Create a counter-offer.
    ///
    /// The implementation should create a NEW offer id rather than mutating
    /// the previous offer terms in place.
    ///
    /// Expected behavior:
    ///
    /// previous offer:
    ///   Open -> Countered
    ///
    /// new offer:
    ///   Open
    ///
    /// The implementation should preserve the negotiation chain through
    /// parent/counter references in Offer storage.
    fn counter_offer(
        ref self: TContractState,
        offer_id: felt252,
        price_commitment: felt252,
        terms_hash: felt252,
        expires_at: u64,
    ) -> felt252;

    /// Accept an open, non-expired offer.
    ///
    /// Direct/unshielded path:
    /// only the current taker/counterparty should be authorized.
    fn accept_offer(
        ref self: TContractState,
        offer_id: felt252,
    );

    /// Reject an open, non-expired offer.
    ///
    /// Direct/unshielded path:
    /// only the current taker/counterparty should be authorized.
    fn reject_offer(
        ref self: TContractState,
        offer_id: felt252,
    );

    /// Cancel an open offer.
    ///
    /// Direct/unshielded path:
    /// only the current maker should be authorized.
    fn cancel_offer(
        ref self: TContractState,
        offer_id: felt252,
    );

    /// Materialize expiry after the deadline.
    ///
    /// This may be permissionless because validity is determined by
    /// block timestamp and current OfferStatus.
    fn expire_offer(
        ref self: TContractState,
        offer_id: felt252,
    );

    /// Bind an accepted offer to a concrete escrow.
    ///
    /// SECURITY:
    /// The implementation MUST authenticate the caller against the configured
    /// VeilEscrow contract address.
    ///
    /// A wallet must not be able to directly mark an offer as converted.
    fn mark_converted_to_escrow(
        ref self: TContractState,
        offer_id: felt252,
        escrow_id: felt252,
    );

    /// Return the complete offer state.
    fn get_offer(
        self: @TContractState,
        offer_id: felt252,
    ) -> Offer;

    /// Return only the current lifecycle status.
    fn get_offer_status(
        self: @TContractState,
        offer_id: felt252,
    ) -> OfferStatus;

    /// Return the escrow id bound to an accepted/converted offer.
    ///
    /// Returns zero when no escrow has been attached yet.
    fn get_escrow_id(
        self: @TContractState,
        offer_id: felt252,
    ) -> felt252;

    /// Total number of created offer records, including counter-offers.
    fn get_offer_count(
        self: @TContractState,
    ) -> u64;

    /// Trusted VeilEscrow contract allowed to call
    /// mark_converted_to_escrow().
    fn get_escrow_contract(
        self: @TContractState,
    ) -> ContractAddress;
}
