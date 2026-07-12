use snforge_std::{ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address};
use starknet::ContractAddress;
use veilc::veil_encryption_key_registry::{
    IVeilEncryptionKeyRegistryDispatcher, IVeilEncryptionKeyRegistryDispatcherTrait,
};

const ALICE: felt252 = 0x111;
const BOB: felt252 = 0x222;

fn address(value: felt252) -> ContractAddress {
    value.try_into().unwrap()
}

fn deploy_registry() -> ContractAddress {
    let contract = declare("VeilEncryptionKeyRegistry").unwrap().contract_class();
    let calldata = ArrayTrait::<felt252>::new();
    let (contract_address, _) = contract.deploy(@calldata).unwrap();
    contract_address
}

#[test]
fn registers_and_rotates_only_the_callers_key() {
    let contract_address = deploy_registry();
    let registry = IVeilEncryptionKeyRegistryDispatcher { contract_address };

    start_cheat_caller_address(contract_address, address(ALICE));
    registry.register_public_key(12345);
    assert(registry.get_public_key(address(ALICE)) == 12345, 'Alice key missing');
    assert(registry.get_key_version(address(ALICE)) == 1, 'Alice version 1');
    assert(registry.get_public_key(address(BOB)) == 0, 'Bob key changed');

    registry.register_public_key(67890);
    assert(registry.get_public_key(address(ALICE)) == 67890, 'Alice rotation missing');
    assert(registry.get_key_version(address(ALICE)) == 2, 'Alice version 2');
    assert(registry.get_public_key(address(BOB)) == 0, 'Bob key changed');
}

#[test]
#[should_panic(expected: 'Invalid public key')]
fn rejects_zero_public_key() {
    let contract_address = deploy_registry();
    let registry = IVeilEncryptionKeyRegistryDispatcher { contract_address };
    start_cheat_caller_address(contract_address, address(ALICE));
    registry.register_public_key(0);
}

#[test]
fn unregistered_account_has_zero_key_and_version() {
    let registry = IVeilEncryptionKeyRegistryDispatcher { contract_address: deploy_registry() };
    assert(registry.get_public_key(address(ALICE)) == 0, 'Unexpected key');
    assert(registry.get_key_version(address(ALICE)) == 0, 'Unexpected version');
}

#[test]
fn accounts_keep_independent_records() {
    let contract_address = deploy_registry();
    let registry = IVeilEncryptionKeyRegistryDispatcher { contract_address };
    start_cheat_caller_address(contract_address, address(ALICE));
    registry.register_public_key(12345);
    start_cheat_caller_address(contract_address, address(BOB));
    registry.register_public_key(67890);
    assert(registry.get_public_key(address(ALICE)) == 12345, 'Alice key changed');
    assert(registry.get_public_key(address(BOB)) == 67890, 'Bob key missing');
    assert(registry.get_key_version(address(ALICE)) == 1, 'Alice version changed');
    assert(registry.get_key_version(address(BOB)) == 1, 'Bob version invalid');
}

#[test]
fn duplicate_registration_is_a_no_op() {
    let contract_address = deploy_registry();
    let registry = IVeilEncryptionKeyRegistryDispatcher { contract_address };
    start_cheat_caller_address(contract_address, address(ALICE));
    registry.register_public_key(12345);
    registry.register_public_key(12345);
    assert(registry.get_public_key(address(ALICE)) == 12345, 'Key changed');
    assert(registry.get_key_version(address(ALICE)) == 1, 'Duplicate incremented');
}
