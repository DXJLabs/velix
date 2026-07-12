use starknet::ContractAddress;

#[starknet::interface]
pub trait IVeilEncryptionKeyRegistry<TContractState> {
    fn register_public_key(ref self: TContractState, public_key: felt252);
    fn get_public_key(self: @TContractState, account: ContractAddress) -> felt252;
    fn get_key_version(self: @TContractState, account: ContractAddress) -> u64;
}

#[starknet::contract]
pub mod VeilEncryptionKeyRegistry {
    use super::IVeilEncryptionKeyRegistry;
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess,
    };

    #[storage]
    struct Storage {
        public_keys: Map<ContractAddress, felt252>,
        key_versions: Map<ContractAddress, u64>,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PublicKeyRegistered {
        #[key]
        pub account: ContractAddress,
        pub public_key: felt252,
        pub version: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct PublicKeyRotated {
        #[key]
        pub account: ContractAddress,
        pub public_key: felt252,
        pub version: u64,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        PublicKeyRegistered: PublicKeyRegistered,
        PublicKeyRotated: PublicKeyRotated,
    }

    #[abi(embed_v0)]
    impl RegistryImpl of IVeilEncryptionKeyRegistry<ContractState> {
        fn register_public_key(ref self: ContractState, public_key: felt252) {
            assert(public_key != 0, 'Invalid public key');
            let account = get_caller_address();
            let current_version = self.key_versions.read(account);
            if current_version != 0 && self.public_keys.read(account) == public_key {
                return;
            }
            let next_version = current_version + 1;
            self.public_keys.write(account, public_key);
            self.key_versions.write(account, next_version);

            if current_version == 0 {
                self.emit(Event::PublicKeyRegistered(PublicKeyRegistered {
                    account, public_key, version: next_version,
                }));
            } else {
                self.emit(Event::PublicKeyRotated(PublicKeyRotated {
                    account, public_key, version: next_version,
                }));
            }
        }

        fn get_public_key(self: @ContractState, account: ContractAddress) -> felt252 {
            self.public_keys.read(account)
        }

        fn get_key_version(self: @ContractState, account: ContractAddress) -> u64 {
            self.key_versions.read(account)
        }
    }
}
