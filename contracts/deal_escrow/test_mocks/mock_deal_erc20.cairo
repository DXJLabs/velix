use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockDealERC20<TState> {
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn allowance(
        self: @TState, owner: ContractAddress, spender: ContractAddress,
    ) -> u256;
    fn approve(ref self: TState, spender: ContractAddress, amount: u256) -> bool;
    fn transfer(ref self: TState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TState,
        sender: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) -> bool;
    fn mint(ref self: TState, recipient: ContractAddress, amount: u256);
    fn set_allowance_for(
        ref self: TState,
        owner: ContractAddress,
        spender: ContractAddress,
        amount: u256,
    );
}

/// Test-only ERC-20 with standard selectors and explicit fixture setup.
#[starknet::contract]
pub mod MockDealERC20 {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};

    use super::IMockDealERC20;

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[abi(embed_v0)]
    impl MockDealERC20Impl of IMockDealERC20<ContractState> {
        fn balance_of(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.read(account)
        }

        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress,
        ) -> u256 {
            self.allowances.read((owner, spender))
        }

        fn approve(
            ref self: ContractState, spender: ContractAddress, amount: u256,
        ) -> bool {
            self.allowances.write((get_caller_address(), spender), amount);
            true
        }

        fn transfer(
            ref self: ContractState, recipient: ContractAddress, amount: u256,
        ) -> bool {
            self.transfer_tokens(get_caller_address(), recipient, amount)
        }

        fn transfer_from(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let spender = get_caller_address();
            let current = self.allowances.read((sender, spender));
            assert(current >= amount, 'MOCK_ALLOWANCE_LOW');
            self.allowances.write((sender, spender), current - amount);
            self.transfer_tokens(sender, recipient, amount)
        }

        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            self.balances.write(recipient, self.balances.read(recipient) + amount);
        }

        fn set_allowance_for(
            ref self: ContractState,
            owner: ContractAddress,
            spender: ContractAddress,
            amount: u256,
        ) {
            self.allowances.write((owner, spender), amount);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn transfer_tokens(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(recipient != zero, 'MOCK_ZERO_RECIPIENT');
            let sender_balance = self.balances.read(sender);
            assert(sender_balance >= amount, 'MOCK_BALANCE_LOW');
            self.balances.write(sender, sender_balance - amount);
            self.balances.write(recipient, self.balances.read(recipient) + amount);
            true
        }
    }
}

