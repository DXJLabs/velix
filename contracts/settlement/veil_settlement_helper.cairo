use starknet::ContractAddress;
use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
use crate::settlement::settlement_types::SettlementReceipt;
use crate::settlement::settlement_interfaces::IVeilSettlementHelper;

#[starknet::contract]
pub mod VeilSettlementHelper {
    use openzeppelin::interfaces::token::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess, StoragePointerWriteAccess};
    use super::{IVeilSettlementHelper, OpenNoteDeposit, SettlementReceipt};
    use crate::settlement::settlement_events::SettlementPrepared;
    use crate::settlement::settlement_validation::assert_valid_settlement;
    use crate::utils::errors;
    use crate::utils::validation::assert_non_zero_address;

    #[storage]
    struct Storage {
        privacy_pool: ContractAddress,
        settled: Map<felt252, bool>,
        receipts: Map<felt252, SettlementReceipt>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event { SettlementPrepared: SettlementPrepared }

    #[constructor]
    fn constructor(ref self: ContractState, privacy_pool: ContractAddress) {
        assert_non_zero_address(privacy_pool);
        self.privacy_pool.write(privacy_pool);
    }

    #[abi(embed_v0)]
    impl VeilSettlementHelperImpl of IVeilSettlementHelper<ContractState> {
        fn privacy_invoke(
            ref self: ContractState,
            output_note_id: felt252,
            output_token: ContractAddress,
            output_amount: u128,
            settlement_commitment: felt252,
        ) -> Span<OpenNoteDeposit> {
            let privacy_pool = self.privacy_pool.read();
            assert(get_caller_address() == privacy_pool, errors::UNAUTHORIZED_PRIVACY_POOL);
            assert_valid_settlement(output_note_id, output_token, output_amount, settlement_commitment);
            assert(!self.settled.read(settlement_commitment), errors::SETTLEMENT_REPLAY);

            let erc20 = IERC20Dispatcher { contract_address: output_token };
            let self_address = get_contract_address();
            let balance = erc20.balance_of(account: self_address);
            assert(balance >= output_amount.into(), errors::BALANCE_TOO_LOW);

            // Canonical open-note deposits pull tokens from the helper/depositor.
            erc20.approve(spender: privacy_pool, amount: output_amount.into());

            let now = get_block_timestamp();
            let receipt = SettlementReceipt {
                settlement_commitment,
                output_note_id,
                output_amount,
                completed_at: now,
            };
            self.settled.write(settlement_commitment, true);
            self.receipts.write(settlement_commitment, receipt);
            self.emit(SettlementPrepared {
                settlement_commitment,
                output_note_id,
                amount: output_amount,
                timestamp: now,
            });
            [OpenNoteDeposit { note_id: output_note_id, token: output_token, amount: output_amount }].span()
        }

        fn get_privacy_pool(self: @ContractState) -> ContractAddress { self.privacy_pool.read() }
        fn is_settled(self: @ContractState, settlement_commitment: felt252) -> bool { self.settled.read(settlement_commitment) }
        fn get_receipt(self: @ContractState, settlement_commitment: felt252) -> SettlementReceipt { self.receipts.read(settlement_commitment) }
    }
}
