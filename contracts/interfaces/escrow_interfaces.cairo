use starknet::ContractAddress;
use crate::escrow::escrow_types::{
    Escrow,
    EscrowStatus,
};

#[starknet::interface]
pub trait IVeilEscrow<TContractState> {
    /// Create a new escrow from an accepted Veil offer.
    ///
    /// Expected relationship:
    ///
    /// Conversation
    ///   -> Accepted Offer
    ///   -> Escrow
    ///
    /// This stateful interface currently represents the direct/unshielded
    /// authorization path because participant authorization relies on
    /// ContractAddress identities.
    fn create_escrow(
        ref self: TContractState,

        /// Opaque Veil application-level conversation tag.
        ///
        /// This is NOT:
        /// - a wallet address
        /// - a recipient address
        /// - a Canonical Privacy Pool channel identifier
        conversation_tag: felt252,

        /// Accepted Veil offer that originated this escrow.
        offer_id: felt252,

        /// Direct/unshielded seller address.
        seller: ContractAddress,

        /// Commitment to the negotiated asset type.
        asset_type_commitment: felt252,

        /// Commitment to the concrete asset being exchanged.
        asset_commitment: felt252,

        /// Commitment to the payment terms.
        payment_commitment: felt252,

        /// Settlement adapter responsible for validating and
        /// finalizing the concrete settlement flow.
        settlement_adapter: ContractAddress,
    ) -> felt252;

    /// Confirm the buyer-side deposit.
    ///
    /// The deposit commitment must bind this escrow state
    /// to the corresponding deposit proof/reference.
    fn confirm_buyer_deposit(
        ref self: TContractState,
        escrow_id: felt252,
        deposit_commitment: felt252,
    );

    /// Confirm the seller-side deposit.
    ///
    /// The deposit commitment must bind this escrow state
    /// to the corresponding deposit proof/reference.
    fn confirm_seller_deposit(
        ref self: TContractState,
        escrow_id: felt252,
        deposit_commitment: felt252,
    );

    /// Transition a fully funded escrow from Funding to Active.
    ///
    /// Both buyer and seller deposits must already be confirmed.
    fn activate(
        ref self: TContractState,
        escrow_id: felt252,
    );

    /// Finalize settlement through the configured SettlementAdapter.
    ///
    /// The implementation should:
    ///
    /// 1. require Active status
    /// 2. validate settlement inputs through the adapter
    /// 3. finalize settlement through the adapter
    /// 4. persist the settlement result
    /// 5. transition Active -> Completed
    fn settle(
        ref self: TContractState,
        escrow_id: felt252,
    );

    /// Cancel an escrow when permitted by the lifecycle policy.
    ///
    /// Current expected policy:
    /// - Created may be cancelled
    /// - partially funded Funding may be cancelled
    /// - Active requires a future dispute/refund mechanism
    fn cancel(
        ref self: TContractState,
        escrow_id: felt252,
    );

    /// Return the complete escrow state.
    fn get_escrow(
        self: @TContractState,
        escrow_id: felt252,
    ) -> Escrow;

    /// Return only the current lifecycle status.
    fn get_status(
        self: @TContractState,
        escrow_id: felt252,
    ) -> EscrowStatus;

    /// Return the accepted offer that originated this escrow.
    fn get_offer_id(
        self: @TContractState,
        escrow_id: felt252,
    ) -> felt252;

    /// Return the configured settlement adapter.
    fn get_settlement_adapter(
        self: @TContractState,
        escrow_id: felt252,
    ) -> ContractAddress;

    /// Return the total number of created escrows.
    fn get_escrow_count(
        self: @TContractState,
    ) -> u64;
}

#[starknet::interface]
pub trait ISettlementAdapter<TContractState> {
    /// Validate whether the escrow commitments and deposit commitments
    /// are acceptable for the concrete settlement implementation.
    ///
    /// The adapter must not rely on plaintext negotiation metadata
    /// when commitment-based data is sufficient.
    fn validate_settlement(
        self: @TContractState,

        escrow_id: felt252,

        conversation_tag: felt252,

        offer_id: felt252,

        asset_type_commitment: felt252,

        asset_commitment: felt252,

        payment_commitment: felt252,

        buyer_deposit_commitment: felt252,

        seller_deposit_commitment: felt252,
    ) -> bool;

    /// Finalize the concrete settlement.
    ///
    /// The returned felt252 is an adapter-defined settlement result,
    /// commitment, receipt reference, or execution identifier.
    fn finalize_settlement(
        ref self: TContractState,

        escrow_id: felt252,

        conversation_tag: felt252,

        offer_id: felt252,

        asset_commitment: felt252,

        payment_commitment: felt252,

        buyer_deposit_commitment: felt252,

        seller_deposit_commitment: felt252,
    ) -> felt252;
}
