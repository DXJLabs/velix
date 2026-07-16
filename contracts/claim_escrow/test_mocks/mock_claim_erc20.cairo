use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockClaimERC20<TState> {
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
}

/// Minimal test-only ERC-20 with standard selectors and allowance semantics.
#[starknet::contract]
pub mod MockClaimERC20 {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};

    use super::IMockClaimERC20;

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[abi(embed_v0)]
    impl MockClaimERC20Impl of IMockClaimERC20<ContractState> {
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
            let current_allowance = self.allowances.read((sender, spender));
            assert(current_allowance >= amount, 'MOCK_ALLOWANCE_LOW');
            self.allowances.write((sender, spender), current_allowance - amount);
            self.transfer_tokens(sender, recipient, amount)
        }

        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            let balance = self.balances.read(recipient);
            self.balances.write(recipient, balance + amount);
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
            let zero_address: ContractAddress = 0.try_into().unwrap();
            assert(recipient != zero_address, 'MOCK_ZERO_RECIPIENT');
            let sender_balance = self.balances.read(sender);
            assert(sender_balance >= amount, 'MOCK_BALANCE_LOW');
            let recipient_balance = self.balances.read(recipient);
            self.balances.write(sender, sender_balance - amount);
            self.balances.write(recipient, recipient_balance + amount);
            true
        }
    }
}
