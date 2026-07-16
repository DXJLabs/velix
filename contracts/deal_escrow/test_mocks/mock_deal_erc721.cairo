use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockDealERC721<TState> {
    fn owner_of(self: @TState, token_id: u256) -> ContractAddress;
    fn approve(ref self: TState, to: ContractAddress, token_id: u256);
    fn get_approved(self: @TState, token_id: u256) -> ContractAddress;
    fn transfer_from(
        ref self: TState, from: ContractAddress, to: ContractAddress, token_id: u256,
    );
    fn mint(ref self: TState, recipient: ContractAddress, token_id: u256);
    fn approve_for(
        ref self: TState,
        owner: ContractAddress,
        operator: ContractAddress,
        token_id: u256,
    );
}

/// Test-only ERC-721 subset using the canonical owner/approval selectors.
#[starknet::contract]
pub mod MockDealERC721 {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};

    use super::IMockDealERC721;

    #[storage]
    struct Storage {
        owners: Map<u256, ContractAddress>,
        approvals: Map<u256, ContractAddress>,
    }

    #[abi(embed_v0)]
    impl MockDealERC721Impl of IMockDealERC721<ContractState> {
        fn owner_of(self: @ContractState, token_id: u256) -> ContractAddress {
            let owner = self.owners.read(token_id);
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(owner != zero, 'MOCK_NFT_NOT_MINTED');
            owner
        }

        fn approve(ref self: ContractState, to: ContractAddress, token_id: u256) {
            assert(
                self.owners.read(token_id) == get_caller_address(),
                'MOCK_NOT_NFT_OWNER',
            );
            self.approvals.write(token_id, to);
        }

        fn get_approved(self: @ContractState, token_id: u256) -> ContractAddress {
            self.approvals.read(token_id)
        }

        fn transfer_from(
            ref self: ContractState,
            from: ContractAddress,
            to: ContractAddress,
            token_id: u256,
        ) {
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(to != zero, 'MOCK_ZERO_RECIPIENT');
            assert(self.owners.read(token_id) == from, 'MOCK_WRONG_FROM');
            let caller = get_caller_address();
            assert(
                caller == from || self.approvals.read(token_id) == caller,
                'MOCK_NFT_NOT_APPROVED',
            );
            self.owners.write(token_id, to);
            self.approvals.write(token_id, zero);
        }

        fn mint(ref self: ContractState, recipient: ContractAddress, token_id: u256) {
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(recipient != zero, 'MOCK_ZERO_RECIPIENT');
            assert(self.owners.read(token_id) == zero, 'MOCK_NFT_EXISTS');
            self.owners.write(token_id, recipient);
        }

        fn approve_for(
            ref self: ContractState,
            owner: ContractAddress,
            operator: ContractAddress,
            token_id: u256,
        ) {
            assert(self.owners.read(token_id) == owner, 'MOCK_WRONG_OWNER');
            self.approvals.write(token_id, operator);
        }
    }
}

