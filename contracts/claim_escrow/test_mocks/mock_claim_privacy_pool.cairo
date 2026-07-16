use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockClaimPrivacyPool<TState> {
    fn deposit_claim(
        ref self: TState,
        escrow: ContractAddress,
        token: ContractAddress,
        amount: u128,
        commitment: felt252,
    );
    fn claim(
        ref self: TState, escrow: ContractAddress, secret: felt252, note_id: felt252,
    );
    fn get_last_deposit_return_count(self: @TState) -> u64;
    fn get_last_claim_return_count(self: @TState) -> u64;
    fn get_last_note_id(self: @TState) -> felt252;
    fn get_last_token(self: @TState) -> ContractAddress;
    fn get_last_amount(self: @TState) -> u128;
    fn get_observed_allowance(self: @TState) -> u256;
}

/// Test Pool that preserves the canonical InvokeExternal ordering:
/// transfer-to escrow, call privacy_invoke, then pull each OpenNoteDeposit.
#[starknet::contract]
pub mod MockClaimPrivacyPool {
    use openzeppelin_token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::{ContractAddress, get_contract_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    use super::IMockClaimPrivacyPool;
    use crate::claim_escrow::claim_escrow_interfaces::{
        IVeilClaimEscrowDispatcher, IVeilClaimEscrowDispatcherTrait,
    };
    use crate::claim_escrow::veil_claim_escrow::VeilClaimEscrow::{
        CLAIM_ACTION, DEPOSIT_ACTION,
    };

    #[storage]
    struct Storage {
        last_deposit_return_count: u64,
        last_claim_return_count: u64,
        last_note_id: felt252,
        last_token: ContractAddress,
        last_amount: u128,
        observed_allowance: u256,
    }

    #[abi(embed_v0)]
    impl MockClaimPrivacyPoolImpl of IMockClaimPrivacyPool<ContractState> {
        fn deposit_claim(
            ref self: ContractState,
            escrow: ContractAddress,
            token: ContractAddress,
            amount: u128,
            commitment: felt252,
        ) {
            let erc20 = IERC20Dispatcher { contract_address: token };
            assert(
                erc20.transfer(recipient: escrow, amount: amount.into()),
                'MOCK_TRANSFER_FAILED',
            );

            let claim_escrow = IVeilClaimEscrowDispatcher { contract_address: escrow };
            let calldata = array![DEPOSIT_ACTION, commitment, token.into(), amount.into()];
            let deposits = claim_escrow.privacy_invoke(calldata.span());
            self
                .last_deposit_return_count
                .write(deposits.len().try_into().expect('MOCK_COUNT_OVERFLOW'));
            assert(deposits.is_empty(), 'DEPOSIT_MUST_BE_EMPTY');
        }

        fn claim(
            ref self: ContractState,
            escrow: ContractAddress,
            secret: felt252,
            note_id: felt252,
        ) {
            let claim_escrow = IVeilClaimEscrowDispatcher { contract_address: escrow };
            let calldata = array![CLAIM_ACTION, secret, note_id];
            let deposits = claim_escrow.privacy_invoke(calldata.span());
            self
                .last_claim_return_count
                .write(deposits.len().try_into().expect('MOCK_COUNT_OVERFLOW'));
            assert(deposits.len() == 1, 'CLAIM_MUST_RETURN_ONE');

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
                'MOCK_PULL_FAILED',
            );
        }

        fn get_last_deposit_return_count(self: @ContractState) -> u64 {
            self.last_deposit_return_count.read()
        }

        fn get_last_claim_return_count(self: @ContractState) -> u64 {
            self.last_claim_return_count.read()
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
