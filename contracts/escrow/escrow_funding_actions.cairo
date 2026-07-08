use starknet::{
    get_block_timestamp,
    get_caller_address,
};
use starknet::event::EventEmitter;
use starknet::storage::StorageMapWriteAccess;

use super::{
    ContractState,
    Event,
    InternalTrait,
};

use crate::events::escrow_events::{
    BuyerDepositConfirmed,
    EscrowActivated,
    SellerDepositConfirmed,
};
use crate::escrow::escrow_types::EscrowStatus;
use crate::escrow::escrow_validation::{
    assert_can_activate,
    assert_can_confirm_buyer_deposit,
    assert_can_confirm_seller_deposit,
    assert_non_zero,
    assert_only_buyer,
    assert_only_seller,
    assert_participant,
    assert_valid_status_transition,
};

        /// Confirm the buyer-side deposit commitment.
        ///
        /// Only the buyer may confirm their deposit.
        pub fn confirm_buyer_deposit(
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
        pub fn confirm_seller_deposit(
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
        pub fn activate(
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
