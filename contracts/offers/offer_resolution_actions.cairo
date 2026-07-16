use starknet::{
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

use crate::offers::offer_events::{
    OfferCancelled,
    OfferConvertedToEscrow,
    OfferExpired,
    OfferRejected,
};
use crate::offers::offer_types::OfferStatus;
use crate::offers::offer_validation::{
    assert_can_cancel,
    assert_can_convert_to_escrow,
    assert_can_reject,
    assert_expired,
    assert_maker,
    assert_non_zero,
    assert_non_zero_address,
    assert_not_expired,
    assert_taker,
    assert_valid_status_transition,
};

        /// Reject the currently open offer.
        ///
        /// Only the current taker may reject.
        pub fn reject_offer(
            ref self: ContractState,
            offer_id: felt252,
        ) {
            self.enter_reentrancy_guard();

            let mut offer =
                self.read_existing_offer(offer_id);

            let caller =
                get_caller_address();

            let now =
                get_block_timestamp();

            assert_taker(
                caller,
                offer.taker,
            );

            assert_can_reject(
                offer.status,
            );

            assert_not_expired(
                offer.expires_at,
                now,
            );

            assert_valid_status_transition(
                offer.status,
                OfferStatus::Rejected,
            );

            offer.status =
                OfferStatus::Rejected;

            offer.updated_at =
                now;

            self.offers.write(
                offer_id,
                offer,
            );

            self.emit(
                Event::OfferRejected(
                    OfferRejected {
                        offer_id,

                        conversation_tag:
                            offer.conversation_tag,

                        timestamp: now,
                    },
                ),
            );

            self.exit_reentrancy_guard();
        }

        /// Cancel an open offer.
        ///
        /// Only the current maker may cancel.
        pub fn cancel_offer(
            ref self: ContractState,
            offer_id: felt252,
        ) {
            self.enter_reentrancy_guard();

            let mut offer =
                self.read_existing_offer(offer_id);

            let caller =
                get_caller_address();

            let now =
                get_block_timestamp();

            assert_maker(
                caller,
                offer.maker,
            );

            assert_can_cancel(
                offer.status,
            );

            assert_not_expired(
                offer.expires_at,
                now,
            );

            assert_valid_status_transition(
                offer.status,
                OfferStatus::Cancelled,
            );

            offer.status =
                OfferStatus::Cancelled;

            offer.updated_at =
                now;

            self.offers.write(
                offer_id,
                offer,
            );

            self.emit(
                Event::OfferCancelled(
                    OfferCancelled {
                        offer_id,

                        conversation_tag:
                            offer.conversation_tag,

                        timestamp: now,
                    },
                ),
            );

            self.exit_reentrancy_guard();
        }

        /// Materialize an expired offer.
        ///
        /// This function is intentionally permissionless.
        ///
        /// Authorization is derived from:
        /// - current Open status
        /// - non-zero expiry
        /// - block timestamp reaching the deadline
        pub fn expire_offer(
            ref self: ContractState,
            offer_id: felt252,
        ) {
            self.enter_reentrancy_guard();

            let mut offer =
                self.read_existing_offer(offer_id);

            let now =
                get_block_timestamp();

            assert_expired(
                offer.expires_at,
                now,
            );

            assert_valid_status_transition(
                offer.status,
                OfferStatus::Expired,
            );

            offer.status =
                OfferStatus::Expired;

            offer.updated_at =
                now;

            self.offers.write(
                offer_id,
                offer,
            );

            self.emit(
                Event::OfferExpired(
                    OfferExpired {
                        offer_id,

                        conversation_tag:
                            offer.conversation_tag,

                        timestamp: now,
                    },
                ),
            );

            self.exit_reentrancy_guard();
        }

        /// Bind an Accepted offer to a concrete escrow.
        ///
        /// SECURITY:
        /// Only the configured VeilEscrow contract may call this function.
        pub fn mark_converted_to_escrow(
            ref self: ContractState,
            offer_id: felt252,
            escrow_id: felt252,
        ) {
            self.enter_reentrancy_guard();

            let caller =
                get_caller_address();

            let expected_escrow =
                self.escrow_contract.read();

            // A zero/unwired escrow address must never authorize conversion,
            // even in execution contexts where caller address could be zero.
            assert_non_zero_address(expected_escrow);

            assert(
                caller == expected_escrow,
                'Only escrow contract',
            );

            assert_non_zero(
                escrow_id,
                'Invalid escrow',
            );

            let mut offer =
                self.read_existing_offer(offer_id);

            let now =
                get_block_timestamp();

            assert_can_convert_to_escrow(
                offer.status,
            );

            assert(
                offer.escrow_id == 0,
                'Escrow already bound',
            );

            assert_valid_status_transition(
                offer.status,
                OfferStatus::ConvertedToEscrow,
            );

            offer.status =
                OfferStatus::ConvertedToEscrow;

            offer.escrow_id =
                escrow_id;

            offer.updated_at =
                now;

            self.offers.write(
                offer_id,
                offer,
            );

            self.emit(
                Event::OfferConvertedToEscrow(
                    OfferConvertedToEscrow {
                        offer_id,
                        escrow_id,

                        conversation_tag:
                            offer.conversation_tag,

                        timestamp: now,
                    },
                ),
            );

            self.exit_reentrancy_guard();
        }
