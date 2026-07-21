use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare,
};
use starknet::ContractAddress;
use veilc::interfaces::escrow_interfaces::{
    IVeilEscrowDispatcher, IVeilEscrowDispatcherTrait,
};

const OFFER_CONTRACT: felt252 = 0x111;

fn offer_contract() -> ContractAddress {
    OFFER_CONTRACT.try_into().unwrap()
}

fn deploy_contract() -> ContractAddress {
    let contract = declare("VeilEscrow").unwrap().contract_class();
    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(OFFER_CONTRACT);
    let (contract_address, _) = contract.deploy(@calldata).unwrap();
    contract_address
}

#[test]
fn constructor_accepts_offer_contract() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilEscrowDispatcher { contract_address };

    assert(dispatcher.get_escrow_count() == 0, 'Invalid count');
    assert(offer_contract() != contract_address, 'Bad test setup');
}
