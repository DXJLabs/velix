use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
};
use starknet::ContractAddress;
use veilc::escrow_interfaces::{
    IVeilEscrowDispatcher, IVeilEscrowDispatcherTrait, IVeilEscrowSafeDispatcher,
    IVeilEscrowSafeDispatcherTrait,
};
use veilc::escrow_types::{Escrow, EscrowStatus};

const CHANNEL_ID: felt252 = 1001;
const ASSET_TYPE: felt252 = 'LICENSE';
const ASSET_REFERENCE: felt252 = 7007;
const PAYMENT_REFERENCE: felt252 = 450;

fn buyer() -> ContractAddress {
    0xB0B.try_into().unwrap()
}

fn seller() -> ContractAddress {
    0x5E11E2.try_into().unwrap()
}

fn outsider() -> ContractAddress {
    0xBAD.try_into().unwrap()
}

fn zero_address() -> ContractAddress {
    0.try_into().unwrap()
}

fn deploy_contract() -> ContractAddress {
    let contract = declare("VeilEscrow").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@ArrayTrait::new()).unwrap();
    contract_address
}

fn set_caller(contract_address: ContractAddress, caller: ContractAddress) {
    start_cheat_caller_address(contract_address, caller);
}

fn create_default_escrow(
    contract_address: ContractAddress, dispatcher: IVeilEscrowDispatcher,
) -> felt252 {
    set_caller(contract_address, buyer());
    dispatcher
        .create_escrow(
            CHANNEL_ID, seller(), ASSET_TYPE, ASSET_REFERENCE, PAYMENT_REFERENCE,
        )
}

fn create_deposited_escrow(
    contract_address: ContractAddress, dispatcher: IVeilEscrowDispatcher,
) -> felt252 {
    let escrow_id = create_default_escrow(contract_address, dispatcher);
    set_caller(contract_address, buyer());
    dispatcher.confirm_buyer_deposit(escrow_id);
    set_caller(contract_address, seller());
    dispatcher.confirm_seller_deposit(escrow_id);
    escrow_id
}

fn create_active_escrow(
    contract_address: ContractAddress, dispatcher: IVeilEscrowDispatcher,
) -> felt252 {
    let escrow_id = create_deposited_escrow(contract_address, dispatcher);
    set_caller(contract_address, buyer());
    dispatcher.activate(escrow_id);
    escrow_id
}

fn assert_status_created(status: EscrowStatus) {
    match status {
        EscrowStatus::Created => (),
        _ => core::panic_with_felt252('Wrong status'),
    }
}

fn assert_status_active(status: EscrowStatus) {
    match status {
        EscrowStatus::Active => (),
        _ => core::panic_with_felt252('Wrong status'),
    }
}

fn assert_status_completed(status: EscrowStatus) {
    match status {
        EscrowStatus::Completed => (),
        _ => core::panic_with_felt252('Wrong status'),
    }
}

fn assert_status_cancelled(status: EscrowStatus) {
    match status {
        EscrowStatus::Cancelled => (),
        _ => core::panic_with_felt252('Wrong status'),
    }
}

fn assert_escrow_base(escrow: Escrow, escrow_id: felt252) {
    assert(escrow.escrow_id == escrow_id, 'Invalid escrow id');
    assert(escrow.channel_id == CHANNEL_ID, 'Invalid channel');
    assert(escrow.buyer == buyer(), 'Invalid buyer');
    assert(escrow.seller == seller(), 'Invalid seller');
    assert(escrow.asset_type == ASSET_TYPE, 'Invalid asset type');
    assert(escrow.asset_reference == ASSET_REFERENCE, 'Invalid asset ref');
    assert(escrow.payment_reference == PAYMENT_REFERENCE, 'Invalid payment ref');
}

#[test]
fn create_escrow() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilEscrowDispatcher { contract_address };

    let escrow_id = create_default_escrow(contract_address, dispatcher);
    let escrow = dispatcher.get_escrow(escrow_id);

    assert(escrow_id == 1, 'Invalid first id');
    assert_escrow_base(escrow, escrow_id);
    assert(!escrow.buyer_deposited, 'Buyer deposited');
    assert(!escrow.seller_deposited, 'Seller deposited');
    assert_status_created(escrow.status);
    assert(dispatcher.get_escrow_count() == 1, 'Invalid count');
}

#[test]
fn buyer_deposit() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilEscrowDispatcher { contract_address };
    let escrow_id = create_default_escrow(contract_address, dispatcher);

    set_caller(contract_address, buyer());
    dispatcher.confirm_buyer_deposit(escrow_id);

    let escrow = dispatcher.get_escrow(escrow_id);
    assert(escrow.buyer_deposited, 'Buyer not deposited');
    assert(!escrow.seller_deposited, 'Seller deposited');
}

#[test]
fn seller_deposit() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilEscrowDispatcher { contract_address };
    let escrow_id = create_default_escrow(contract_address, dispatcher);

    set_caller(contract_address, seller());
    dispatcher.confirm_seller_deposit(escrow_id);

    let escrow = dispatcher.get_escrow(escrow_id);
    assert(!escrow.buyer_deposited, 'Buyer deposited');
    assert(escrow.seller_deposited, 'Seller not deposited');
}

#[test]
fn activate_escrow() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilEscrowDispatcher { contract_address };

    let escrow_id = create_deposited_escrow(contract_address, dispatcher);
    set_caller(contract_address, buyer());
    dispatcher.activate(escrow_id);

    assert_status_active(dispatcher.get_status(escrow_id));
}

#[test]
fn settle_escrow() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilEscrowDispatcher { contract_address };

    let escrow_id = create_active_escrow(contract_address, dispatcher);
    set_caller(contract_address, seller());
    dispatcher.settle(escrow_id);

    assert_status_completed(dispatcher.get_status(escrow_id));
}

#[test]
fn cancel_escrow() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilEscrowDispatcher { contract_address };

    let escrow_id = create_default_escrow(contract_address, dispatcher);
    set_caller(contract_address, buyer());
    dispatcher.cancel(escrow_id);

    assert_status_cancelled(dispatcher.get_status(escrow_id));
}

#[test]
#[feature("safe_dispatcher")]
fn reject_double_buyer_deposit() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilEscrowDispatcher { contract_address };
    let safe_dispatcher = IVeilEscrowSafeDispatcher { contract_address };
    let escrow_id = create_default_escrow(contract_address, dispatcher);

    set_caller(contract_address, buyer());
    dispatcher.confirm_buyer_deposit(escrow_id);

    match safe_dispatcher.confirm_buyer_deposit(escrow_id) {
        Result::Ok(_) => core::panic_with_felt252('Should fail'),
        Result::Err(panic_data) => {
            assert(*panic_data.at(0) == 'Buyer deposit exists', *panic_data.at(0));
        },
    };
}

#[test]
#[feature("safe_dispatcher")]
fn reject_double_seller_deposit() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilEscrowDispatcher { contract_address };
    let safe_dispatcher = IVeilEscrowSafeDispatcher { contract_address };
    let escrow_id = create_default_escrow(contract_address, dispatcher);

    set_caller(contract_address, seller());
    dispatcher.confirm_seller_deposit(escrow_id);

    match safe_dispatcher.confirm_seller_deposit(escrow_id) {
        Result::Ok(_) => core::panic_with_felt252('Should fail'),
        Result::Err(panic_data) => {
            assert(*panic_data.at(0) == 'Seller deposit exists', *panic_data.at(0));
        },
    };
}

#[test]
#[feature("safe_dispatcher")]
fn reject_settlement_before_activation() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilEscrowDispatcher { contract_address };
    let safe_dispatcher = IVeilEscrowSafeDispatcher { contract_address };
    let escrow_id = create_deposited_escrow(contract_address, dispatcher);

    set_caller(contract_address, seller());
    match safe_dispatcher.settle(escrow_id) {
        Result::Ok(_) => core::panic_with_felt252('Should fail'),
        Result::Err(panic_data) => {
            assert(*panic_data.at(0) == 'Not active', *panic_data.at(0));
        },
    };
}

#[test]
#[feature("safe_dispatcher")]
fn reject_cancellation_after_activation() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilEscrowDispatcher { contract_address };
    let safe_dispatcher = IVeilEscrowSafeDispatcher { contract_address };
    let escrow_id = create_active_escrow(contract_address, dispatcher);

    set_caller(contract_address, buyer());
    match safe_dispatcher.cancel(escrow_id) {
        Result::Ok(_) => core::panic_with_felt252('Should fail'),
        Result::Err(panic_data) => {
            assert(*panic_data.at(0) == 'Cannot cancel', *panic_data.at(0));
        },
    };
}

#[test]
#[feature("safe_dispatcher")]
fn reject_unauthorized_caller() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilEscrowDispatcher { contract_address };
    let safe_dispatcher = IVeilEscrowSafeDispatcher { contract_address };
    let escrow_id = create_default_escrow(contract_address, dispatcher);

    set_caller(contract_address, outsider());
    match safe_dispatcher.confirm_buyer_deposit(escrow_id) {
        Result::Ok(_) => core::panic_with_felt252('Should fail'),
        Result::Err(panic_data) => {
            assert(*panic_data.at(0) == 'Only buyer', *panic_data.at(0));
        },
    };
}

#[test]
#[feature("safe_dispatcher")]
fn reject_invalid_state_transition() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilEscrowDispatcher { contract_address };
    let safe_dispatcher = IVeilEscrowSafeDispatcher { contract_address };
    let escrow_id = create_default_escrow(contract_address, dispatcher);

    set_caller(contract_address, buyer());
    match safe_dispatcher.activate(escrow_id) {
        Result::Ok(_) => core::panic_with_felt252('Should fail'),
        Result::Err(panic_data) => {
            assert(*panic_data.at(0) == 'Buyer not deposited', *panic_data.at(0));
        },
    };
}

#[test]
#[feature("safe_dispatcher")]
fn reject_zero_address() {
    let contract_address = deploy_contract();
    let safe_dispatcher = IVeilEscrowSafeDispatcher { contract_address };

    set_caller(contract_address, buyer());
    match safe_dispatcher.create_escrow(
        CHANNEL_ID, zero_address(), ASSET_TYPE, ASSET_REFERENCE, PAYMENT_REFERENCE,
    ) {
        Result::Ok(_) => core::panic_with_felt252('Should fail'),
        Result::Err(panic_data) => {
            assert(*panic_data.at(0) == 'Zero address', *panic_data.at(0));
        },
    };
}

#[test]
#[feature("safe_dispatcher")]
fn reject_invalid_escrow_id() {
    let contract_address = deploy_contract();
    let safe_dispatcher = IVeilEscrowSafeDispatcher { contract_address };

    match safe_dispatcher.get_escrow(999) {
        Result::Ok(_) => core::panic_with_felt252('Should fail'),
        Result::Err(panic_data) => {
            assert(*panic_data.at(0) == 'Invalid escrow', *panic_data.at(0));
        },
    };
}
