#[starknet::contract]
pub mod VeilEscrow {
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

    use crate::events::escrow_events::{
        BuyerDepositConfirmed,
        EscrowActivated,
        EscrowCancelled,
        EscrowCreated,
        EscrowFundingStarted,
        EscrowSettled,
        SellerDepositConfirmed,
    };

    use crate::interfaces::escrow_interfaces::{
        ISettlementAdapterDispatcher,
        ISettlementAdapterDispatcherTrait,
        IVeilEscrow,
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
        assert_can_activate,
        assert_can_cancel,
        assert_can_confirm_buyer_deposit,
        assert_can_confirm_seller_deposit,
        assert_can_settle,
        assert_different_parties,
        assert_non_zero,
        assert_non_zero_address,
        assert_only_buyer,
        assert_only_seller,
        assert_participant,
        assert_valid_settlement_adapter,
        assert_valid_status_transition,
    };

    const IVEIL_ESCROW_ID: felt252 =
        0x5645494c5f455343524f575f5631;

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

        /// Escrow state indexed by escrow id.
        escrows: Map<felt252, Escrow>,

        /// Explicit escrow existence marker.
        escrow_exists: Map<felt252, bool>,

        /// Number of created escrows.
        escrow_count: u64,

        /// Trusted VeilOffer contract.
        ///
        /// Used to:
        /// - verify that an offer is Accepted
        /// - verify participant and commitment consistency
        /// - bind offer_id -> escrow_id
        offer_contract: ContractAddress,
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

        EscrowCreated: EscrowCreated,
        EscrowFundingStarted: EscrowFundingStarted,
        BuyerDepositConfirmed: BuyerDepositConfirmed,
        SellerDepositConfirmed: SellerDepositConfirmed,
        EscrowActivated: EscrowActivated,
        EscrowSettled: EscrowSettled,
        EscrowCancelled: EscrowCancelled,
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    #[constructor]
    fn constructor(
        ref self: ContractState,
        offer_contract: ContractAddress,
    ) {
        assert_non_zero_address(
            offer_contract,
        );

        self.offer_contract.write(
            offer_contract,
        );

        self.src5.register_interface(
            IVEIL_ESCROW_ID,
        );
    }

    // -------------------------------------------------------------------------
    // External implementation
    // -------------------------------------------------------------------------

    #[abi(embed_v0)]
    impl VeilEscrowImpl of IVeilEscrow<ContractState> {
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
        fn create_escrow(
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

        /// Confirm the buyer-side deposit commitment.
        ///
        /// Only the buyer may confirm their deposit.
        fn confirm_buyer_deposit(
            ref self: ContractState,
            escrow_id: felt252,
            deposit_commitment: felt252,
        ) {
            self.enter_reentrancy_guard();

            let mut escrow =
                self.read_existing_escrow(
                    escrow_id,
                );

            let caller =
                get_caller_address();

            let now =
                get_block_timestamp();

            assert_only_buyer(
                caller,
                escrow.buyer,
            );

            assert_non_zero(
                deposit_commitment,
                'Invalid deposit',
            );

            assert_can_confirm_buyer_deposit(
                escrow.status,
                escrow.buyer_deposited,
            );

            escrow.buyer_deposited =
                true;

            escrow.buyer_deposit_commitment =
                deposit_commitment;

            escrow.updated_at =
                now;

            self.escrows.write(
                escrow_id,
                escrow,
            );

            self.emit(
                Event::BuyerDepositConfirmed(
                    BuyerDepositConfirmed {
                        escrow_id,

                        deposit_commitment,

                        conversation_tag:
                            escrow.conversation_tag,

                        timestamp:
                            now,
                    },
                ),
            );

            self.exit_reentrancy_guard();
        }

        /// Confirm the seller-side deposit commitment.
        ///
        /// Only the seller may confirm their deposit.
        fn confirm_seller_deposit(
            ref self: ContractState,
            escrow_id: felt252,
            deposit_commitment: felt252,
        ) {
            self.enter_reentrancy_guard();

            let mut escrow =
                self.read_existing_escrow(
                    escrow_id,
                );

            let caller =
                get_caller_address();

            let now =
                get_block_timestamp();

            assert_only_seller(
                caller,
                escrow.seller,
            );

            assert_non_zero(
                deposit_commitment,
                'Invalid deposit',
            );

            assert_can_confirm_seller_deposit(
                escrow.status,
                escrow.seller_deposited,
            );

            escrow.seller_deposited =
                true;

            escrow.seller_deposit_commitment =
                deposit_commitment;

            escrow.updated_at =
                now;

            self.escrows.write(
                escrow_id,
                escrow,
            );

            self.emit(
                Event::SellerDepositConfirmed(
                    SellerDepositConfirmed {
                        escrow_id,

                        deposit_commitment,

                        conversation_tag:
                            escrow.conversation_tag,

                        timestamp:
                            now,
                    },
                ),
            );

            self.exit_reentrancy_guard();
        }

        /// Activate a fully funded escrow.
        ///
        /// Either participant may trigger activation after
        /// both deposits have been confirmed.
        fn activate(
            ref self: ContractState,
            escrow_id: felt252,
        ) {
            self.enter_reentrancy_guard();

            let mut escrow =
                self.read_existing_escrow(
                    escrow_id,
                );

            let caller =
                get_caller_address();

            let now =
                get_block_timestamp();

            assert_participant(
                caller,
                escrow.buyer,
                escrow.seller,
            );

            assert_can_activate(
                escrow.status,
                escrow.buyer_deposited,
                escrow.seller_deposited,
            );

            assert_valid_status_transition(
                escrow.status,
                EscrowStatus::Active,
            );

            escrow.status =
                EscrowStatus::Active;

            escrow.updated_at =
                now;

            self.escrows.write(
                escrow_id,
                escrow,
            );

            self.emit(
                Event::EscrowActivated(
                    EscrowActivated {
                        escrow_id,

                        conversation_tag:
                            escrow.conversation_tag,

                        timestamp:
                            now,
                    },
                ),
            );

            self.exit_reentrancy_guard();
        }

        /// Finalize settlement through the configured adapter.
        ///
        /// Flow:
        ///
        /// Active
        ///   -> validate adapter inputs
        ///   -> finalize adapter settlement
        ///   -> persist settlement result
        ///   -> Completed
        fn settle(
            ref self: ContractState,
            escrow_id: felt252,
        ) {
            self.enter_reentrancy_guard();

            let mut escrow =
                self.read_existing_escrow(
                    escrow_id,
                );

            let caller =
                get_caller_address();

            let now =
                get_block_timestamp();

            assert_participant(
                caller,
                escrow.buyer,
                escrow.seller,
            );

            assert_can_settle(
                escrow.status,
            );

            assert_valid_status_transition(
                escrow.status,
                EscrowStatus::Completed,
            );

            let adapter =
                ISettlementAdapterDispatcher {
                    contract_address:
                        escrow.settlement_adapter,
                };

            // -----------------------------------------------------------------
            // Validate settlement
            // -----------------------------------------------------------------

            let is_valid =
                adapter.validate_settlement(
                    escrow.escrow_id,
                    escrow.conversation_tag,
                    escrow.offer_id,
                    escrow.asset_type_commitment,
                    escrow.asset_commitment,
                    escrow.payment_commitment,
                    escrow.buyer_deposit_commitment,
                    escrow.seller_deposit_commitment,
                );

            assert(
                is_valid,
                'Invalid settlement',
            );

            // -----------------------------------------------------------------
            // Finalize settlement
            // -----------------------------------------------------------------

            let settlement_result =
                adapter.finalize_settlement(
                    escrow.escrow_id,
                    escrow.conversation_tag,
                    escrow.offer_id,
                    escrow.asset_commitment,
                    escrow.payment_commitment,
                    escrow.buyer_deposit_commitment,
                    escrow.seller_deposit_commitment,
                );

            assert_non_zero(
                settlement_result,
                'Invalid settlement result',
            );

            // -----------------------------------------------------------------
            // Persist completion
            // -----------------------------------------------------------------

            escrow.status =
                EscrowStatus::Completed;

            escrow.settlement_result =
                settlement_result;

            escrow.updated_at =
                now;

            escrow.completed_at =
                now;

            self.escrows.write(
                escrow_id,
                escrow,
            );

            self.emit(
                Event::EscrowSettled(
                    EscrowSettled {
                        escrow_id,

                        settlement_result,

                        conversation_tag:
                            escrow.conversation_tag,

                        timestamp:
                            now,
                    },
                ),
            );

            self.exit_reentrancy_guard();
        }

        /// Cancel an escrow according to lifecycle policy.
        ///
        /// Allowed:
        /// - Created
        /// - Funding before both deposits are confirmed
        ///
        /// Active escrows require a future dispute/refund flow.
        fn cancel(
            ref self: ContractState,
            escrow_id: felt252,
        ) {
            self.enter_reentrancy_guard();

            let mut escrow =
                self.read_existing_escrow(
                    escrow_id,
                );

            let caller =
                get_caller_address();

            let now =
                get_block_timestamp();

            assert_participant(
                caller,
                escrow.buyer,
                escrow.seller,
            );

            assert_can_cancel(
                escrow.status,
                escrow.buyer_deposited,
                escrow.seller_deposited,
            );

            assert_valid_status_transition(
                escrow.status,
                EscrowStatus::Cancelled,
            );

            escrow.status =
                EscrowStatus::Cancelled;

            escrow.updated_at =
                now;

            self.escrows.write(
                escrow_id,
                escrow,
            );

            self.emit(
                Event::EscrowCancelled(
                    EscrowCancelled {
                        escrow_id,

                        conversation_tag:
                            escrow.conversation_tag,

                        timestamp:
                            now,
                    },
                ),
            );

            self.exit_reentrancy_guard();
        }

        // ---------------------------------------------------------------------
        // Views
        // ---------------------------------------------------------------------

        fn get_escrow(
            self: @ContractState,
            escrow_id: felt252,
        ) -> Escrow {
            self.read_existing_escrow(
                escrow_id,
            )
        }

        fn get_status(
            self: @ContractState,
            escrow_id: felt252,
        ) -> EscrowStatus {
            self.read_existing_escrow(
                escrow_id,
            ).status
        }

        fn get_offer_id(
            self: @ContractState,
            escrow_id: felt252,
        ) -> felt252 {
            self.read_existing_escrow(
                escrow_id,
            ).offer_id
        }

        fn get_settlement_adapter(
            self: @ContractState,
            escrow_id: felt252,
        ) -> ContractAddress {
            self.read_existing_escrow(
                escrow_id,
            ).settlement_adapter
        }

        fn get_escrow_count(
            self: @ContractState,
        ) -> u64 {
            self.escrow_count.read()
        }
    }

    // -------------------------------------------------------------------------
    // Internal implementation
    // -------------------------------------------------------------------------

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Read an existing escrow or revert.
        fn read_existing_escrow(
            self: @ContractState,
            escrow_id: felt252,
        ) -> Escrow {
            assert(
                escrow_id != 0,
                'Invalid escrow',
            );

            assert(
                self.escrow_exists.read(
                    escrow_id,
                ),
                'Escrow not found',
            );

            self.escrows.read(
                escrow_id,
            )
        }

        /// Allocate the next sequential escrow id.
        fn next_escrow_id(
            ref self: ContractState,
        ) -> felt252 {
            let current_count =
                self.escrow_count.read();

            let escrow_id: felt252 =
                current_count.into() + 1;

            self.escrow_count.write(
                current_count + 1,
            );

            escrow_id
        }

        /// Persist a newly created escrow.
        fn write_new_escrow(
            ref self: ContractState,
            escrow: Escrow,
        ) {
            assert(
                escrow.escrow_id != 0,
                'Invalid escrow',
            );

            assert(
                !self.escrow_exists.read(
                    escrow.escrow_id,
                ),
                'Escrow exists',
            );

            self.escrows.write(
                escrow.escrow_id,
                escrow,
            );

            self.escrow_exists.write(
                escrow.escrow_id,
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
