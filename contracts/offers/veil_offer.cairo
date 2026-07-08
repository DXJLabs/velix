#[starknet::contract]
pub mod VeilOffer {
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_introspection::src5::SRC5Component::InternalTrait as SRC5InternalTrait;

    use openzeppelin_security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin_security::reentrancyguard::ReentrancyGuardComponent::InternalTrait
        as ReentrancyGuardInternalTrait;

    use starknet::{
        ContractAddress,
        get_block_timestamp,
        get_caller_address,
    };

    use starknet::storage::{
        Map,
        StorageMapReadAccess,
        StorageMapWriteAccess,
        StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };

    use crate::offers::offer_types::{
        Offer,
        OfferStatus,
    };

    use crate::offers::offer_interfaces::IVeilOffer;

    use crate::offers::offer_events::{
        OfferCreated,
        CounterOfferCreated,
        OfferAccepted,
        OfferRejected,
        OfferCancelled,
        OfferExpired,
        OfferConvertedToEscrow,
    };

    use crate::offers::offer_validation::{
        assert_non_zero,
        assert_non_zero_address,
        assert_different_parties,
        assert_maker,
        assert_taker,
        assert_can_counter,
        assert_can_accept,
        assert_can_reject,
        assert_can_cancel,
        assert_can_convert_to_escrow,
        assert_not_expired,
        assert_expired,
        assert_valid_expiry,
        assert_valid_status_transition,
    };

    const IVEIL_OFFER_ID: felt252 =
        0x5645494c5f4f464645525f5631;

    component!(
        path: SRC5Component,
        storage: src5,
        event: SRC5Event
    );

    component!(
        path: ReentrancyGuardComponent,
        storage: reentrancy_guard,
        event: ReentrancyGuardEvent,
    );

    #[abi(embed_v0)]
    impl SRC5Impl =
        SRC5Component::SRC5Impl<ContractState>;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    #[storage]
    struct Storage {
        #[substorage(v0)]
        src5: SRC5Component::Storage,

        #[substorage(v0)]
        reentrancy_guard: ReentrancyGuardComponent::Storage,

        /// Offer state indexed by offer id.
        offers: Map<felt252, Offer>,

        /// Explicit existence marker.
        offer_exists: Map<felt252, bool>,

        /// Number of offer records created.
        ///
        /// Counter-offers are independent Offer records
        /// and therefore increment this count.
        offer_count: u64,

        /// Trusted VeilEscrow contract.
        ///
        /// Only this contract may convert an Accepted offer
        /// into ConvertedToEscrow.
        escrow_contract: ContractAddress,
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        SRC5Event: SRC5Component::Event,

        #[flat]
        ReentrancyGuardEvent:
            ReentrancyGuardComponent::Event,

        OfferCreated: OfferCreated,
        CounterOfferCreated: CounterOfferCreated,
        OfferAccepted: OfferAccepted,
        OfferRejected: OfferRejected,
        OfferCancelled: OfferCancelled,
        OfferExpired: OfferExpired,
        OfferConvertedToEscrow: OfferConvertedToEscrow,
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    #[constructor]
    fn constructor(
        ref self: ContractState,
        escrow_contract: ContractAddress,
    ) {
        assert_non_zero_address(escrow_contract);

        self.escrow_contract.write(escrow_contract);

        self.src5.register_interface(
            IVEIL_OFFER_ID,
        );
    }

    // -------------------------------------------------------------------------
    // External implementation
    // -------------------------------------------------------------------------

    #[abi(embed_v0)]
    impl VeilOfferImpl of IVeilOffer<ContractState> {
        /// Create the initial offer in a negotiation thread.
        ///
        /// This stateful path relies on ContractAddress authorization
        /// and therefore represents the direct/unshielded offer flow.
        fn create_offer(
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
        fn counter_offer(
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
        fn accept_offer(
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

        /// Reject the currently open offer.
        ///
        /// Only the current taker may reject.
        fn reject_offer(
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
        fn cancel_offer(
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
        fn expire_offer(
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
        fn mark_converted_to_escrow(
            ref self: ContractState,
            offer_id: felt252,
            escrow_id: felt252,
        ) {
            self.enter_reentrancy_guard();

            let caller =
                get_caller_address();

            let expected_escrow =
                self.escrow_contract.read();

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

        // ---------------------------------------------------------------------
        // Views
        // ---------------------------------------------------------------------

        fn get_offer(
            self: @ContractState,
            offer_id: felt252,
        ) -> Offer {
            self.read_existing_offer(
                offer_id,
            )
        }

        fn get_offer_status(
            self: @ContractState,
            offer_id: felt252,
        ) -> OfferStatus {
            self.read_existing_offer(
                offer_id,
            ).status
        }

        fn get_escrow_id(
            self: @ContractState,
            offer_id: felt252,
        ) -> felt252 {
            self.read_existing_offer(
                offer_id,
            ).escrow_id
        }

        fn get_offer_count(
            self: @ContractState,
        ) -> u64 {
            self.offer_count.read()
        }

        fn get_escrow_contract(
            self: @ContractState,
        ) -> ContractAddress {
            self.escrow_contract.read()
        }
    }

    // -------------------------------------------------------------------------
    // Internal implementation
    // -------------------------------------------------------------------------

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Read an existing offer or revert.
        fn read_existing_offer(
            self: @ContractState,
            offer_id: felt252,
        ) -> Offer {
            assert(
                offer_id != 0,
                'Invalid offer',
            );

            assert(
                self.offer_exists.read(offer_id),
                'Offer not found',
            );

            self.offers.read(
                offer_id,
            )
        }

        /// Allocate the next sequential offer id.
        ///
        /// Counter-offers are independent Offer records
        /// and therefore receive their own ids.
        fn next_offer_id(
            ref self: ContractState,
        ) -> felt252 {
            let current_count =
                self.offer_count.read();

            let offer_id: felt252 =
                current_count.into() + 1;

            self.offer_count.write(
                current_count + 1,
            );

            offer_id
        }

        /// Persist a newly created Offer record.
        fn write_new_offer(
            ref self: ContractState,
            offer: Offer,
        ) {
            assert(
                offer.offer_id != 0,
                'Invalid offer',
            );

            assert(
                !self.offer_exists.read(
                    offer.offer_id,
                ),
                'Offer exists',
            );

            self.offers.write(
                offer.offer_id,
                offer,
            );

            self.offer_exists.write(
                offer.offer_id,
                true,
            );
        }

        /// Start OpenZeppelin reentrancy protection.
        fn enter_reentrancy_guard(
            ref self: ContractState,
        ) {
            self.reentrancy_guard.start();
        }

        /// End OpenZeppelin reentrancy protection.
        fn exit_reentrancy_guard(
            ref self: ContractState,
        ) {
            self.reentrancy_guard.end();
        }
    }
}
