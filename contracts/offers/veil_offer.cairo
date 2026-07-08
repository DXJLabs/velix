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
    #[path("offer_lifecycle_actions.cairo")]
    mod offer_lifecycle_actions;

    #[path("offer_resolution_actions.cairo")]
    mod offer_resolution_actions;
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
            offer_lifecycle_actions::create_offer(
                ref self,
                conversation_tag,
                taker,
                asset_type_commitment,
                asset_commitment,
                payment_commitment,
                price_commitment,
                terms_hash,
                expires_at,
            )
        }

        fn counter_offer(
            ref self: ContractState,
            offer_id: felt252,
            price_commitment: felt252,
            terms_hash: felt252,
            expires_at: u64,
        ) -> felt252 {
            offer_lifecycle_actions::counter_offer(
                ref self,
                offer_id,
                price_commitment,
                terms_hash,
                expires_at,
            )
        }

        fn accept_offer(
            ref self: ContractState,
            offer_id: felt252,
        ) {
            offer_lifecycle_actions::accept_offer(
                ref self,
                offer_id,
            );
        }

        fn reject_offer(
            ref self: ContractState,
            offer_id: felt252,
        ) {
            offer_resolution_actions::reject_offer(
                ref self,
                offer_id,
            );
        }

        fn cancel_offer(
            ref self: ContractState,
            offer_id: felt252,
        ) {
            offer_resolution_actions::cancel_offer(
                ref self,
                offer_id,
            );
        }

        fn expire_offer(
            ref self: ContractState,
            offer_id: felt252,
        ) {
            offer_resolution_actions::expire_offer(
                ref self,
                offer_id,
            );
        }

        fn mark_converted_to_escrow(
            ref self: ContractState,
            offer_id: felt252,
            escrow_id: felt252,
        ) {
            offer_resolution_actions::mark_converted_to_escrow(
                ref self,
                offer_id,
                escrow_id,
            );
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
