use starknet::{
    ContractAddress,
    get_block_timestamp,
    get_caller_address,
};
use starknet::event::EventEmitter;
use starknet::storage::{
    StorageMapWriteAccess,
    StoragePointerReadAccess,
};

use super::{
    ContractState,
    Event,
    InternalTrait,
};

use crate::events::escrow_events::{
    EscrowCreated,
    EscrowFundingStarted,
};
use crate::offers::offer_interfaces::{
    IVeilOfferDispatcher,
    IVeilOfferDispatcherTrait,
};
use crate::offers::offer_types::OfferStatus;
use crate::escrow::escrow_types::{
    Escrow,
    EscrowStatus,
};
use crate::escrow::escrow_validation::{
    assert_different_parties,
    assert_non_zero,
    assert_non_zero_address,
    assert_valid_settlement_adapter,
    assert_valid_status_transition,
};

        /// Create an escrow from an Accepted Veil offer.
        ///
        /// The caller becomes the buyer for this direct/unshielded
        /// stateful escrow path.
        ///
        /// The function verifies:
        /// - offer exists
        /// - offer is Accepted
        /// - buyer and seller are the offer participants
        /// - conversation tag matches
        /// - asset/payment commitments match
        /// - settlement adapter is configured
        ///
        /// After escrow creation, the trusted VeilOffer contract
        /// is asked to bind offer_id -> escrow_id.
        pub fn create_escrow(
            ref self: ContractState,
            conversation_tag: felt252,
            offer_id: felt252,
            seller: ContractAddress,
            asset_type_commitment: felt252,
            asset_commitment: felt252,
            payment_commitment: felt252,
            settlement_adapter: ContractAddress,
        ) -> felt252 {
            self.enter_reentrancy_guard();

            let buyer =
                get_caller_address();

            let now =
                get_block_timestamp();

            // -----------------------------------------------------------------
            // Basic validation
            // -----------------------------------------------------------------

            assert_non_zero_address(
                buyer,
            );

            assert_non_zero_address(
                seller,
            );

            assert_different_parties(
                buyer,
                seller,
            );

            assert_non_zero(
                conversation_tag,
                'Invalid conversation',
            );

            assert_non_zero(
                offer_id,
                'Invalid offer',
            );

            assert_non_zero(
                asset_type_commitment,
                'Invalid asset type',
            );

            assert_non_zero(
                asset_commitment,
                'Invalid asset',
            );

            assert_non_zero(
                payment_commitment,
                'Invalid payment',
            );

            assert_valid_settlement_adapter(
                settlement_adapter,
            );

            // -----------------------------------------------------------------
            // Verify accepted Veil offer
            // -----------------------------------------------------------------

            let offer_contract =
                self.offer_contract.read();

            let offer_dispatcher =
                IVeilOfferDispatcher {
                    contract_address:
                        offer_contract,
                };

            let offer =
                offer_dispatcher.get_offer(
                    offer_id,
                );

            match offer.status {
                OfferStatus::Accepted => (),
                _ => core::panic_with_felt252(
                    'Offer not accepted',
                ),
            }

            // Escrow must remain attached to the same conversation.
            assert(
                offer.conversation_tag
                    == conversation_tag,
                'Conversation mismatch',
            );

            // Verify that buyer and seller are exactly
            // the participants of the accepted offer.
            let participants_match =
                (
                    offer.maker == buyer
                        && offer.taker == seller
                )
                || (
                    offer.maker == seller
                        && offer.taker == buyer
                );

            assert(
                participants_match,
                'Participant mismatch',
            );

            // Bind escrow terms to the accepted offer.
            assert(
                offer.asset_type_commitment
                    == asset_type_commitment,
                'Asset type mismatch',
            );

            assert(
                offer.asset_commitment
                    == asset_commitment,
                'Asset mismatch',
            );

            assert(
                offer.payment_commitment
                    == payment_commitment,
                'Payment mismatch',
            );

            // Accepted offers must not already be bound.
            assert(
                offer.escrow_id == 0,
                'Offer already converted',
            );

            // -----------------------------------------------------------------
            // Create escrow
            // -----------------------------------------------------------------

            let escrow_id =
                self.next_escrow_id();

            let escrow = Escrow {
                escrow_id,

                conversation_tag,

                offer_id,

                buyer,
                seller,

                asset_type_commitment,
                asset_commitment,
                payment_commitment,

                buyer_deposit_commitment: 0,
                seller_deposit_commitment: 0,

                buyer_deposited: false,
                seller_deposited: false,

                settlement_adapter,

                settlement_result: 0,

                status:
                    EscrowStatus::Created,

                created_at:
                    now,

                updated_at:
                    now,

                completed_at:
                    0,
            };

            self.write_new_escrow(
                escrow,
            );

            self.emit(
                Event::EscrowCreated(
                    EscrowCreated {
                        escrow_id,

                        offer_id,

                        conversation_tag,

                        asset_type_commitment,
                        asset_commitment,
                        payment_commitment,

                        timestamp:
                            now,
                    },
                ),
            );

            // -----------------------------------------------------------------
            // Move Created -> Funding
            // -----------------------------------------------------------------

            assert_valid_status_transition(
                EscrowStatus::Created,
                EscrowStatus::Funding,
            );

            let mut funding_escrow =
                self.read_existing_escrow(
                    escrow_id,
                );

            funding_escrow.status =
                EscrowStatus::Funding;

            funding_escrow.updated_at =
                now;

            self.escrows.write(
                escrow_id,
                funding_escrow,
            );

            self.emit(
                Event::EscrowFundingStarted(
                    EscrowFundingStarted {
                        escrow_id,

                        conversation_tag,

                        timestamp:
                            now,
                    },
                ),
            );

            // -----------------------------------------------------------------
            // Bind accepted offer -> escrow
            // -----------------------------------------------------------------

            offer_dispatcher
                .mark_converted_to_escrow(
                    offer_id,
                    escrow_id,
                );

            self.exit_reentrancy_guard();

            escrow_id
        }
