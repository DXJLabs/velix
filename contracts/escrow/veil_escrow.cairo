#[starknet::contract]
pub mod VeilEscrow {
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_introspection::src5::SRC5Component::InternalTrait as SRC5InternalTrait;

    use openzeppelin_security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin_security::reentrancyguard::ReentrancyGuardComponent::InternalTrait
        as ReentrancyGuardInternalTrait;

    use starknet::ContractAddress;

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
        IVeilEscrow,
    };

    use crate::escrow::escrow_types::{
        Escrow,
        EscrowStatus,
    };

    use crate::escrow::escrow_validation::{
        assert_non_zero_address,
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

    #[path("../../contracts/escrow/escrow_creation_actions.cairo")]
    mod escrow_creation_actions;

    #[path("../../contracts/escrow/escrow_funding_actions.cairo")]
    mod escrow_funding_actions;

    #[path("../../contracts/escrow/escrow_resolution_actions.cairo")]
    mod escrow_resolution_actions;

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
            escrow_creation_actions::create_escrow(
                ref self,
                conversation_tag,
                offer_id,
                seller,
                asset_type_commitment,
                asset_commitment,
                payment_commitment,
                settlement_adapter,
            )
        }

        fn confirm_buyer_deposit(
            ref self: ContractState,
            escrow_id: felt252,
            deposit_commitment: felt252,
        ) {
            escrow_funding_actions::confirm_buyer_deposit(
                ref self,
                escrow_id,
                deposit_commitment,
            );
        }

        fn confirm_seller_deposit(
            ref self: ContractState,
            escrow_id: felt252,
            deposit_commitment: felt252,
        ) {
            escrow_funding_actions::confirm_seller_deposit(
                ref self,
                escrow_id,
                deposit_commitment,
            );
        }

        fn activate(
            ref self: ContractState,
            escrow_id: felt252,
        ) {
            escrow_funding_actions::activate(
                ref self,
                escrow_id,
            );
        }

        fn settle(
            ref self: ContractState,
            escrow_id: felt252,
        ) {
            escrow_resolution_actions::settle(
                ref self,
                escrow_id,
            );
        }

        fn cancel(
            ref self: ContractState,
            escrow_id: felt252,
        ) {
            escrow_resolution_actions::cancel(
                ref self,
                escrow_id,
            );
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
