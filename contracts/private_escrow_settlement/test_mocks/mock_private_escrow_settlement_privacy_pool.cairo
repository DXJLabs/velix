use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockPrivateEscrowSettlementPrivacyPool<TState> {
    fn deposit_custody(
        ref self: TState,
        settlement: ContractAddress,
        token: ContractAddress,
        amount: u128,
        custody_commitment: felt252,
        release_commitment: felt252,
        refund_commitment: felt252,
        refund_after: u64,
    );

    fn release_custody(
        ref self: TState,
        settlement: ContractAddress,
        custody_commitment: felt252,
        release_secret: felt252,
        output_note_id: felt252,
    );

    fn refund_custody(
        ref self: TState,
        settlement: ContractAddress,
        custody_commitment: felt252,
        refund_secret: felt252,
        output_note_id: felt252,
    );

    fn get_last_deposit_return_count(
        self: @TState,
    ) -> u64;

    fn get_last_settlement_return_count(
        self: @TState,
    ) -> u64;

    fn get_last_note_id(
        self: @TState,
    ) -> felt252;

    fn get_last_token(
        self: @TState,
    ) -> ContractAddress;

    fn get_last_amount(
        self: @TState,
    ) -> u128;

    fn get_observed_allowance(
        self: @TState,
    ) -> u256;
}

#[starknet::contract]
pub mod MockPrivateEscrowSettlementPrivacyPool {
    use openzeppelin_token::erc20::interface::{
        IERC20Dispatcher,
        IERC20DispatcherTrait,
    };
    use starknet::{
        ContractAddress,
        get_contract_address,
    };
    use starknet::storage::{
        StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };

    use super::IMockPrivateEscrowSettlementPrivacyPool;
    use crate::private_escrow_settlement::
        private_escrow_settlement_interfaces::{
            IVeilPrivateEscrowSettlementDispatcher,
            IVeilPrivateEscrowSettlementDispatcherTrait,
        };
    use crate::private_escrow_settlement::
        veil_private_escrow_settlement::
            VeilPrivateEscrowSettlement::{
                DEPOSIT_ACTION,
                REFUND_ACTION,
                RELEASE_ACTION,
            };

    #[storage]
    struct Storage {
        last_deposit_return_count: u64,
        last_settlement_return_count: u64,
        last_note_id: felt252,
        last_token: ContractAddress,
        last_amount: u128,
        observed_allowance: u256,
    }

    #[abi(embed_v0)]
    impl MockPrivateEscrowSettlementPrivacyPoolImpl
        of IMockPrivateEscrowSettlementPrivacyPool<ContractState>
    {
        fn deposit_custody(
            ref self: ContractState,
            settlement: ContractAddress,
            token: ContractAddress,
            amount: u128,
            custody_commitment: felt252,
            release_commitment: felt252,
            refund_commitment: felt252,
            refund_after: u64,
        ) {
            let erc20 = IERC20Dispatcher {
                contract_address: token,
            };
            assert(
                erc20.transfer(
                    recipient: settlement,
                    amount: amount.into(),
                ),
                'MOCK_TRANSFER_FAILED',
            );

            let dispatcher =
                IVeilPrivateEscrowSettlementDispatcher {
                    contract_address: settlement,
                };

            let calldata = array![
                DEPOSIT_ACTION,
                custody_commitment,
                release_commitment,
                refund_commitment,
                refund_after.into(),
                token.into(),
                amount.into(),
            ];

            let deposits =
                dispatcher.privacy_invoke(calldata.span());

            self
                .last_deposit_return_count
                .write(
                    deposits
                        .len()
                        .try_into()
                        .expect('MOCK_COUNT_OVERFLOW'),
                );

            assert(
                deposits.is_empty(),
                'DEPOSIT_MUST_BE_EMPTY',
            );
        }

        fn release_custody(
            ref self: ContractState,
            settlement: ContractAddress,
            custody_commitment: felt252,
            release_secret: felt252,
            output_note_id: felt252,
        ) {
            let dispatcher =
                IVeilPrivateEscrowSettlementDispatcher {
                    contract_address: settlement,
                };

            let calldata = array![
                RELEASE_ACTION,
                custody_commitment,
                release_secret,
                output_note_id,
            ];

            let deposits =
                dispatcher.privacy_invoke(calldata.span());

            self.consume_output(settlement, deposits);
        }

        fn refund_custody(
            ref self: ContractState,
            settlement: ContractAddress,
            custody_commitment: felt252,
            refund_secret: felt252,
            output_note_id: felt252,
        ) {
            let dispatcher =
                IVeilPrivateEscrowSettlementDispatcher {
                    contract_address: settlement,
                };

            let calldata = array![
                REFUND_ACTION,
                custody_commitment,
                refund_secret,
                output_note_id,
            ];

            let deposits =
                dispatcher.privacy_invoke(calldata.span());

            self.consume_output(settlement, deposits);
        }

        fn get_last_deposit_return_count(
            self: @ContractState,
        ) -> u64 {
            self.last_deposit_return_count.read()
        }

        fn get_last_settlement_return_count(
            self: @ContractState,
        ) -> u64 {
            self.last_settlement_return_count.read()
        }

        fn get_last_note_id(
            self: @ContractState,
        ) -> felt252 {
            self.last_note_id.read()
        }

        fn get_last_token(
            self: @ContractState,
        ) -> ContractAddress {
            self.last_token.read()
        }

        fn get_last_amount(
            self: @ContractState,
        ) -> u128 {
            self.last_amount.read()
        }

        fn get_observed_allowance(
            self: @ContractState,
        ) -> u256 {
            self.observed_allowance.read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn consume_output(
            ref self: ContractState,
            settlement: ContractAddress,
            deposits: Span<
                crate::interfaces::
                    privacy_pool_types::OpenNoteDeposit,
            >,
        ) {
            self
                .last_settlement_return_count
                .write(
                    deposits
                        .len()
                        .try_into()
                        .expect('MOCK_COUNT_OVERFLOW'),
                );

            assert(
                deposits.len() == 1,
                'SETTLE_MUST_RETURN_ONE',
            );

            let deposit = *deposits.at(0);

            self.last_note_id.write(deposit.note_id);
            self.last_token.write(deposit.token);
            self.last_amount.write(deposit.amount);

            let erc20 = IERC20Dispatcher {
                contract_address: deposit.token,
            };
            let pool = get_contract_address();

            self.observed_allowance.write(
                erc20.allowance(
                    owner: settlement,
                    spender: pool,
                ),
            );

            assert(
                erc20.transfer_from(
                    sender: settlement,
                    recipient: pool,
                    amount: deposit.amount.into(),
                ),
                'MOCK_PULL_FAILED',
            );
        }
    }
}
