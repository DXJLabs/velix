use starknet::{
    ContractAddress,
    get_block_timestamp,
    get_caller_address,
};
use starknet::event::EventEmitter;
use starknet::storage::{
    StorageMapWriteAccess,
};

use super::{
    ContractState,
    Event,
    InternalTrait,
};

use crate::offers::offer_events::{
    CounterOfferCreated,
    OfferAccepted,
    OfferCreated,
};
use crate::offers::offer_types::{
    Offer,
    OfferStatus,
};
use crate::offers::offer_validation::{
    assert_can_accept,
    assert_can_counter,
    assert_different_parties,
    assert_non_zero,
    assert_non_zero_address,
    assert_not_expired,
    assert_taker,
    assert_valid_expiry,
    assert_valid_status_transition,
};

        /// Create the initial offer in a negotiation thread.
        ///
        /// This stateful path relies on ContractAddress authorization
        /// and therefore represents the direct/unshielded offer flow.
        pub fn create_offer(
            ref self: ContractState,
            conversation_tag: felt252,
            taker: ContractAddress,
            asset_type_commitment: felt252,
            asset_commitment: felt252,
            payment_commitment: felt252,
            price_commitment: felt252,
            terms_hash: felt252,
            expires_at: u64,
        ) -> felt252 {
            self.enter_reentrancy_guard();

            let maker = get_caller_address();
            let now = get_block_timestamp();

            // Validate participants.
            assert_non_zero_address(maker);
            assert_non_zero_address(taker);
            assert_different_parties(maker, taker);

            // Validate opaque identifiers and commitments.
            assert_non_zero(
                conversation_tag,
                'Invalid conversation',
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

            assert_non_zero(
                price_commitment,
                'Invalid price',
            );

            assert_non_zero(
                terms_hash,
                'Invalid terms',
            );

            assert_valid_expiry(
                expires_at,
                now,
            );

            let offer_id =
                self.next_offer_id();

            let offer = Offer {
                offer_id,

                conversation_tag,

                maker,
                taker,

                asset_type_commitment,
                asset_commitment,
                payment_commitment,
                price_commitment,
                terms_hash,

                expires_at,

                created_at: now,
                updated_at: now,

                // Initial offer is the root of its own
                // negotiation thread.
                root_offer_id: offer_id,

                // Initial offer has no parent.
                parent_offer_id: 0,

                status: OfferStatus::Open,

                // No escrow exists yet.
                escrow_id: 0,
            };

            self.write_new_offer(offer);

            self.emit(
                Event::OfferCreated(
                    OfferCreated {
                        offer_id,

                        conversation_tag,

                        asset_commitment,
                        payment_commitment,
                        price_commitment,
                        terms_hash,

                        expires_at,
                        timestamp: now,
                    },
                ),
            );

            self.exit_reentrancy_guard();

            offer_id
        }

        /// Create a new counter-offer.
        ///
        /// The previous Offer record is preserved and transitions:
        ///
        /// Open -> Countered
        ///
        /// A new Offer record is then created:
        ///
        /// Open
        ///
        /// This preserves the complete negotiation chain.
        pub fn counter_offer(
            ref self: ContractState,
            offer_id: felt252,
            price_commitment: felt252,
            terms_hash: felt252,
            expires_at: u64,
        ) -> felt252 {
            self.enter_reentrancy_guard();

            let mut parent_offer =
                self.read_existing_offer(offer_id);

            let caller =
                get_caller_address();

            let now =
                get_block_timestamp();

            // Only the current taker may respond with a counter-offer.
            //
            // This prevents the maker from countering
            // their own currently open offer.
            assert_taker(
                caller,
                parent_offer.taker,
            );

            assert_can_counter(
                parent_offer.status,
            );

            assert_not_expired(
                parent_offer.expires_at,
                now,
            );

            assert_non_zero(
                price_commitment,
                'Invalid price',
            );

            assert_non_zero(
                terms_hash,
                'Invalid terms',
            );

            assert_valid_expiry(
                expires_at,
                now,
            );

            assert_valid_status_transition(
                parent_offer.status,
                OfferStatus::Countered,
            );

            // Close the previous offer.
            parent_offer.status =
                OfferStatus::Countered;

            parent_offer.updated_at =
                now;

            self.offers.write(
                offer_id,
                parent_offer,
            );

            // Create a new independent Offer record.
            let counter_offer_id =
                self.next_offer_id();

            let counter_offer = Offer {
                offer_id: counter_offer_id,

                conversation_tag:
                    parent_offer.conversation_tag,

                // The previous taker becomes the new maker.
                maker: caller,

                // The previous maker becomes the new taker.
                taker: parent_offer.maker,

                // Asset and payment commitments remain inherited
                // from the negotiation thread.
                asset_type_commitment:
                    parent_offer.asset_type_commitment,

                asset_commitment:
                    parent_offer.asset_commitment,

                payment_commitment:
                    parent_offer.payment_commitment,

                // Price and full terms may change.
                price_commitment,
                terms_hash,

                expires_at,

                created_at: now,
                updated_at: now,

                // Preserve the original negotiation root.
                root_offer_id:
                    parent_offer.root_offer_id,

                // Direct parent is the offer being countered.
                parent_offer_id:
                    parent_offer.offer_id,

                status:
                    OfferStatus::Open,

                escrow_id: 0,
            };

            self.write_new_offer(
                counter_offer,
            );

            self.emit(
                Event::CounterOfferCreated(
                    CounterOfferCreated {
                        offer_id:
                            counter_offer_id,

                        counter_of:
                            parent_offer.offer_id,

                        conversation_tag:
                            parent_offer.conversation_tag,

                        price_commitment,
                        terms_hash,

                        expires_at,
                        timestamp: now,
                    },
                ),
            );

            self.exit_reentrancy_guard();

            counter_offer_id
        }

        /// Accept the currently open offer.
        ///
        /// Only the current taker may accept.
        pub fn accept_offer(
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

            assert_can_accept(
                offer.status,
            );

            assert_not_expired(
                offer.expires_at,
                now,
            );

            assert_valid_status_transition(
                offer.status,
                OfferStatus::Accepted,
            );

            offer.status =
                OfferStatus::Accepted;

            offer.updated_at =
                now;

            self.offers.write(
                offer_id,
                offer,
            );

            self.emit(
                Event::OfferAccepted(
                    OfferAccepted {
                        offer_id,

                        conversation_tag:
                            offer.conversation_tag,

                        timestamp: now,
                    },
                ),
            );

            self.exit_reentrancy_guard();
        }
