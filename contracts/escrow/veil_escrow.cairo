#[starknet::contract]
pub mod VeilEscrow {
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_introspection::src5::SRC5Component::InternalTrait as SRC5InternalTrait;
    use openzeppelin_security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin_security::reentrancyguard::ReentrancyGuardComponent::InternalTrait as ReentrancyGuardInternalTrait;
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use crate::events::escrow_events::{
        BuyerDepositConfirmed, EscrowActivated, EscrowCancelled, EscrowCreated, EscrowSettled,
        SellerDepositConfirmed,
    };
    use crate::interfaces::escrow_interfaces::IVeilEscrow;
    use crate::escrow::escrow_types::{Escrow, EscrowStatus};
    use crate::escrow::escrow_validation::{
        assert_active, assert_can_activate, assert_can_cancel, assert_non_zero_address,
        assert_not_completed, assert_only_buyer, assert_only_seller, assert_participant,
        assert_valid_status_transition,
    };

    const IVEIL_ESCROW_ID: felt252 = 0x5645494c5f455343524f575f5631;

    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(
        path: ReentrancyGuardComponent,
        storage: reentrancy_guard,
        event: ReentrancyGuardEvent,
    );

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        reentrancy_guard: ReentrancyGuardComponent::Storage,
        escrows: Map<felt252, Escrow>,
        escrow_exists: Map<felt252, bool>,
        escrow_count: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
        EscrowCreated: EscrowCreated,
        BuyerDepositConfirmed: BuyerDepositConfirmed,
        SellerDepositConfirmed: SellerDepositConfirmed,
        EscrowActivated: EscrowActivated,
        EscrowSettled: EscrowSettled,
        EscrowCancelled: EscrowCancelled,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.src5.register_interface(IVEIL_ESCROW_ID);
    }

    #[abi(embed_v0)]
    impl VeilEscrowImpl of IVeilEscrow<ContractState> {
        fn create_escrow(
            ref self: ContractState,
            channel_id: felt252,
            seller: ContractAddress,
            asset_type: felt252,
            asset_reference: felt252,
            payment_reference: felt252,
        ) -> felt252 {
            self.enter_reentrancy_guard();

            let buyer = get_caller_address();
            assert_non_zero_address(buyer);
            assert_non_zero_address(seller);
            assert(buyer != seller, 'Same party');
            assert(channel_id != 0, 'Invalid channel');
            assert(asset_type != 0, 'Invalid asset type');
            assert(asset_reference != 0, 'Invalid asset ref');
            assert(payment_reference != 0, 'Invalid payment ref');

            let current_count = self.escrow_count.read();
            let escrow_id = current_count.into() + 1;
            let timestamp = get_block_timestamp();

            let escrow = Escrow {
                escrow_id,
                channel_id,
                buyer,
                seller,
                asset_type,
                asset_reference,
                payment_reference,
                buyer_deposited: false,
                seller_deposited: false,
                status: EscrowStatus::Created,
                created_at: timestamp,
            };

            self.escrows.write(escrow_id, escrow);
            self.escrow_exists.write(escrow_id, true);
            self.escrow_count.write(current_count + 1);
            self
                .emit(
                    Event::EscrowCreated(
                        EscrowCreated {
                            escrow_id,
                            channel_id,
                            buyer,
                            seller,
                            asset_type,
                            asset_reference,
                            payment_reference,
                            timestamp,
                        },
                    ),
                );

            self.exit_reentrancy_guard();
            escrow_id
        }

        fn confirm_buyer_deposit(ref self: ContractState, escrow_id: felt252) {
            self.enter_reentrancy_guard();
            let mut escrow = self.read_existing_escrow(escrow_id);
            let caller = get_caller_address();

            assert_only_buyer(caller, escrow.buyer);
            assert_not_completed(escrow.status);
            assert_can_cancel(escrow.status);
            assert(!escrow.buyer_deposited, 'Buyer deposit exists');

            escrow.buyer_deposited = true;
            self.escrows.write(escrow_id, escrow);
            self
                .emit(
                    Event::BuyerDepositConfirmed(
                        BuyerDepositConfirmed {
                            escrow_id,
                            channel_id: escrow.channel_id,
                            timestamp: get_block_timestamp(),
                        },
                    ),
                );
            self.exit_reentrancy_guard();
        }

        fn confirm_seller_deposit(ref self: ContractState, escrow_id: felt252) {
            self.enter_reentrancy_guard();
            let mut escrow = self.read_existing_escrow(escrow_id);
            let caller = get_caller_address();

            assert_only_seller(caller, escrow.seller);
            assert_not_completed(escrow.status);
            assert_can_cancel(escrow.status);
            assert(!escrow.seller_deposited, 'Seller deposit exists');

            escrow.seller_deposited = true;
            self.escrows.write(escrow_id, escrow);
            self
                .emit(
                    Event::SellerDepositConfirmed(
                        SellerDepositConfirmed {
                            escrow_id,
                            channel_id: escrow.channel_id,
                            timestamp: get_block_timestamp(),
                        },
                    ),
                );
            self.exit_reentrancy_guard();
        }

        fn activate(ref self: ContractState, escrow_id: felt252) {
            self.enter_reentrancy_guard();
            let mut escrow = self.read_existing_escrow(escrow_id);
            let caller = get_caller_address();

            assert_participant(caller, escrow.buyer, escrow.seller);
            assert_can_activate(escrow.status, escrow.buyer_deposited, escrow.seller_deposited);
            assert_valid_status_transition(escrow.status, EscrowStatus::Active);

            escrow.status = EscrowStatus::Active;
            self.escrows.write(escrow_id, escrow);
            self
                .emit(
                    Event::EscrowActivated(
                        EscrowActivated {
                            escrow_id,
                            channel_id: escrow.channel_id,
                            timestamp: get_block_timestamp(),
                        },
                    ),
                );
            self.exit_reentrancy_guard();
        }

        fn settle(ref self: ContractState, escrow_id: felt252) {
            self.enter_reentrancy_guard();
            let mut escrow = self.read_existing_escrow(escrow_id);
            let caller = get_caller_address();

            assert_participant(caller, escrow.buyer, escrow.seller);
            assert_not_completed(escrow.status);
            assert_active(escrow.status);
            assert_valid_status_transition(escrow.status, EscrowStatus::Completed);

            escrow.status = EscrowStatus::Completed;
            self.escrows.write(escrow_id, escrow);
            self
                .emit(
                    Event::EscrowSettled(
                        EscrowSettled {
                            escrow_id,
                            channel_id: escrow.channel_id,
                            timestamp: get_block_timestamp(),
                        },
                    ),
                );
            self.exit_reentrancy_guard();
        }

        fn cancel(ref self: ContractState, escrow_id: felt252) {
            self.enter_reentrancy_guard();
            let mut escrow = self.read_existing_escrow(escrow_id);
            let caller = get_caller_address();

            assert_participant(caller, escrow.buyer, escrow.seller);
            assert_not_completed(escrow.status);
            assert_can_cancel(escrow.status);
            assert_valid_status_transition(escrow.status, EscrowStatus::Cancelled);

            escrow.status = EscrowStatus::Cancelled;
            self.escrows.write(escrow_id, escrow);
            self
                .emit(
                    Event::EscrowCancelled(
                        EscrowCancelled {
                            escrow_id,
                            channel_id: escrow.channel_id,
                            timestamp: get_block_timestamp(),
                        },
                    ),
                );
            self.exit_reentrancy_guard();
        }

        fn get_escrow(self: @ContractState, escrow_id: felt252) -> Escrow {
            self.read_existing_escrow(escrow_id)
        }

        fn get_status(self: @ContractState, escrow_id: felt252) -> EscrowStatus {
            self.read_existing_escrow(escrow_id).status
        }

        fn get_escrow_count(self: @ContractState) -> u64 {
            self.escrow_count.read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn read_existing_escrow(self: @ContractState, escrow_id: felt252) -> Escrow {
            assert(escrow_id != 0, 'Invalid escrow');
            assert(self.escrow_exists.read(escrow_id), 'Invalid escrow');
            self.escrows.read(escrow_id)
        }

        fn enter_reentrancy_guard(ref self: ContractState) {
            self.reentrancy_guard.start();
        }

        fn exit_reentrancy_guard(ref self: ContractState) {
            self.reentrancy_guard.end();
        }
    }
}
