use snforge_std::{
    ContractClassTrait, DeclareResultTrait, Event, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_block_timestamp, start_cheat_caller_address,
};
use starknet::ContractAddress;

use veilc::offer_commitments::{
    compute_offer_commitment, compute_shielded_offer_action_commitment,
};
use veilc::offer_interfaces::{IVeilOfferDispatcher, IVeilOfferDispatcherTrait};
use veilc::offer_types::OfferStatus;
use veilc::offer_validation::{
    SHIELDED_ACCEPT_ACTION, SHIELDED_COUNTER_ACTION, SHIELDED_CREATE_ACTION,
};

const PRIVACY_POOL: felt252 = 0x123;
const ESCROW: felt252 = 0x456;
const OWNER: felt252 = 0x789;
const MAKER: felt252 = 0xabc;
const TAKER: felt252 = 0xdef;
const OTHER: felt252 = 0x987;

const NOW: u64 = 1_700_000_000;
const EXPIRY: u64 = 1_700_001_000;
const CONVERSATION_TAG: felt252 = 0x1111;
const ASSET_TYPE_COMMITMENT: felt252 = 0x2222;
const ASSET_COMMITMENT: felt252 = 0x3333;
const PAYMENT_COMMITMENT: felt252 = 0x4444;
const PRICE_COMMITMENT: felt252 = 0x5555;
const TERMS_COMMITMENT: felt252 = 0x6666;

fn address(value: felt252) -> ContractAddress {
    value.try_into().unwrap()
}

fn deploy_offer_with_escrow(escrow: felt252) -> ContractAddress {
    let contract = declare("VeilOffer").unwrap().contract_class();
    let calldata = array![PRIVACY_POOL, escrow, OWNER];
    let (contract_address, _) = contract.deploy(@calldata).unwrap();
    start_cheat_block_timestamp(contract_address, NOW);
    contract_address
}

fn deploy_offer() -> ContractAddress {
    deploy_offer_with_escrow(ESCROW)
}

fn dispatcher(contract_address: ContractAddress) -> IVeilOfferDispatcher {
    IVeilOfferDispatcher { contract_address }
}

fn create_offer_with(
    contract_address: ContractAddress,
    conversation_tag: felt252,
    terms_commitment: felt252,
    expires_at: u64,
) -> felt252 {
    start_cheat_caller_address(contract_address, address(MAKER));
    dispatcher(contract_address)
        .create_offer(
            conversation_tag,
            address(TAKER),
            ASSET_TYPE_COMMITMENT,
            ASSET_COMMITMENT,
            PAYMENT_COMMITMENT,
            PRICE_COMMITMENT,
            terms_commitment,
            expires_at,
        )
}

fn create_offer(contract_address: ContractAddress) -> felt252 {
    create_offer_with(contract_address, CONVERSATION_TAG, TERMS_COMMITMENT, EXPIRY)
}

fn make_shielded_calldata(
    action_kind: felt252,
    conversation_tag: felt252,
    encrypted_payload_commitment: felt252,
    valid_until: u64,
    replay_nullifier: felt252,
) -> Array<felt252> {
    let action_commitment = compute_shielded_offer_action_commitment(
        action_kind,
        conversation_tag,
        encrypted_payload_commitment,
        valid_until,
        replay_nullifier,
    );
    array![
        action_kind,
        conversation_tag,
        encrypted_payload_commitment,
        valid_until.into(),
        replay_nullifier,
        action_commitment,
    ]
}

fn invoke_as_pool(
    contract_address: ContractAddress,
    calldata: Span<felt252>,
) -> Span<veilc::privacy_pool_types::OpenNoteDeposit> {
    start_cheat_caller_address(contract_address, address(PRIVACY_POOL));
    dispatcher(contract_address).privacy_invoke(calldata)
}

#[test]
fn constructor_pins_pool_escrow_and_owner() {
    let contract_address = deploy_offer();
    let offer = dispatcher(contract_address);
    assert(offer.get_privacy_pool() == address(PRIVACY_POOL), 'BAD_POOL');
    assert(offer.get_escrow_contract() == address(ESCROW), 'BAD_ESCROW');
    assert(offer.get_owner() == address(OWNER), 'BAD_OWNER');
}

#[test]
fn constructor_rejects_zero_pool() {
    let contract = declare("VeilOffer").unwrap().contract_class();
    let calldata = array![0, ESCROW, OWNER];
    match contract.deploy(@calldata) {
        Result::Err(_) => {},
        Result::Ok(_) => core::panic_with_felt252('ZERO_POOL_ACCEPTED'),
    }
}

#[test]
fn constructor_rejects_zero_owner() {
    let contract = declare("VeilOffer").unwrap().contract_class();
    let calldata = array![PRIVACY_POOL, ESCROW, 0];
    match contract.deploy(@calldata) {
        Result::Err(_) => {},
        Result::Ok(_) => core::panic_with_felt252('ZERO_OWNER_ACCEPTED'),
    }
}

#[test]
fn create_stores_domain_separated_commitment_and_exact_state() {
    let contract_address = deploy_offer();
    let offer_id = create_offer(contract_address);
    let offer_api = dispatcher(contract_address);
    let stored = offer_api.get_offer(offer_id);
    let expected_commitment = compute_offer_commitment(
        CONVERSATION_TAG,
        offer_id,
        ASSET_TYPE_COMMITMENT,
        ASSET_COMMITMENT,
        PAYMENT_COMMITMENT,
        PRICE_COMMITMENT,
        TERMS_COMMITMENT,
        EXPIRY,
    );

    assert(offer_id == 1, 'BAD_OFFER_ID');
    assert(offer_api.get_offer_count() == 1, 'BAD_OFFER_COUNT');
    assert(stored.maker == address(MAKER), 'BAD_MAKER');
    assert(stored.taker == address(TAKER), 'BAD_TAKER');
    assert(stored.root_offer_id == offer_id, 'BAD_ROOT');
    assert(stored.parent_offer_id == 0, 'BAD_PARENT');
    assert(stored.status == OfferStatus::Open, 'BAD_STATUS');
    assert(stored.offer_commitment == expected_commitment, 'BAD_COMMITMENT');
    assert(offer_api.get_offer_commitment(offer_id) == expected_commitment, 'BAD_GETTER');
    assert(offer_api.is_terms_commitment_used(TERMS_COMMITMENT), 'TERMS_NOT_RESERVED');
}

#[test]
fn create_event_has_commitments_only_and_exact_shape() {
    let contract_address = deploy_offer();
    let mut spy = spy_events();
    let offer_id = create_offer(contract_address);
    let offer_commitment = dispatcher(contract_address).get_offer_commitment(offer_id);

    let expected = Event {
        keys: array![selector!("OfferCreated"), offer_id],
        data: array![
            CONVERSATION_TAG,
            ASSET_COMMITMENT,
            PAYMENT_COMMITMENT,
            PRICE_COMMITMENT,
            TERMS_COMMITMENT,
            offer_commitment,
            EXPIRY.into(),
            NOW.into(),
        ],
    };
    spy.assert_emitted(@array![(contract_address, expected)]);
}

#[test]
fn counter_closes_parent_and_swaps_participants() {
    let contract_address = deploy_offer();
    let offer_id = create_offer(contract_address);
    let offer_api = dispatcher(contract_address);
    let counter_terms = 0x7777;

    start_cheat_caller_address(contract_address, address(TAKER));
    let counter_id = offer_api.counter_offer(offer_id, 0x8888, counter_terms, EXPIRY + 10);
    let parent = offer_api.get_offer(offer_id);
    let counter = offer_api.get_offer(counter_id);

    assert(parent.status == OfferStatus::Countered, 'PARENT_NOT_COUNTERED');
    assert(counter_id == 2, 'BAD_COUNTER_ID');
    assert(counter.status == OfferStatus::Open, 'COUNTER_NOT_OPEN');
    assert(counter.maker == address(TAKER), 'COUNTER_BAD_MAKER');
    assert(counter.taker == address(MAKER), 'COUNTER_BAD_TAKER');
    assert(counter.root_offer_id == offer_id, 'COUNTER_BAD_ROOT');
    assert(counter.parent_offer_id == offer_id, 'COUNTER_BAD_PARENT');
    assert(offer_api.is_terms_commitment_used(counter_terms), 'COUNTER_NOT_RESERVED');
}

#[test]
fn taker_can_accept_open_non_expired_offer() {
    let contract_address = deploy_offer();
    let offer_id = create_offer(contract_address);
    start_cheat_caller_address(contract_address, address(TAKER));
    dispatcher(contract_address).accept_offer(offer_id);
    assert(
        dispatcher(contract_address).get_offer_status(offer_id) == OfferStatus::Accepted,
        'NOT_ACCEPTED',
    );
}

#[test]
fn taker_can_reject_open_non_expired_offer() {
    let contract_address = deploy_offer();
    let offer_id = create_offer(contract_address);
    start_cheat_caller_address(contract_address, address(TAKER));
    dispatcher(contract_address).reject_offer(offer_id);
    assert(
        dispatcher(contract_address).get_offer_status(offer_id) == OfferStatus::Rejected,
        'NOT_REJECTED',
    );
}

#[test]
fn maker_can_cancel_open_non_expired_offer() {
    let contract_address = deploy_offer();
    let offer_id = create_offer(contract_address);
    start_cheat_caller_address(contract_address, address(MAKER));
    dispatcher(contract_address).cancel_offer(offer_id);
    assert(
        dispatcher(contract_address).get_offer_status(offer_id) == OfferStatus::Cancelled,
        'NOT_CANCELLED',
    );
}

#[test]
fn anyone_can_materialize_expiry_at_deadline() {
    let contract_address = deploy_offer();
    let offer_id = create_offer(contract_address);
    start_cheat_block_timestamp(contract_address, EXPIRY);
    start_cheat_caller_address(contract_address, address(OTHER));
    dispatcher(contract_address).expire_offer(offer_id);
    assert(
        dispatcher(contract_address).get_offer_status(offer_id) == OfferStatus::Expired,
        'NOT_EXPIRED',
    );
}

#[test]
#[should_panic(expected: 'Invalid expiry')]
fn create_rejects_expiry_at_current_timestamp() {
    let contract_address = deploy_offer();
    create_offer_with(contract_address, CONVERSATION_TAG, TERMS_COMMITMENT, NOW);
}

#[test]
#[should_panic(expected: 'Invalid terms')]
fn create_rejects_zero_encrypted_terms_commitment() {
    let contract_address = deploy_offer();
    create_offer_with(contract_address, CONVERSATION_TAG, 0, EXPIRY);
}

#[test]
#[should_panic(expected: 'Offer replay')]
fn exact_terms_commitment_cannot_be_replayed() {
    let contract_address = deploy_offer();
    create_offer(contract_address);
    create_offer_with(contract_address, CONVERSATION_TAG + 1, TERMS_COMMITMENT, EXPIRY);
}

#[test]
#[should_panic(expected: 'Only taker')]
fn unauthorized_caller_cannot_accept() {
    let contract_address = deploy_offer();
    let offer_id = create_offer(contract_address);
    start_cheat_caller_address(contract_address, address(OTHER));
    dispatcher(contract_address).accept_offer(offer_id);
}

#[test]
#[should_panic(expected: 'Only maker')]
fn unauthorized_caller_cannot_cancel() {
    let contract_address = deploy_offer();
    let offer_id = create_offer(contract_address);
    start_cheat_caller_address(contract_address, address(TAKER));
    dispatcher(contract_address).cancel_offer(offer_id);
}

#[test]
#[should_panic(expected: 'Cannot accept')]
fn accepted_offer_cannot_be_accepted_twice() {
    let contract_address = deploy_offer();
    let offer_id = create_offer(contract_address);
    start_cheat_caller_address(contract_address, address(TAKER));
    dispatcher(contract_address).accept_offer(offer_id);
    dispatcher(contract_address).accept_offer(offer_id);
}

#[test]
#[should_panic(expected: 'Cannot accept')]
fn countered_parent_cannot_be_accepted() {
    let contract_address = deploy_offer();
    let offer_id = create_offer(contract_address);
    start_cheat_caller_address(contract_address, address(TAKER));
    dispatcher(contract_address).counter_offer(offer_id, 0x8888, 0x7777, EXPIRY + 1);
    dispatcher(contract_address).accept_offer(offer_id);
}

#[test]
fn only_pinned_escrow_can_convert_once() {
    let contract_address = deploy_offer();
    let offer_id = create_offer(contract_address);
    let offer_api = dispatcher(contract_address);
    start_cheat_caller_address(contract_address, address(TAKER));
    offer_api.accept_offer(offer_id);
    start_cheat_caller_address(contract_address, address(ESCROW));
    offer_api.mark_converted_to_escrow(offer_id, 0x9999);

    assert(offer_api.get_offer_status(offer_id) == OfferStatus::ConvertedToEscrow, 'NOT_CONVERTED');
    assert(offer_api.get_escrow_id(offer_id) == 0x9999, 'BAD_ESCROW_ID');
}

#[test]
#[should_panic(expected: 'Only escrow contract')]
fn non_escrow_cannot_convert_accepted_offer() {
    let contract_address = deploy_offer();
    let offer_id = create_offer(contract_address);
    let offer_api = dispatcher(contract_address);
    start_cheat_caller_address(contract_address, address(TAKER));
    offer_api.accept_offer(offer_id);
    start_cheat_caller_address(contract_address, address(OTHER));
    offer_api.mark_converted_to_escrow(offer_id, 0x9999);
}

#[test]
fn pool_action_is_fixed_commitment_only_and_returns_empty_span() {
    let contract_address = deploy_offer();
    let calldata = make_shielded_calldata(
        SHIELDED_CREATE_ACTION, CONVERSATION_TAG, 0xaaaa, EXPIRY, 0xbbbb,
    );
    let action_commitment = *calldata.at(5);
    let deposits = invoke_as_pool(contract_address, calldata.span());
    let offer_api = dispatcher(contract_address);
    let action = offer_api.get_shielded_action(1);

    assert(deposits.len() == 0, 'EXPECTED_EMPTY_DEPOSITS');
    assert(offer_api.get_offer_count() == 0, 'POOL_MUTATED_DIRECT_STATE');
    assert(offer_api.get_shielded_action_count() == 1, 'BAD_ACTION_COUNT');
    assert(action.action_index == 1, 'BAD_ACTION_INDEX');
    assert(action.action_kind == SHIELDED_CREATE_ACTION, 'BAD_ACTION_KIND');
    assert(action.conversation_tag == CONVERSATION_TAG, 'BAD_ACTION_CONVERSATION');
    assert(action.encrypted_payload_commitment == 0xaaaa, 'BAD_ENCRYPTED_COMMITMENT');
    assert(action.action_commitment == action_commitment, 'BAD_ACTION_COMMITMENT');
    assert(offer_api.is_shielded_action_committed(action_commitment), 'ACTION_NOT_COMMITTED');
    assert(offer_api.is_shielded_nullifier_used(0xbbbb), 'NULLIFIER_NOT_USED');
}

#[test]
fn shielded_action_event_has_minimal_exact_shape() {
    let contract_address = deploy_offer();
    let calldata = make_shielded_calldata(
        SHIELDED_COUNTER_ACTION, CONVERSATION_TAG, 0xaaaa, EXPIRY, 0xbbbb,
    );
    let action_commitment = *calldata.at(5);
    let mut spy = spy_events();
    invoke_as_pool(contract_address, calldata.span());

    let expected = Event {
        keys: array![selector!("ShieldedOfferActionCommitted"), CONVERSATION_TAG, 1],
        data: array![SHIELDED_COUNTER_ACTION, action_commitment, NOW.into()],
    };
    spy.assert_emitted(@array![(contract_address, expected)]);
}

#[test]
#[should_panic(expected: 'Not privacy pool')]
fn direct_wallet_cannot_call_privacy_invoke() {
    let contract_address = deploy_offer();
    let calldata = make_shielded_calldata(
        SHIELDED_CREATE_ACTION, CONVERSATION_TAG, 0xaaaa, EXPIRY, 0xbbbb,
    );
    start_cheat_caller_address(contract_address, address(OTHER));
    dispatcher(contract_address).privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'Invalid offer calldata')]
fn privacy_invoke_rejects_arbitrary_or_trailing_calldata() {
    let contract_address = deploy_offer();
    let calldata = array![SHIELDED_CREATE_ACTION, CONVERSATION_TAG, 0xaaaa];
    invoke_as_pool(contract_address, calldata.span());
}

#[test]
#[should_panic(expected: 'Invalid encrypted terms')]
fn privacy_invoke_rejects_zero_encrypted_commitment() {
    let contract_address = deploy_offer();
    let calldata = make_shielded_calldata(
        SHIELDED_CREATE_ACTION, CONVERSATION_TAG, 0, EXPIRY, 0xbbbb,
    );
    invoke_as_pool(contract_address, calldata.span());
}

#[test]
#[should_panic(expected: 'Offer commitment mismatch')]
fn privacy_invoke_rejects_malformed_commitment() {
    let contract_address = deploy_offer();
    let calldata = array![
        SHIELDED_CREATE_ACTION,
        CONVERSATION_TAG,
        0xaaaa,
        EXPIRY.into(),
        0xbbbb,
        0xcccc,
    ];
    invoke_as_pool(contract_address, calldata.span());
}

#[test]
#[should_panic(expected: 'Invalid offer action')]
fn privacy_invoke_rejects_unknown_action_kind() {
    let contract_address = deploy_offer();
    let calldata = make_shielded_calldata(99, CONVERSATION_TAG, 0xaaaa, EXPIRY, 0xbbbb);
    invoke_as_pool(contract_address, calldata.span());
}

#[test]
#[should_panic(expected: 'Offer action replay')]
fn exact_shielded_action_replay_is_rejected() {
    let contract_address = deploy_offer();
    let calldata = make_shielded_calldata(
        SHIELDED_ACCEPT_ACTION, CONVERSATION_TAG, 0xaaaa, EXPIRY, 0xbbbb,
    );
    invoke_as_pool(contract_address, calldata.span());
    invoke_as_pool(contract_address, calldata.span());
}

#[test]
#[should_panic(expected: 'Offer nullifier replay')]
fn shielded_nullifier_cannot_be_reused_with_changed_payload() {
    let contract_address = deploy_offer();
    let first = make_shielded_calldata(
        SHIELDED_CREATE_ACTION, CONVERSATION_TAG, 0xaaaa, EXPIRY, 0xbbbb,
    );
    let second = make_shielded_calldata(
        SHIELDED_COUNTER_ACTION, CONVERSATION_TAG, 0xcccc, EXPIRY, 0xbbbb,
    );
    invoke_as_pool(contract_address, first.span());
    invoke_as_pool(contract_address, second.span());
}

#[test]
#[should_panic(expected: 'Invalid expiry')]
fn shielded_action_rejects_expired_validity_window() {
    let contract_address = deploy_offer();
    let calldata = make_shielded_calldata(
        SHIELDED_CREATE_ACTION, CONVERSATION_TAG, 0xaaaa, NOW, 0xbbbb,
    );
    invoke_as_pool(contract_address, calldata.span());
}

#[test]
#[should_panic(expected: 'Shielded action not found')]
fn shielded_action_getter_rejects_unknown_index() {
    let contract_address = deploy_offer();
    dispatcher(contract_address).get_shielded_action(1);
}
