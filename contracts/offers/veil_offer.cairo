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
    use starknet::event::EventEmitter;

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
        ShieldedOfferAction,
    };

    use crate::interfaces::privacy_pool_types::OpenNoteDeposit;

    use crate::offers::offer_commitments::{
        compute_shielded_offer_action_commitment,
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
        ShieldedOfferActionCommitted,
    };

    use crate::offers::offer_validation::{
        assert_non_zero,
        assert_non_zero_address,
        assert_supported_shielded_action,
        assert_valid_expiry,
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

    #[path("../../contracts/offers/offer_lifecycle_actions.cairo")]
    mod offer_lifecycle_actions;

    #[path("../../contracts/offers/offer_resolution_actions.cairo")]
    mod offer_resolution_actions;

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

        /// Exact encrypted terms commitments consumed by direct create/counter
        /// operations. A randomized, context-bound ciphertext envelope should
        /// produce a fresh commitment for every legitimate action.
        used_terms_commitments: Map<felt252, bool>,

        /// Canonical Privacy Pool allowed to call privacy_invoke.
        privacy_pool: ContractAddress,

        /// Append-only encrypted action journal for the Pool path.
        shielded_actions: Map<u64, ShieldedOfferAction>,
        shielded_action_count: u64,
        used_shielded_action_commitments: Map<felt252, bool>,
        used_shielded_nullifiers: Map<felt252, bool>,

        /// Trusted VeilEscrow contract.
        ///
        /// Only this contract may convert an Accepted offer
        /// into ConvertedToEscrow.
        escrow_contract: ContractAddress,

        /// Deployment owner allowed to complete two-step wiring.
        owner: ContractAddress,
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
        ShieldedOfferActionCommitted: ShieldedOfferActionCommitted,
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    #[constructor]
    fn constructor(
        ref self: ContractState,
        privacy_pool: ContractAddress,
        escrow_contract: ContractAddress,
        owner: ContractAddress,
    ) {
        assert_non_zero_address(privacy_pool);
        assert_non_zero_address(owner);

        let zero_address: ContractAddress =
            0.try_into().unwrap();

        if escrow_contract != zero_address {
            assert_non_zero_address(escrow_contract);
        }

        self.privacy_pool.write(privacy_pool);
        self.escrow_contract.write(escrow_contract);
        self.owner.write(owner);

        self.src5.register_interface(
            IVEIL_OFFER_ID,
        );
    }

    // -------------------------------------------------------------------------
    // External implementation
    // -------------------------------------------------------------------------

    #[abi(embed_v0)]
    impl VeilOfferImpl of IVeilOffer<ContractState> {
        /// Store one fixed-schema encrypted offer action from the pinned Pool.
        ///
        /// Pool provenance alone cannot prove which direct ContractAddress is
        /// the maker/taker. Consequently this append-only journal never mutates
        /// the account-authorized Offer lifecycle below. Pure shielded offer
        /// actions remain UNVERIFIED until proof-backed participant
        /// authorization and live E2E exist.
        fn privacy_invoke(
            ref self: ContractState,
            calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            assert(
                get_caller_address() == self.privacy_pool.read(),
                'Not privacy pool',
            );

            // Fixed calldata only. There is intentionally no target, selector,
            // nested call array, or arbitrary external-call surface.
            assert(calldata.len() == 6, 'Invalid offer calldata');

            self.enter_reentrancy_guard();

            let action_kind = *calldata.at(0);
            let conversation_tag = *calldata.at(1);
            let encrypted_payload_commitment = *calldata.at(2);
            let valid_until: u64 = (*calldata.at(3))
                .try_into()
                .expect('Invalid offer expiry');
            let replay_nullifier = *calldata.at(4);
            let claimed_action_commitment = *calldata.at(5);
            let now = get_block_timestamp();

            assert_supported_shielded_action(action_kind);
            assert_non_zero(conversation_tag, 'Invalid conversation');
            assert_non_zero(encrypted_payload_commitment, 'Invalid encrypted terms');
            assert_non_zero(replay_nullifier, 'Invalid offer nullifier');
            assert_non_zero(claimed_action_commitment, 'Invalid offer commitment');
            assert_valid_expiry(valid_until, now);

            let computed_action_commitment = compute_shielded_offer_action_commitment(
                action_kind,
                conversation_tag,
                encrypted_payload_commitment,
                valid_until,
                replay_nullifier,
            );

            assert(
                computed_action_commitment == claimed_action_commitment,
                'Offer commitment mismatch',
            );
            assert(
                !self.used_shielded_action_commitments.read(computed_action_commitment),
                'Offer action replay',
            );
            assert(
                !self.used_shielded_nullifiers.read(replay_nullifier),
                'Offer nullifier replay',
            );

            let action_index = self.shielded_action_count.read() + 1;
            let action = ShieldedOfferAction {
                action_index,
                action_kind,
                conversation_tag,
                encrypted_payload_commitment,
                valid_until,
                replay_nullifier,
                action_commitment: computed_action_commitment,
                created_at: now,
            };

            // Effects precede the event; this entry point performs no external
            // calls and returns no deposits.
            self.shielded_actions.write(action_index, action);
            self.shielded_action_count.write(action_index);
            self.used_shielded_action_commitments.write(computed_action_commitment, true);
            self.used_shielded_nullifiers.write(replay_nullifier, true);

            self.emit(
                Event::ShieldedOfferActionCommitted(
                    ShieldedOfferActionCommitted {
                        conversation_tag,
                        action_index,
                        action_kind,
                        action_commitment: computed_action_commitment,
                        timestamp: now,
                    },
                ),
            );

            self.exit_reentrancy_guard();
            ArrayTrait::<OpenNoteDeposit>::new().span()
        }

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

        fn set_escrow_contract(
            ref self: ContractState,
            escrow_contract: ContractAddress,
        ) {
            let caller =
                get_caller_address();

            assert(
                caller == self.owner.read(),
                'Only owner',
            );

            assert_non_zero_address(escrow_contract);

            let zero_address: ContractAddress =
                0.try_into().unwrap();

            let current_escrow =
                self.escrow_contract.read();

            assert(
                current_escrow == zero_address
                    || current_escrow == escrow_contract,
                'Escrow already set',
            );

            self.escrow_contract.write(escrow_contract);
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

        fn get_offer_commitment(
            self: @ContractState,
            offer_id: felt252,
        ) -> felt252 {
            self.read_existing_offer(offer_id).offer_commitment
        }

        fn is_terms_commitment_used(
            self: @ContractState,
            terms_hash: felt252,
        ) -> bool {
            self.used_terms_commitments.read(terms_hash)
        }

        fn get_shielded_action_count(
            self: @ContractState,
        ) -> u64 {
            self.shielded_action_count.read()
        }

        fn get_shielded_action(
            self: @ContractState,
            action_index: u64,
        ) -> ShieldedOfferAction {
            let count = self.shielded_action_count.read();
            assert(
                action_index != 0 && action_index <= count,
                'Shielded action not found',
            );
            self.shielded_actions.read(action_index)
        }

        fn is_shielded_action_committed(
            self: @ContractState,
            action_commitment: felt252,
        ) -> bool {
            self.used_shielded_action_commitments.read(action_commitment)
        }

        fn is_shielded_nullifier_used(
            self: @ContractState,
            replay_nullifier: felt252,
        ) -> bool {
            self.used_shielded_nullifiers.read(replay_nullifier)
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

        fn get_privacy_pool(
            self: @ContractState,
        ) -> ContractAddress {
            self.privacy_pool.read()
        }

        fn get_owner(
            self: @ContractState,
        ) -> ContractAddress {
            self.owner.read()
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

        /// Consume a randomized ciphertext/terms commitment once globally.
        /// Reusing an exact encrypted envelope is treated as replay even across
        /// conversations; legitimate retries must rebuild encryption with a
        /// fresh nonce and therefore a fresh commitment.
        fn reserve_terms_commitment(
            ref self: ContractState,
            terms_hash: felt252,
        ) {
            assert(terms_hash != 0, 'Invalid terms');
            assert(
                !self.used_terms_commitments.read(terms_hash),
                'Offer replay',
            );
            self.used_terms_commitments.write(terms_hash, true);
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
