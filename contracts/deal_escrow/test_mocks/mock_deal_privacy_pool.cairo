use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockDealPrivacyPool<TState> {
    fn fund_payment(
        ref self: TState,
        escrow: ContractAddress,
        token: ContractAddress,
        transfer_amount: u128,
        deal_id: felt252,
    );
    fn release_private(
        ref self: TState,
        escrow: ContractAddress,
        deal_id: felt252,
        output_note_id: felt252,
    );
    fn get_last_return_count(self: @TState) -> u64;
    fn get_last_note_id(self: @TState) -> felt252;
    fn get_last_token(self: @TState) -> ContractAddress;
    fn get_last_amount(self: @TState) -> u128;
    fn get_observed_allowance(self: @TState) -> u256;
}

/// Test Pool preserving InvokeExternal order: optional transfer to target,
/// privacy_invoke, then exact OpenNoteDeposit pull.
#[starknet::contract]
pub mod MockDealPrivacyPool {
    use openzeppelin_token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::{ContractAddress, get_contract_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    use super::IMockDealPrivacyPool;
    use crate::deal_escrow::deal_escrow_interfaces::{
        IVeilDealEscrowDispatcher, IVeilDealEscrowDispatcherTrait,
    };
    use crate::deal_escrow::veil_deal_escrow::VeilDealEscrow::{
        PRIVATE_FUND_PAYMENT_ACTION, PRIVATE_RELEASE_ACTION,
    };

    #[storage]
    struct Storage {
        last_return_count: u64,
        last_note_id: felt252,
        last_token: ContractAddress,
        last_amount: u128,
        observed_allowance: u256,
    }

    #[abi(embed_v0)]
    impl MockDealPrivacyPoolImpl of IMockDealPrivacyPool<ContractState> {
        fn fund_payment(
            ref self: ContractState,
            escrow: ContractAddress,
            token: ContractAddress,
            transfer_amount: u128,
            deal_id: felt252,
        ) {
            let erc20 = IERC20Dispatcher { contract_address: token };
            assert(
                erc20.transfer(recipient: escrow, amount: transfer_amount.into()),
                'MOCK_POOL_TRANSFER_FAILED',
            );
            let deal_escrow = IVeilDealEscrowDispatcher { contract_address: escrow };
            let calldata = array![PRIVATE_FUND_PAYMENT_ACTION, deal_id];
            let deposits = deal_escrow.privacy_invoke(calldata.span());
            assert(deposits.is_empty(), 'FUND_RETURN_NOT_EMPTY');
            self.last_return_count.write(0);
        }

        fn release_private(
            ref self: ContractState,
            escrow: ContractAddress,
            deal_id: felt252,
            output_note_id: felt252,
        ) {
            let deal_escrow = IVeilDealEscrowDispatcher { contract_address: escrow };
            let calldata = array![PRIVATE_RELEASE_ACTION, deal_id, output_note_id];
            let deposits = deal_escrow.privacy_invoke(calldata.span());
            assert(deposits.len() == 1, 'RELEASE_RETURN_NOT_ONE');
            self.last_return_count.write(1);

            let deposit = *deposits.at(0);
            self.last_note_id.write(deposit.note_id);
            self.last_token.write(deposit.token);
            self.last_amount.write(deposit.amount);

            let erc20 = IERC20Dispatcher { contract_address: deposit.token };
            let pool = get_contract_address();
            self
                .observed_allowance
                .write(erc20.allowance(owner: escrow, spender: pool));
            assert(
                erc20.transfer_from(
                    sender: escrow, recipient: pool, amount: deposit.amount.into(),
                ),
                'MOCK_POOL_PULL_FAILED',
            );
        }

        fn get_last_return_count(self: @ContractState) -> u64 {
            self.last_return_count.read()
        }

        fn get_last_note_id(self: @ContractState) -> felt252 {
            self.last_note_id.read()
        }

        fn get_last_token(self: @ContractState) -> ContractAddress {
            self.last_token.read()
        }

        fn get_last_amount(self: @ContractState) -> u128 {
            self.last_amount.read()
        }

        fn get_observed_allowance(self: @ContractState) -> u256 {
            self.observed_allowance.read()
        }
    }
}

