use starknet::{
    get_block_timestamp,
    get_caller_address,
};
use starknet::storage::StorageMapWriteAccess;

use super::{
    ContractState,
    Event,
    InternalTrait,
};

use crate::events::escrow_events::{
    EscrowCancelled,
    EscrowSettled,
};
use crate::interfaces::escrow_interfaces::{
    ISettlementAdapterDispatcher,
    ISettlementAdapterDispatcherTrait,
};
use crate::escrow::escrow_types::EscrowStatus;
use crate::escrow::escrow_validation::{
    assert_can_cancel,
    assert_can_settle,
    assert_non_zero,
    assert_participant,
    assert_valid_status_transition,
};

        /// Finalize settlement through the configured adapter.
        ///
        /// Flow:
        ///
        /// Active
        ///   -> validate adapter inputs
        ///   -> finalize adapter settlement
        ///   -> persist settlement result
        ///   -> Completed
        pub fn settle(
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
        pub fn cancel(
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
