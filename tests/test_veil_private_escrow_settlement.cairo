use snforge_std::{
    ContractClassTrait,
    DeclareResultTrait,
    declare,
    start_cheat_block_timestamp,
    start_cheat_caller_address,
};
use starknet::ContractAddress;

use veilc::mock_claim_erc20::{
    IMockClaimERC20Dispatcher,
    IMockClaimERC20DispatcherTrait,
};
use veilc::mock_private_escrow_settlement_privacy_pool::{
    IMockPrivateEscrowSettlementPrivacyPoolDispatcher,
    IMockPrivateEscrowSettlementPrivacyPoolDispatcherTrait,
};
use veilc::private_escrow_settlement_commitments::{
    compute_private_escrow_refund_commitment,
    compute_private_escrow_release_commitment,
};
use veilc::private_escrow_settlement_interfaces::{
    IVeilPrivateEscrowSettlementDispatcher,
    IVeilPrivateEscrowSettlementDispatcherTrait,
};
use veilc::veil_private_escrow_settlement::
    VeilPrivateEscrowSettlement::{
        DEPOSIT_ACTION,
        REFUND_ACTION,
        RELEASE_ACTION,
    };

const CUSTODY_COMMITMENT: felt252 = 0xCAFE01;
const SECOND_CUSTODY_COMMITMENT: felt252 = 0xCAFE02;
const RELEASE_SECRET: felt252 = 0x11112222;
const REFUND_SECRET: felt252 = 0x33334444;
const WRONG_SECRET: felt252 = 0x99998888;
const OUTPUT_NOTE_ID: felt252 = 0xABCDEF;
const AMOUNT: u128 = 250;
const REFUND_AFTER: u64 = 2_000;
const OTHER_CALLER: felt252 = 0x999;

fn deploy_empty(name: ByteArray) -> ContractAddress {
    let contract = declare(name).unwrap().contract_class();
    let calldata = ArrayTrait::<felt252>::new();
    let (address, _) = contract.deploy(@calldata).unwrap();
    address
}

fn deploy_settlement(
    pool: ContractAddress,
) -> ContractAddress {
    let contract = declare(
        "VeilPrivateEscrowSettlement",
    )
        .unwrap()
        .contract_class();

    let calldata = array![pool.into()];
    let (address, _) = contract.deploy(@calldata).unwrap();
    address
}

fn setup() -> (
    ContractAddress,
    ContractAddress,
    ContractAddress,
) {
    let token = deploy_empty("MockClaimERC20");
    let pool = deploy_empty(
        "MockPrivateEscrowSettlementPrivacyPool",
    );
    let settlement = deploy_settlement(pool);

    let erc20 = IMockClaimERC20Dispatcher {
        contract_address: token,
    };
    erc20.mint(pool, 10_000_u256);

    (token, pool, settlement)
}

fn settlement_dispatcher(
    settlement: ContractAddress,
) -> IVeilPrivateEscrowSettlementDispatcher {
    IVeilPrivateEscrowSettlementDispatcher {
        contract_address: settlement,
    }
}

fn pool_dispatcher(
    pool: ContractAddress,
) -> IMockPrivateEscrowSettlementPrivacyPoolDispatcher {
    IMockPrivateEscrowSettlementPrivacyPoolDispatcher {
        contract_address: pool,
    }
}

fn release_commitment(
    custody_commitment: felt252,
) -> felt252 {
    compute_private_escrow_release_commitment(
        custody_commitment,
        RELEASE_SECRET,
    )
}

fn refund_commitment(
    custody_commitment: felt252,
) -> felt252 {
    compute_private_escrow_refund_commitment(
        custody_commitment,
        REFUND_SECRET,
    )
}

fn deposit_calldata(
    custody_commitment: felt252,
    release_path_commitment: felt252,
    refund_path_commitment: felt252,
    refund_after: u64,
    token: ContractAddress,
    amount: u128,
) -> Array<felt252> {
    array![
        DEPOSIT_ACTION,
        custody_commitment,
        release_path_commitment,
        refund_path_commitment,
        refund_after.into(),
        token.into(),
        amount.into(),
    ]
}

fn release_calldata(
    custody_commitment: felt252,
    secret: felt252,
    output_note_id: felt252,
) -> Array<felt252> {
    array![
        RELEASE_ACTION,
        custody_commitment,
        secret,
        output_note_id,
    ]
}

fn refund_calldata(
    custody_commitment: felt252,
    secret: felt252,
    output_note_id: felt252,
) -> Array<felt252> {
    array![
        REFUND_ACTION,
        custody_commitment,
        secret,
        output_note_id,
    ]
}

fn invoke_as(
    settlement: ContractAddress,
    caller: ContractAddress,
    calldata: Span<felt252>,
) {
    start_cheat_caller_address(settlement, caller);
    settlement_dispatcher(settlement)
        .privacy_invoke(calldata);
}

fn deposit_default(
    token: ContractAddress,
    pool: ContractAddress,
    settlement: ContractAddress,
    custody_commitment: felt252,
    amount: u128,
    refund_after: u64,
) {
    pool_dispatcher(pool).deposit_custody(
        settlement,
        token,
        amount,
        custody_commitment,
        release_commitment(custody_commitment),
        refund_commitment(custody_commitment),
        refund_after,
    );
}

#[test]
fn constructor_pins_privacy_pool() {
    let (_, pool, settlement) = setup();

    assert(
        settlement_dispatcher(settlement).get_privacy_pool()
            == pool,
        'BAD_POOL',
    );
}

#[test]
fn constructor_rejects_zero_pool() {
    let contract = declare(
        "VeilPrivateEscrowSettlement",
    )
        .unwrap()
        .contract_class();

    let zero: ContractAddress = 0.try_into().unwrap();
    let calldata = array![zero.into()];

    match contract.deploy(@calldata) {
        Result::Err(_) => {},
        Result::Ok(_) => {
            core::panic_with_felt252(
                'ZERO_POOL_ACCEPTED',
            )
        },
    }
}

#[test]
fn commitment_views_match_free_functions() {
    let (_, _, settlement) = setup();
    let dispatcher = settlement_dispatcher(settlement);

    assert(
        dispatcher.compute_release_commitment(
            CUSTODY_COMMITMENT,
            RELEASE_SECRET,
        ) == release_commitment(CUSTODY_COMMITMENT),
        'BAD_RELEASE_COMMIT',
    );

    assert(
        dispatcher.compute_refund_commitment(
            CUSTODY_COMMITMENT,
            REFUND_SECRET,
        ) == refund_commitment(CUSTODY_COMMITMENT),
        'BAD_REFUND_COMMIT',
    );
}

#[test]
fn deposit_parks_exact_funds_and_record() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    let pool_api = pool_dispatcher(pool);
    let escrow_api = settlement_dispatcher(settlement);
    let erc20 = IMockClaimERC20Dispatcher {
        contract_address: token,
    };

    assert(
        pool_api.get_last_deposit_return_count() == 0,
        'DEPOSIT_NOT_EMPTY',
    );
    assert(
        erc20.balance_of(settlement) == AMOUNT.into(),
        'FUNDS_NOT_PARKED',
    );
    assert(
        escrow_api.custody_exists(CUSTODY_COMMITMENT),
        'CUSTODY_NOT_STORED',
    );
    assert(
        !escrow_api.is_consumed(CUSTODY_COMMITMENT),
        'CUSTODY_PRECONSUMED',
    );
    assert(
        escrow_api.get_reserved_amount(token) == AMOUNT,
        'BAD_RESERVE',
    );

    let custody =
        escrow_api.get_custody(CUSTODY_COMMITMENT);

    assert(
        custody.release_commitment
            == release_commitment(CUSTODY_COMMITMENT),
        'BAD_RELEASE_PATH',
    );
    assert(
        custody.refund_commitment
            == refund_commitment(CUSTODY_COMMITMENT),
        'BAD_REFUND_PATH',
    );
    assert(custody.token == token, 'BAD_TOKEN');
    assert(custody.amount == AMOUNT, 'BAD_AMOUNT');
    assert(
        custody.refund_after == REFUND_AFTER,
        'BAD_REFUND_AFTER',
    );
    assert(custody.created_at == 1_000, 'BAD_CREATED_AT');
    assert(custody.settled_at == 0, 'BAD_SETTLED_AT');
}

#[test]
#[should_panic(expected: 'NOT_PRIVACY_POOL')]
fn unauthorized_caller_is_rejected() {
    let (token, _, settlement) = setup();
    let caller: ContractAddress =
        OTHER_CALLER.try_into().unwrap();

    let calldata = deposit_calldata(
        CUSTODY_COMMITMENT,
        release_commitment(CUSTODY_COMMITMENT),
        refund_commitment(CUSTODY_COMMITMENT),
        REFUND_AFTER,
        token,
        AMOUNT,
    );

    invoke_as(settlement, caller, calldata.span());
}

#[test]
#[should_panic(expected: 'CUSTODY_ALREADY_EXISTS')]
fn duplicate_custody_is_rejected() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );
}

#[test]
#[should_panic(expected: 'FUNDS_NOT_RECEIVED')]
fn deposit_cannot_allocate_missing_funds() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    let calldata = deposit_calldata(
        CUSTODY_COMMITMENT,
        release_commitment(CUSTODY_COMMITMENT),
        refund_commitment(CUSTODY_COMMITMENT),
        REFUND_AFTER,
        token,
        AMOUNT,
    );

    invoke_as(settlement, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'BAD_REFUND_AFTER')]
fn refund_boundary_must_be_future() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    let calldata = deposit_calldata(
        CUSTODY_COMMITMENT,
        release_commitment(CUSTODY_COMMITMENT),
        refund_commitment(CUSTODY_COMMITMENT),
        1_000,
        token,
        AMOUNT,
    );

    invoke_as(settlement, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'SAME_PATH_COMMITMENTS')]
fn release_and_refund_commitments_must_differ() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    let same_commitment: felt252 = 0x123456;

    let calldata = deposit_calldata(
        CUSTODY_COMMITMENT,
        same_commitment,
        same_commitment,
        REFUND_AFTER,
        token,
        AMOUNT,
    );

    invoke_as(settlement, pool, calldata.span());
}

#[test]
fn release_returns_exact_private_output() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    let erc20 = IMockClaimERC20Dispatcher {
        contract_address: token,
    };
    let pool_balance_before = erc20.balance_of(pool);

    start_cheat_block_timestamp(settlement, 1_500);

    pool_dispatcher(pool).release_custody(
        settlement,
        CUSTODY_COMMITMENT,
        RELEASE_SECRET,
        OUTPUT_NOTE_ID,
    );

    let pool_api = pool_dispatcher(pool);
    let escrow_api = settlement_dispatcher(settlement);
    let custody =
        escrow_api.get_custody(CUSTODY_COMMITMENT);

    assert(
        pool_api.get_last_settlement_return_count() == 1,
        'BAD_RETURN_COUNT',
    );
    assert(
        pool_api.get_last_note_id() == OUTPUT_NOTE_ID,
        'BAD_NOTE_ID',
    );
    assert(
        pool_api.get_last_token() == token,
        'BAD_OUTPUT_TOKEN',
    );
    assert(
        pool_api.get_last_amount() == AMOUNT,
        'BAD_OUTPUT_AMOUNT',
    );
    assert(
        pool_api.get_observed_allowance()
            == AMOUNT.into(),
        'NOT_EXACT_APPROVAL',
    );
    assert(
        erc20.allowance(settlement, pool) == 0,
        'STALE_ALLOWANCE',
    );
    assert(
        erc20.balance_of(settlement) == 0,
        'CUSTODY_NOT_DRAINED',
    );
    assert(
        erc20.balance_of(pool)
            == pool_balance_before + AMOUNT.into(),
        'POOL_NOT_REPAID',
    );
    assert(custody.consumed, 'NOT_CONSUMED');
    assert(!custody.refunded, 'WRONG_PATH');
    assert(custody.settled_at == 1_500, 'BAD_TIME');
    assert(
        escrow_api.get_reserved_amount(token) == 0,
        'RESERVE_NOT_RELEASED',
    );
}

#[test]
#[should_panic(expected: 'BAD_RELEASE_SECRET')]
fn wrong_release_secret_is_rejected() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    start_cheat_block_timestamp(settlement, 1_500);

    pool_dispatcher(pool).release_custody(
        settlement,
        CUSTODY_COMMITMENT,
        WRONG_SECRET,
        OUTPUT_NOTE_ID,
    );
}

#[test]
#[should_panic(expected: 'RELEASE_WINDOW_CLOSED')]
fn release_at_refund_boundary_is_rejected() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    start_cheat_block_timestamp(
        settlement,
        REFUND_AFTER,
    );

    pool_dispatcher(pool).release_custody(
        settlement,
        CUSTODY_COMMITMENT,
        RELEASE_SECRET,
        OUTPUT_NOTE_ID,
    );
}

#[test]
#[should_panic(expected: 'REFUND_TOO_EARLY')]
fn refund_before_boundary_is_rejected() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    start_cheat_block_timestamp(settlement, 1_999);

    pool_dispatcher(pool).refund_custody(
        settlement,
        CUSTODY_COMMITMENT,
        REFUND_SECRET,
        OUTPUT_NOTE_ID,
    );
}

#[test]
fn refund_at_boundary_returns_exact_private_output() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    start_cheat_block_timestamp(
        settlement,
        REFUND_AFTER,
    );

    pool_dispatcher(pool).refund_custody(
        settlement,
        CUSTODY_COMMITMENT,
        REFUND_SECRET,
        OUTPUT_NOTE_ID,
    );

    let pool_api = pool_dispatcher(pool);
    let escrow_api = settlement_dispatcher(settlement);
    let custody =
        escrow_api.get_custody(CUSTODY_COMMITMENT);

    assert(
        pool_api.get_last_settlement_return_count() == 1,
        'BAD_RETURN_COUNT',
    );
    assert(
        pool_api.get_last_note_id() == OUTPUT_NOTE_ID,
        'BAD_NOTE_ID',
    );
    assert(
        pool_api.get_last_token() == token,
        'BAD_OUTPUT_TOKEN',
    );
    assert(
        pool_api.get_last_amount() == AMOUNT,
        'BAD_OUTPUT_AMOUNT',
    );
    assert(custody.consumed, 'NOT_CONSUMED');
    assert(custody.refunded, 'NOT_REFUNDED');
    assert(
        custody.settled_at == REFUND_AFTER,
        'BAD_TIME',
    );
    assert(
        escrow_api.get_reserved_amount(token) == 0,
        'RESERVE_NOT_RELEASED',
    );
}

#[test]
#[should_panic(expected: 'CUSTODY_ALREADY_CONSUMED')]
fn released_custody_cannot_be_refunded() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    start_cheat_block_timestamp(settlement, 1_500);

    pool_dispatcher(pool).release_custody(
        settlement,
        CUSTODY_COMMITMENT,
        RELEASE_SECRET,
        OUTPUT_NOTE_ID,
    );

    start_cheat_block_timestamp(
        settlement,
        REFUND_AFTER,
    );

    pool_dispatcher(pool).refund_custody(
        settlement,
        CUSTODY_COMMITMENT,
        REFUND_SECRET,
        OUTPUT_NOTE_ID + 1,
    );
}

#[test]
fn consuming_one_custody_preserves_other_reserve() {
    let (token, pool, settlement) = setup();
    let second_amount: u128 = 375;

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    deposit_default(
        token,
        pool,
        settlement,
        SECOND_CUSTODY_COMMITMENT,
        second_amount,
        REFUND_AFTER,
    );

    start_cheat_block_timestamp(settlement, 1_500);

    pool_dispatcher(pool).release_custody(
        settlement,
        CUSTODY_COMMITMENT,
        RELEASE_SECRET,
        OUTPUT_NOTE_ID,
    );

    let escrow_api = settlement_dispatcher(settlement);
    let erc20 = IMockClaimERC20Dispatcher {
        contract_address: token,
    };

    assert(
        escrow_api.get_reserved_amount(token)
            == second_amount,
        'OTHER_RESERVE_CHANGED',
    );
    assert(
        erc20.balance_of(settlement)
            == second_amount.into(),
        'OTHER_FUNDS_CHANGED',
    );
    assert(
        !escrow_api.is_consumed(
            SECOND_CUSTODY_COMMITMENT,
        ),
        'OTHER_CUSTODY_CHANGED',
    );
}


#[test]
#[should_panic(expected: 'BAD_PRIV_ESCROW_ACTION')]
fn invalid_action_is_rejected() {
    let (_, pool, settlement) = setup();
    let calldata = array![0x99];

    invoke_as(settlement, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'BAD_PRIV_ESCROW_DATA')]
fn truncated_deposit_calldata_is_rejected() {
    let (_, pool, settlement) = setup();
    let calldata = array![DEPOSIT_ACTION];

    invoke_as(settlement, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_CUSTODY_COMMIT')]
fn zero_custody_commitment_is_rejected() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    let calldata = deposit_calldata(
        0,
        release_commitment(0),
        refund_commitment(0),
        REFUND_AFTER,
        token,
        AMOUNT,
    );

    invoke_as(settlement, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_RELEASE_COMMIT')]
fn zero_release_commitment_is_rejected() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    let calldata = deposit_calldata(
        CUSTODY_COMMITMENT,
        0,
        refund_commitment(CUSTODY_COMMITMENT),
        REFUND_AFTER,
        token,
        AMOUNT,
    );

    invoke_as(settlement, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_REFUND_COMMIT')]
fn zero_refund_commitment_is_rejected() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    let calldata = deposit_calldata(
        CUSTODY_COMMITMENT,
        release_commitment(CUSTODY_COMMITMENT),
        0,
        REFUND_AFTER,
        token,
        AMOUNT,
    );

    invoke_as(settlement, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_ESCROW_SECRET')]
fn zero_release_secret_is_rejected() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    start_cheat_block_timestamp(settlement, 1_500);

    let calldata = release_calldata(
        CUSTODY_COMMITMENT,
        0,
        OUTPUT_NOTE_ID,
    );

    invoke_as(settlement, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_ESCROW_SECRET')]
fn zero_refund_secret_is_rejected() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    start_cheat_block_timestamp(
        settlement,
        REFUND_AFTER,
    );

    let calldata = refund_calldata(
        CUSTODY_COMMITMENT,
        0,
        OUTPUT_NOTE_ID,
    );

    invoke_as(settlement, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_NOTE_ID')]
fn zero_output_note_id_is_rejected() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    start_cheat_block_timestamp(settlement, 1_500);

    let calldata = release_calldata(
        CUSTODY_COMMITMENT,
        RELEASE_SECRET,
        0,
    );

    invoke_as(settlement, pool, calldata.span());
}

#[test]
#[should_panic(expected: 'BAD_REFUND_SECRET')]
fn wrong_refund_secret_is_rejected() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    start_cheat_block_timestamp(
        settlement,
        REFUND_AFTER,
    );

    pool_dispatcher(pool).refund_custody(
        settlement,
        CUSTODY_COMMITMENT,
        WRONG_SECRET,
        OUTPUT_NOTE_ID,
    );
}

#[test]
#[should_panic(expected: 'CUSTODY_ALREADY_CONSUMED')]
fn double_release_is_rejected() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    start_cheat_block_timestamp(settlement, 1_500);

    let pool_api = pool_dispatcher(pool);

    pool_api.release_custody(
        settlement,
        CUSTODY_COMMITMENT,
        RELEASE_SECRET,
        OUTPUT_NOTE_ID,
    );

    pool_api.release_custody(
        settlement,
        CUSTODY_COMMITMENT,
        RELEASE_SECRET,
        OUTPUT_NOTE_ID + 1,
    );
}

#[test]
#[should_panic(expected: 'CUSTODY_ALREADY_CONSUMED')]
fn double_refund_is_rejected() {
    let (token, pool, settlement) = setup();

    start_cheat_block_timestamp(settlement, 1_000);

    deposit_default(
        token,
        pool,
        settlement,
        CUSTODY_COMMITMENT,
        AMOUNT,
        REFUND_AFTER,
    );

    start_cheat_block_timestamp(
        settlement,
        REFUND_AFTER,
    );

    let pool_api = pool_dispatcher(pool);

    pool_api.refund_custody(
        settlement,
        CUSTODY_COMMITMENT,
        REFUND_SECRET,
        OUTPUT_NOTE_ID,
    );

    pool_api.refund_custody(
        settlement,
        CUSTODY_COMMITMENT,
        REFUND_SECRET,
        OUTPUT_NOTE_ID + 1,
    );
}
