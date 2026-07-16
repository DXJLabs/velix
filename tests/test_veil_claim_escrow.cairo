use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address,
};
use starknet::ContractAddress;

use veilc::claim_escrow_commitments::compute_claim_commitment;
use veilc::claim_escrow_interfaces::{
    IVeilClaimEscrowDispatcher, IVeilClaimEscrowDispatcherTrait,
};
use veilc::mock_claim_erc20::{
    IMockClaimERC20Dispatcher, IMockClaimERC20DispatcherTrait,
};
use veilc::mock_claim_privacy_pool::{
    IMockClaimPrivacyPoolDispatcher, IMockClaimPrivacyPoolDispatcherTrait,
};
use veilc::veil_claim_escrow::VeilClaimEscrow::{CLAIM_ACTION, DEPOSIT_ACTION};

const SECRET: felt252 = 0x123456789abcdef;
const OTHER_SECRET: felt252 = 0x987654321;
const NOTE_ID: felt252 = 0x445566;
const AMOUNT: u128 = 250;
const OTHER_CALLER: felt252 = 0x999;

fn deploy_empty(name: ByteArray) -> ContractAddress {
    let contract = declare(name).unwrap().contract_class();
    let calldata = ArrayTrait::<felt252>::new();
    let (address, _) = contract.deploy(@calldata).unwrap();
    address
}

fn deploy_claim_escrow(pool: ContractAddress) -> ContractAddress {
    let contract = declare("VeilClaimEscrow").unwrap().contract_class();
    let calldata = array![pool.into()];
    let (address, _) = contract.deploy(@calldata).unwrap();
    address
}

fn setup() -> (ContractAddress, ContractAddress, ContractAddress) {
    let token = deploy_empty("MockClaimERC20");
    let pool = deploy_empty("MockClaimPrivacyPool");
    let escrow = deploy_claim_escrow(pool);
    let erc20 = IMockClaimERC20Dispatcher { contract_address: token };
    erc20.mint(pool, 10_000_u256);
    (token, pool, escrow)
}

fn deposit_calldata(
    commitment: felt252, token: ContractAddress, amount: u128,
) -> Array<felt252> {
    array![DEPOSIT_ACTION, commitment, token.into(), amount.into()]
}

fn claim_calldata(secret: felt252, note_id: felt252) -> Array<felt252> {
    array![CLAIM_ACTION, secret, note_id]
}

fn invoke_as(
    escrow: ContractAddress, caller: ContractAddress, calldata: Span<felt252>,
) {
    start_cheat_caller_address(escrow, caller);
    let dispatcher = IVeilClaimEscrowDispatcher { contract_address: escrow };
    dispatcher.privacy_invoke(calldata);
}

#[test]
fn commitment_matches_locked_client_vector() {
    assert(
        compute_claim_commitment(1)
            == 0x7f80684aeb9a7f70799437e45f16f4c11372468a8620038f19a2defb60ffc7,
        'BAD_SECRET_ONE_VECTOR',
    );
    let expected =
        0x31430ab080ff8f847ce3db908a3f704af4b6d9f48353778aea7f047c99b8554;
    assert(compute_claim_commitment(SECRET) == expected, 'BAD_CLAIM_VECTOR');

    let (_, _, escrow) = setup();
    let dispatcher = IVeilClaimEscrowDispatcher { contract_address: escrow };
    assert(dispatcher.compute_commitment(SECRET) == expected, 'BAD_VIEW_VECTOR');
    assert(
        dispatcher.compute_commitment(OTHER_SECRET) != expected,
        'SECRET_NOT_BOUND',
    );
}

#[test]
fn constructor_pins_privacy_pool() {
    let (_, pool, escrow) = setup();
    let dispatcher = IVeilClaimEscrowDispatcher { contract_address: escrow };
    assert(dispatcher.get_privacy_pool() == pool, 'BAD_POOL');
}

#[test]
fn constructor_rejects_zero_pool() {
    let contract = declare("VeilClaimEscrow").unwrap().contract_class();
    let zero: ContractAddress = 0.try_into().unwrap();
    let calldata = array![zero.into()];
    match contract.deploy(@calldata) {
        Result::Err(_) => {},
        Result::Ok(_) => core::panic_with_felt252('ZERO_POOL_ACCEPTED'),
    }
}

#[test]
fn deposit_parks_exact_funds_and_returns_empty_span() {
    let (token, pool, escrow) = setup();
    let commitment = compute_claim_commitment(SECRET);
    let pool_dispatcher = IMockClaimPrivacyPoolDispatcher { contract_address: pool };
    let token_dispatcher = IMockClaimERC20Dispatcher { contract_address: token };
    let escrow_dispatcher = IVeilClaimEscrowDispatcher { contract_address: escrow };

    pool_dispatcher.deposit_claim(escrow, token, AMOUNT, commitment);

    assert(pool_dispatcher.get_last_deposit_return_count() == 0, 'DEPOSIT_NOT_EMPTY');
    assert(token_dispatcher.balance_of(escrow) == AMOUNT.into(), 'FUNDS_NOT_PARKED');
    assert(escrow_dispatcher.claim_exists(commitment), 'CLAIM_NOT_STORED');
    assert(!escrow_dispatcher.is_claimed(commitment), 'CLAIM_PRECONSUMED');
    assert(escrow_dispatcher.get_reserved_amount(token) == AMOUNT, 'BAD_RESERVE');
    let entry = escrow_dispatcher.get_claim(commitment);
    assert(entry.commitment == commitment, 'BAD_COMMITMENT');
    assert(entry.token == token, 'BAD_TOKEN');
    assert(entry.amount == AMOUNT, 'BAD_AMOUNT');
    assert(entry.claimed_at == 0, 'BAD_CLAIM_TIME');
}

#[test]
#[should_panic(expected: 'DUPLICATE_COMMITMENT')]
fn duplicate_commitment_is_rejected() {
    let (token, pool, escrow) = setup();
    let commitment = compute_claim_commitment(SECRET);
    let dispatcher = IMockClaimPrivacyPoolDispatcher { contract_address: pool };
    dispatcher.deposit_claim(escrow, token, AMOUNT, commitment);
    dispatcher.deposit_claim(escrow, token, AMOUNT, commitment);
}

#[test]
#[should_panic(expected: 'ZERO_COMMITMENT')]
fn zero_commitment_is_rejected() {
    let (token, pool, escrow) = setup();
    let calldata = deposit_calldata(0, token, AMOUNT);
    invoke_as(escrow, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_ADDRESS')]
fn zero_token_is_rejected() {
    let (_, pool, escrow) = setup();
    let zero: ContractAddress = 0.try_into().unwrap();
    let calldata = deposit_calldata(compute_claim_commitment(SECRET), zero, AMOUNT);
    invoke_as(escrow, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_AMOUNT')]
fn zero_amount_is_rejected() {
    let (token, pool, escrow) = setup();
    let calldata = deposit_calldata(compute_claim_commitment(SECRET), token, 0);
    invoke_as(escrow, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'NOT_PRIVACY_POOL')]
fn unauthorized_caller_is_rejected() {
    let (token, _, escrow) = setup();
    let other: ContractAddress = OTHER_CALLER.try_into().unwrap();
    let calldata = deposit_calldata(compute_claim_commitment(SECRET), token, AMOUNT);
    invoke_as(escrow, other, calldata.span());
}

#[test]
#[should_panic(expected: 'FUNDS_NOT_RECEIVED')]
fn deposit_cannot_allocate_existing_or_missing_funds() {
    let (token, pool, escrow) = setup();
    let calldata = deposit_calldata(compute_claim_commitment(SECRET), token, AMOUNT);
    invoke_as(escrow, pool, calldata.span());
}

#[test]
fn claim_returns_one_exact_deposit_and_pool_pulls_exact_allowance() {
    let (token, pool, escrow) = setup();
    let commitment = compute_claim_commitment(SECRET);
    let pool_dispatcher = IMockClaimPrivacyPoolDispatcher { contract_address: pool };
    let token_dispatcher = IMockClaimERC20Dispatcher { contract_address: token };
    let escrow_dispatcher = IVeilClaimEscrowDispatcher { contract_address: escrow };
    let pool_balance_before = token_dispatcher.balance_of(pool);

    pool_dispatcher.deposit_claim(escrow, token, AMOUNT, commitment);
    start_cheat_block_timestamp(escrow, 1_234);
    pool_dispatcher.claim(escrow, SECRET, NOTE_ID);

    assert(pool_dispatcher.get_last_claim_return_count() == 1, 'BAD_RETURN_COUNT');
    assert(pool_dispatcher.get_last_note_id() == NOTE_ID, 'BAD_NOTE_ID');
    assert(pool_dispatcher.get_last_token() == token, 'BAD_OUTPUT_TOKEN');
    assert(pool_dispatcher.get_last_amount() == AMOUNT, 'BAD_OUTPUT_AMOUNT');
    assert(pool_dispatcher.get_observed_allowance() == AMOUNT.into(), 'NOT_EXACT_APPROVAL');
    assert(token_dispatcher.allowance(escrow, pool) == 0, 'STALE_ALLOWANCE');
    assert(token_dispatcher.balance_of(escrow) == 0, 'ESCROW_NOT_DRAINED');
    assert(token_dispatcher.balance_of(pool) == pool_balance_before, 'POOL_NOT_REPAID');
    assert(escrow_dispatcher.is_claimed(commitment), 'CLAIM_NOT_CONSUMED');
    assert(escrow_dispatcher.get_reserved_amount(token) == 0, 'RESERVE_NOT_RELEASED');
    assert(escrow_dispatcher.get_claim(commitment).claimed_at == 1_234, 'BAD_CLAIM_TIME');
}

#[test]
#[should_panic(expected: 'CLAIM_NOT_FOUND')]
fn wrong_secret_is_rejected() {
    let (token, pool, escrow) = setup();
    let dispatcher = IMockClaimPrivacyPoolDispatcher { contract_address: pool };
    dispatcher.deposit_claim(escrow, token, AMOUNT, compute_claim_commitment(SECRET));
    dispatcher.claim(escrow, OTHER_SECRET, NOTE_ID);
}

#[test]
#[should_panic(expected: 'CLAIM_NOT_FOUND')]
fn missing_commitment_is_rejected() {
    let (_, pool, escrow) = setup();
    let dispatcher = IMockClaimPrivacyPoolDispatcher { contract_address: pool };
    dispatcher.claim(escrow, SECRET, NOTE_ID);
}

#[test]
#[should_panic(expected: 'CLAIM_ALREADY_CLAIMED')]
fn double_claim_is_rejected() {
    let (token, pool, escrow) = setup();
    let dispatcher = IMockClaimPrivacyPoolDispatcher { contract_address: pool };
    dispatcher.deposit_claim(escrow, token, AMOUNT, compute_claim_commitment(SECRET));
    dispatcher.claim(escrow, SECRET, NOTE_ID);
    dispatcher.claim(escrow, SECRET, NOTE_ID + 1);
}

#[test]
#[should_panic(expected: 'ZERO_SECRET')]
fn zero_secret_is_rejected() {
    let (_, pool, escrow) = setup();
    let calldata = claim_calldata(0, NOTE_ID);
    invoke_as(escrow, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_NOTE_ID')]
fn zero_note_id_is_rejected() {
    let (_, pool, escrow) = setup();
    let calldata = claim_calldata(SECRET, 0);
    invoke_as(escrow, pool, calldata.span());
}

#[test]
fn claiming_one_entry_preserves_other_reserved_funds() {
    let (token, pool, escrow) = setup();
    let second_amount: u128 = 375;
    let dispatcher = IMockClaimPrivacyPoolDispatcher { contract_address: pool };
    let token_dispatcher = IMockClaimERC20Dispatcher { contract_address: token };
    let escrow_dispatcher = IVeilClaimEscrowDispatcher { contract_address: escrow };

    dispatcher.deposit_claim(escrow, token, AMOUNT, compute_claim_commitment(SECRET));
    dispatcher
        .deposit_claim(
            escrow, token, second_amount, compute_claim_commitment(OTHER_SECRET),
        );
    dispatcher.claim(escrow, SECRET, NOTE_ID);

    assert(
        escrow_dispatcher.get_reserved_amount(token) == second_amount,
        'OTHER_RESERVE_CHANGED',
    );
    assert(
        token_dispatcher.balance_of(escrow) == second_amount.into(),
        'OTHER_FUNDS_CHANGED',
    );
    assert(
        !escrow_dispatcher.is_claimed(compute_claim_commitment(OTHER_SECRET)),
        'OTHER_CLAIM_CHANGED',
    );
}
