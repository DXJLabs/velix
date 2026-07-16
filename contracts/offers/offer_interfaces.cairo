use starknet::ContractAddress;
use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
use crate::offers::offer_types::{Offer, OfferStatus, ShieldedOfferAction};

#[starknet::interface]
pub trait IVeilOffer<TContractState> {
    /// Append one fixed-schema encrypted offer action through the configured
    /// Privacy Pool InvokeExternal path.
    ///
    /// Calldata is exactly:
    /// `[action_kind, conversation_tag, encrypted_payload_commitment,
    ///   valid_until, replay_nullifier, action_commitment]`.
    ///
    /// The action is commitment-only and does not mutate the account-authorized
    /// direct Offer state. It returns an empty deposit span.
    fn privacy_invoke(
        ref self: TContractState,
        calldata: Span<felt252>,
    ) -> Span<OpenNoteDeposit>;

    /// Create a new stateful offer.
    ///
    /// IMPORTANT:
    /// This interface is intended for the direct/unshielded stateful path
    /// because authorization relies on ContractAddress participants.
    ///
    /// Shielded clients may append encrypted action commitments through this
    /// contract's privacy_invoke entry point, but those entries remain a
    /// non-authoritative journal until Veil has proof-backed anonymous
    /// participant authorization.
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

    /// Set the trusted VeilEscrow contract after a two-step deployment.
    ///
    /// This is restricted by the implementation and may only be used while the
    /// escrow contract has not been configured yet.
    fn set_escrow_contract(
        ref self: TContractState,
        escrow_contract: ContractAddress,
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

    /// Domain-separated commitment computed for a direct Offer record.
    fn get_offer_commitment(
        self: @TContractState,
        offer_id: felt252,
    ) -> felt252;

    /// True after an opaque terms commitment has been consumed by a direct
    /// create/counter operation. Exact ciphertext envelopes cannot be replayed.
    fn is_terms_commitment_used(
        self: @TContractState,
        terms_hash: felt252,
    ) -> bool;

    fn get_shielded_action_count(
        self: @TContractState,
    ) -> u64;

    fn get_shielded_action(
        self: @TContractState,
        action_index: u64,
    ) -> ShieldedOfferAction;

    fn is_shielded_action_committed(
        self: @TContractState,
        action_commitment: felt252,
    ) -> bool;

    fn is_shielded_nullifier_used(
        self: @TContractState,
        replay_nullifier: felt252,
    ) -> bool;

    /// Total number of created offer records, including counter-offers.
    fn get_offer_count(
        self: @TContractState,
    ) -> u64;

    /// Trusted VeilEscrow contract allowed to call
    /// mark_converted_to_escrow().
    fn get_escrow_contract(
        self: @TContractState,
    ) -> ContractAddress;

    fn get_privacy_pool(
        self: @TContractState,
    ) -> ContractAddress;

    /// Deployment owner allowed to finish two-step wiring.
    fn get_owner(
        self: @TContractState,
    ) -> ContractAddress;
}
