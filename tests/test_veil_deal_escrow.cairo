use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address,
};
use starknet::ContractAddress;

use veilc::deal_escrow_interfaces::{
    IVeilDealEscrowDispatcher, IVeilDealEscrowDispatcherTrait,
};
use veilc::deal_escrow_types::DealStatus;
use veilc::mock_deal_erc20::{IMockDealERC20Dispatcher, IMockDealERC20DispatcherTrait};
use veilc::mock_deal_erc721::{
    IMockDealERC721Dispatcher, IMockDealERC721DispatcherTrait,
};
use veilc::mock_deal_privacy_pool::{
    IMockDealPrivacyPoolDispatcher, IMockDealPrivacyPoolDispatcherTrait,
};
use veilc::veil_deal_escrow::VeilDealEscrow::{
    PRIVATE_FUND_PAYMENT_ACTION, PRIVATE_RELEASE_ACTION,
};

const BUYER: felt252 = 0x111;
const SELLER: felt252 = 0x222;
const OTHER: felt252 = 0x333;
const PAYMENT_AMOUNT: u128 = 500;
const NFT_ID: u256 = 77;
const TERMS_COMMITMENT: felt252 = 0xabc123;
const DEAL_NONCE: felt252 = 0x123456;
const EXPIRY: u64 = 1_000;
const NOTE_ID: felt252 = 0x98765;

fn address(value: felt252) -> ContractAddress {
    value.try_into().unwrap()
}

fn deploy_empty(name: ByteArray) -> ContractAddress {
    let contract = declare(name).unwrap().contract_class();
    let calldata = ArrayTrait::<felt252>::new();
    let (contract_address, _) = contract.deploy(@calldata).unwrap();
    contract_address
}

fn deploy_deal_escrow(pool: ContractAddress) -> ContractAddress {
    let contract = declare("VeilDealEscrow").unwrap().contract_class();
    let calldata = array![pool.into()];
    let (contract_address, _) = contract.deploy(@calldata).unwrap();
    contract_address
}

fn setup() -> (ContractAddress, ContractAddress, ContractAddress, ContractAddress) {
    let token = deploy_empty("MockDealERC20");
    let nft = deploy_empty("MockDealERC721");
    let pool = deploy_empty("MockDealPrivacyPool");
    let escrow = deploy_deal_escrow(pool);

    let erc20 = IMockDealERC20Dispatcher { contract_address: token };
    erc20.mint(address(BUYER), 10_000_u256);
    erc20.mint(pool, 10_000_u256);
    let erc721 = IMockDealERC721Dispatcher { contract_address: nft };
    erc721.mint(address(SELLER), NFT_ID);
    (token, nft, pool, escrow)
}

fn create_with(
    escrow: ContractAddress,
    token: ContractAddress,
    nft: ContractAddress,
    nonce: felt252,
    expiry: u64,
) -> felt252 {
    start_cheat_caller_address(escrow, address(BUYER));
    let dispatcher = IVeilDealEscrowDispatcher { contract_address: escrow };
    dispatcher
        .create_deal(
            address(SELLER),
            token,
            PAYMENT_AMOUNT,
            nft,
            NFT_ID,
            TERMS_COMMITMENT,
            nonce,
            expiry,
        )
}

fn create_default(
    escrow: ContractAddress, token: ContractAddress, nft: ContractAddress,
) -> felt252 {
    create_with(escrow, token, nft, DEAL_NONCE, EXPIRY)
}

fn accept(escrow: ContractAddress, deal_id: felt252) {
    start_cheat_caller_address(escrow, address(SELLER));
    IVeilDealEscrowDispatcher { contract_address: escrow }.accept_deal(deal_id);
}

fn fund_payment_direct(
    token: ContractAddress, escrow: ContractAddress, deal_id: felt252,
) {
    IMockDealERC20Dispatcher { contract_address: token }
        .set_allowance_for(address(BUYER), escrow, PAYMENT_AMOUNT.into());
    start_cheat_caller_address(escrow, address(BUYER));
    IVeilDealEscrowDispatcher { contract_address: escrow }.deposit_payment(deal_id);
}

fn fund_asset(nft: ContractAddress, escrow: ContractAddress, deal_id: felt252) {
    IMockDealERC721Dispatcher { contract_address: nft }
        .approve_for(address(SELLER), escrow, NFT_ID);
    start_cheat_caller_address(escrow, address(SELLER));
    IVeilDealEscrowDispatcher { contract_address: escrow }.deposit_asset(deal_id);
}

fn activate_as_buyer(escrow: ContractAddress, deal_id: felt252) {
    start_cheat_caller_address(escrow, address(BUYER));
    IVeilDealEscrowDispatcher { contract_address: escrow }.activate(deal_id);
}

fn setup_active_direct() -> (
    ContractAddress, ContractAddress, ContractAddress, ContractAddress, felt252,
) {
    let (token, nft, pool, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    fund_payment_direct(token, escrow, deal_id);
    fund_asset(nft, escrow, deal_id);
    activate_as_buyer(escrow, deal_id);
    (token, nft, pool, escrow, deal_id)
}

#[test]
fn constructor_pins_pool_and_marks_private_path_unverified() {
    let (_, _, pool, escrow) = setup();
    let dispatcher = IVeilDealEscrowDispatcher { contract_address: escrow };
    assert(dispatcher.get_privacy_pool() == pool, 'BAD_POOL');
    assert(!dispatcher.is_privacy_path_e2e_verified(), 'PRIVACY_FALSE_CLAIM');
}

#[test]
fn constructor_rejects_zero_pool() {
    let contract = declare("VeilDealEscrow").unwrap().contract_class();
    let zero: ContractAddress = 0.try_into().unwrap();
    let calldata = array![zero.into()];
    match contract.deploy(@calldata) {
        Result::Err(_) => {},
        Result::Ok(_) => core::panic_with_felt252('ZERO_POOL_ACCEPTED'),
    }
}

#[test]
fn create_and_seller_accept_store_exact_committed_terms() {
    let (token, nft, _, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    let dispatcher = IVeilDealEscrowDispatcher { contract_address: escrow };
    let created = dispatcher.get_deal(deal_id);
    assert(created.buyer == address(BUYER), 'BAD_BUYER');
    assert(created.seller == address(SELLER), 'BAD_SELLER');
    assert(created.payment_token == token, 'BAD_TOKEN');
    assert(created.payment_amount == PAYMENT_AMOUNT, 'BAD_AMOUNT');
    assert(created.nft_contract == nft, 'BAD_NFT');
    assert(created.nft_token_id == NFT_ID, 'BAD_NFT_ID');
    assert(
        created.encrypted_terms_commitment == TERMS_COMMITMENT,
        'BAD_TERMS_COMMITMENT',
    );
    assert(created.status == DealStatus::Created, 'BAD_CREATED_STATE');
    assert(!created.accepted, 'PREACCEPTED');
    assert(dispatcher.get_deal_count() == 1, 'BAD_COUNT');

    accept(escrow, deal_id);
    assert(dispatcher.get_deal(deal_id).accepted, 'NOT_ACCEPTED');
}

#[test]
#[should_panic(expected: 'DEAL_NONCE_REPLAY')]
fn buyer_nonce_replay_is_rejected() {
    let (token, nft, _, escrow) = setup();
    create_default(escrow, token, nft);
    create_default(escrow, token, nft);
}

#[test]
#[should_panic(expected: 'INVALID_EXPIRY')]
fn non_future_expiry_is_rejected() {
    let (token, nft, _, escrow) = setup();
    start_cheat_block_timestamp(escrow, 100);
    create_with(escrow, token, nft, DEAL_NONCE, 100);
}

#[test]
#[should_panic(expected: 'ZERO_TERMS_COMMITMENT')]
fn zero_encrypted_terms_commitment_is_rejected() {
    let (token, nft, _, escrow) = setup();
    start_cheat_caller_address(escrow, address(BUYER));
    IVeilDealEscrowDispatcher { contract_address: escrow }
        .create_deal(
            address(SELLER), token, PAYMENT_AMOUNT, nft, NFT_ID, 0, DEAL_NONCE, EXPIRY,
        );
}

#[test]
#[should_panic(expected: 'ONLY_SELLER')]
fn only_seller_can_accept() {
    let (token, nft, _, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    start_cheat_caller_address(escrow, address(OTHER));
    IVeilDealEscrowDispatcher { contract_address: escrow }.accept_deal(deal_id);
}

#[test]
#[should_panic(expected: 'ALREADY_ACCEPTED')]
fn acceptance_cannot_replay() {
    let (token, nft, _, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    accept(escrow, deal_id);
}

#[test]
#[should_panic(expected: 'DEAL_EXPIRED')]
fn acceptance_after_expiry_is_rejected() {
    let (token, nft, _, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    start_cheat_block_timestamp(escrow, EXPIRY);
    accept(escrow, deal_id);
}

#[test]
fn complete_direct_happy_path_settles_exactly_once() {
    let (token, nft, _, escrow, deal_id) = setup_active_direct();
    let erc20 = IMockDealERC20Dispatcher { contract_address: token };
    let erc721 = IMockDealERC721Dispatcher { contract_address: nft };
    let dispatcher = IVeilDealEscrowDispatcher { contract_address: escrow };

    assert(dispatcher.get_status(deal_id) == DealStatus::Active, 'NOT_ACTIVE');
    assert(erc20.balance_of(escrow) == PAYMENT_AMOUNT.into(), 'BAD_ESCROW_BALANCE');
    assert(erc721.owner_of(NFT_ID) == escrow, 'NFT_NOT_ESCROWED');

    start_cheat_caller_address(escrow, address(BUYER));
    dispatcher.release(deal_id);

    assert(dispatcher.get_status(deal_id) == DealStatus::Released, 'NOT_RELEASED');
    assert(erc20.balance_of(escrow) == 0, 'PAYMENT_NOT_DRAINED');
    assert(erc20.balance_of(address(SELLER)) == PAYMENT_AMOUNT.into(), 'SELLER_NOT_PAID');
    assert(erc721.owner_of(NFT_ID) == address(BUYER), 'BUYER_NOT_NFT_OWNER');
    assert(dispatcher.get_reserved_amount(token) == 0, 'RESERVE_NOT_ZERO');
}

#[test]
#[should_panic(expected: 'INVALID_DEAL_STATE')]
fn release_before_active_is_rejected() {
    let (token, nft, _, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    start_cheat_caller_address(escrow, address(BUYER));
    IVeilDealEscrowDispatcher { contract_address: escrow }.release(deal_id);
}

#[test]
#[should_panic(expected: 'ONLY_BUYER')]
fn wrong_participant_cannot_deposit_payment() {
    let (token, nft, _, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    start_cheat_caller_address(escrow, address(SELLER));
    IVeilDealEscrowDispatcher { contract_address: escrow }.deposit_payment(deal_id);
}

#[test]
#[should_panic(expected: 'INVALID_DEAL_STATE')]
fn seller_cannot_deposit_nft_before_buyer_funds() {
    let (token, nft, _, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    IMockDealERC721Dispatcher { contract_address: nft }
        .approve_for(address(SELLER), escrow, NFT_ID);
    start_cheat_caller_address(escrow, address(SELLER));
    IVeilDealEscrowDispatcher { contract_address: escrow }.deposit_asset(deal_id);
}

#[test]
#[should_panic(expected: 'PAYMENT_ALREADY_FUNDED')]
fn duplicate_buyer_deposit_is_rejected() {
    let (token, nft, _, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    fund_payment_direct(token, escrow, deal_id);
    fund_payment_direct(token, escrow, deal_id);
}

#[test]
#[should_panic(expected: 'ASSET_ALREADY_FUNDED')]
fn duplicate_seller_deposit_is_rejected() {
    let (token, nft, _, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    fund_payment_direct(token, escrow, deal_id);
    fund_asset(nft, escrow, deal_id);
    fund_asset(nft, escrow, deal_id);
}

#[test]
#[should_panic(expected: 'INVALID_DEAL_STATE')]
fn double_release_is_rejected() {
    let (_, _, _, escrow, deal_id) = setup_active_direct();
    start_cheat_caller_address(escrow, address(BUYER));
    let dispatcher = IVeilDealEscrowDispatcher { contract_address: escrow };
    dispatcher.release(deal_id);
    dispatcher.release(deal_id);
}

#[test]
fn expired_partial_deal_refunds_exact_payment() {
    let (token, nft, _, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    fund_payment_direct(token, escrow, deal_id);
    start_cheat_block_timestamp(escrow, EXPIRY);
    start_cheat_caller_address(escrow, address(BUYER));
    let dispatcher = IVeilDealEscrowDispatcher { contract_address: escrow };
    dispatcher.refund_expired(deal_id);

    assert(dispatcher.get_status(deal_id) == DealStatus::Refunded, 'NOT_REFUNDED');
    assert(
        IMockDealERC20Dispatcher { contract_address: token }.balance_of(address(BUYER))
            == 10_000_u256,
        'BUYER_NOT_REFUNDED',
    );
    assert(dispatcher.get_reserved_amount(token) == 0, 'REFUND_RESERVE_LEFT');
}

#[test]
fn expired_active_deal_refunds_both_assets_atomically() {
    let (token, nft, _, escrow, deal_id) = setup_active_direct();
    start_cheat_block_timestamp(escrow, EXPIRY);
    start_cheat_caller_address(escrow, address(SELLER));
    let dispatcher = IVeilDealEscrowDispatcher { contract_address: escrow };
    dispatcher.refund_expired(deal_id);

    assert(dispatcher.get_status(deal_id) == DealStatus::Refunded, 'NOT_REFUNDED');
    assert(
        IMockDealERC20Dispatcher { contract_address: token }.balance_of(address(BUYER))
            == 10_000_u256,
        'BUYER_PAYMENT_NOT_RETURNED',
    );
    assert(
        IMockDealERC721Dispatcher { contract_address: nft }.owner_of(NFT_ID)
            == address(SELLER),
        'SELLER_NFT_NOT_RETURNED',
    );
}

#[test]
#[should_panic(expected: 'DEAL_NOT_EXPIRED')]
fn refund_before_expiry_is_rejected() {
    let (_, _, _, escrow, deal_id) = setup_active_direct();
    start_cheat_caller_address(escrow, address(BUYER));
    IVeilDealEscrowDispatcher { contract_address: escrow }.refund_expired(deal_id);
}

#[test]
#[should_panic(expected: 'INVALID_DEAL_STATE')]
fn double_refund_is_rejected() {
    let (token, nft, _, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    fund_payment_direct(token, escrow, deal_id);
    start_cheat_block_timestamp(escrow, EXPIRY);
    start_cheat_caller_address(escrow, address(BUYER));
    let dispatcher = IVeilDealEscrowDispatcher { contract_address: escrow };
    dispatcher.refund_expired(deal_id);
    dispatcher.refund_expired(deal_id);
}

#[test]
fn unfunded_deal_can_be_cancelled_once() {
    let (token, nft, _, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    start_cheat_caller_address(escrow, address(BUYER));
    let dispatcher = IVeilDealEscrowDispatcher { contract_address: escrow };
    dispatcher.cancel(deal_id);
    assert(dispatcher.get_status(deal_id) == DealStatus::Cancelled, 'NOT_CANCELLED');
}

#[test]
#[should_panic(expected: 'INVALID_DEAL_STATE')]
fn funded_deal_cannot_be_cancelled() {
    let (token, nft, _, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    fund_payment_direct(token, escrow, deal_id);
    start_cheat_caller_address(escrow, address(BUYER));
    IVeilDealEscrowDispatcher { contract_address: escrow }.cancel(deal_id);
}

#[test]
#[should_panic(expected: 'NOT_PRIVACY_POOL')]
fn unauthorized_pool_caller_is_rejected() {
    let (_, _, _, escrow) = setup();
    start_cheat_caller_address(escrow, address(OTHER));
    let calldata = array![PRIVATE_FUND_PAYMENT_ACTION, 1];
    IVeilDealEscrowDispatcher { contract_address: escrow }.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'PRIVATE_PAY_NOT_AUTH')]
fn pool_cannot_fund_without_buyer_authorization() {
    let (token, nft, pool, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    start_cheat_caller_address(escrow, pool);
    let calldata = array![PRIVATE_FUND_PAYMENT_ACTION, deal_id];
    IVeilDealEscrowDispatcher { contract_address: escrow }.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'PAYMENT_NOT_RECEIVED')]
fn private_funding_rejects_wrong_actual_amount() {
    let (token, nft, pool, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    start_cheat_caller_address(escrow, address(BUYER));
    IVeilDealEscrowDispatcher { contract_address: escrow }
        .authorize_private_payment(deal_id);
    start_cheat_caller_address(escrow, pool);
    IMockDealPrivacyPoolDispatcher { contract_address: pool }
        .fund_payment(escrow, token, PAYMENT_AMOUNT - 1, deal_id);
}

#[test]
#[should_panic(expected: 'INVALID_DEAL_DATA')]
fn private_funding_rejects_extra_token_or_amount_calldata() {
    let (token, nft, pool, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    start_cheat_caller_address(escrow, address(BUYER));
    IVeilDealEscrowDispatcher { contract_address: escrow }
        .authorize_private_payment(deal_id);
    start_cheat_caller_address(escrow, pool);
    let calldata = array![
        PRIVATE_FUND_PAYMENT_ACTION, deal_id, token.into(), PAYMENT_AMOUNT.into(),
    ];
    IVeilDealEscrowDispatcher { contract_address: escrow }.privacy_invoke(calldata.span());
}

#[test]
fn private_funding_and_release_use_fixed_exact_open_note() {
    let (token, nft, pool, escrow) = setup();
    let deal_id = create_default(escrow, token, nft);
    accept(escrow, deal_id);
    let dispatcher = IVeilDealEscrowDispatcher { contract_address: escrow };

    start_cheat_caller_address(escrow, address(BUYER));
    dispatcher.authorize_private_payment(deal_id);
    start_cheat_caller_address(escrow, pool);
    let pool_dispatcher = IMockDealPrivacyPoolDispatcher { contract_address: pool };
    pool_dispatcher.fund_payment(escrow, token, PAYMENT_AMOUNT, deal_id);
    assert(dispatcher.get_deal(deal_id).payment_via_pool, 'NOT_PRIVATE_FUNDED');

    fund_asset(nft, escrow, deal_id);
    activate_as_buyer(escrow, deal_id);
    start_cheat_caller_address(escrow, address(BUYER));
    dispatcher.authorize_private_release(deal_id, NOTE_ID);

    let pool_balance_before = IMockDealERC20Dispatcher { contract_address: token }
        .balance_of(pool);
    start_cheat_caller_address(escrow, pool);
    pool_dispatcher.release_private(escrow, deal_id, NOTE_ID);

    assert(dispatcher.get_status(deal_id) == DealStatus::Released, 'NOT_RELEASED');
    assert(pool_dispatcher.get_last_return_count() == 1, 'BAD_RETURN_COUNT');
    assert(pool_dispatcher.get_last_note_id() == NOTE_ID, 'BAD_NOTE_ID');
    assert(pool_dispatcher.get_last_token() == token, 'BAD_NOTE_TOKEN');
    assert(pool_dispatcher.get_last_amount() == PAYMENT_AMOUNT, 'BAD_NOTE_AMOUNT');
    assert(
        pool_dispatcher.get_observed_allowance() == PAYMENT_AMOUNT.into(),
        'ALLOWANCE_NOT_EXACT',
    );
    let erc20 = IMockDealERC20Dispatcher { contract_address: token };
    assert(erc20.allowance(escrow, pool) == 0, 'STALE_ALLOWANCE');
    assert(erc20.balance_of(pool) == pool_balance_before + PAYMENT_AMOUNT.into(), 'POOL_NOT_PAID');
    assert(erc20.balance_of(escrow) == 0, 'ESCROW_NOT_DRAINED');
    assert(
        IMockDealERC721Dispatcher { contract_address: nft }.owner_of(NFT_ID)
            == address(BUYER),
        'BUYER_NOT_NFT_OWNER',
    );
}

#[test]
#[should_panic(expected: 'PRIVATE_RELEASE_NOT_AUTH')]
fn pool_cannot_release_without_buyer_authorization() {
    let (_, _, pool, escrow, deal_id) = setup_active_direct();
    start_cheat_caller_address(escrow, pool);
    let calldata = array![PRIVATE_RELEASE_ACTION, deal_id, NOTE_ID];
    IVeilDealEscrowDispatcher { contract_address: escrow }.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'NOTE_ID_MISMATCH')]
fn private_release_note_id_is_bound_and_cannot_be_substituted() {
    let (_, _, pool, escrow, deal_id) = setup_active_direct();
    start_cheat_caller_address(escrow, address(BUYER));
    IVeilDealEscrowDispatcher { contract_address: escrow }
        .authorize_private_release(deal_id, NOTE_ID);
    start_cheat_caller_address(escrow, pool);
    let calldata = array![PRIVATE_RELEASE_ACTION, deal_id, NOTE_ID + 1];
    IVeilDealEscrowDispatcher { contract_address: escrow }.privacy_invoke(calldata.span());
}

