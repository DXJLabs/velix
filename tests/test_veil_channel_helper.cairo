use core::poseidon::poseidon_hash_span;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_caller_address,
};
use starknet::ContractAddress;
use veilc::messaging_interfaces::{
    IVeilChannelHelperDispatcher, IVeilChannelHelperDispatcherTrait,
};
use veilc::messaging_types::VeilTimelineEvent;
use veilc::utils::constants::TIMELINE_PAYLOAD_DOMAIN;

const PRIVACY_POOL: felt252 = 0x123;
const OTHER_CALLER: felt252 = 0x456;

fn privacy_pool() -> ContractAddress {
    PRIVACY_POOL.try_into().unwrap()
}

fn other_caller() -> ContractAddress {
    OTHER_CALLER.try_into().unwrap()
}

fn deploy_contract() -> ContractAddress {
    let contract = declare("VeilChannelHelper").unwrap().contract_class();
    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(PRIVACY_POOL);
    let (contract_address, _) = contract.deploy(@calldata).unwrap();
    contract_address
}

fn compute_payload_hash(
    conversation_tag: felt252,
    encrypted_event_type: felt252,
    encrypted_payload: felt252,
    first_chunk: felt252,
    second_chunk: felt252,
    chunk_count: u64,
) -> felt252 {
    let mut hash_input = ArrayTrait::<felt252>::new();
    hash_input.append(TIMELINE_PAYLOAD_DOMAIN);
    hash_input.append(conversation_tag);
    hash_input.append(encrypted_event_type);
    hash_input.append(encrypted_payload);
    hash_input.append(chunk_count.into());

    if chunk_count > 0 {
        hash_input.append(first_chunk);
    }

    if chunk_count > 1 {
        hash_input.append(second_chunk);
    }

    poseidon_hash_span(hash_input.span())
}

fn make_calldata(
    conversation_tag: felt252,
    encrypted_event_type: felt252,
    encrypted_payload: felt252,
) -> Array<felt252> {
    let payload_hash = compute_payload_hash(
        conversation_tag,
        encrypted_event_type,
        encrypted_payload,
        0,
        0,
        0,
    );

    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(conversation_tag);
    calldata.append(encrypted_event_type);
    calldata.append(encrypted_payload);
    calldata.append(payload_hash);
    calldata.append(0);
    calldata
}

fn make_chunked_calldata(
    conversation_tag: felt252,
    encrypted_event_type: felt252,
    encrypted_payload: felt252,
    first_chunk: felt252,
    second_chunk: felt252,
) -> Array<felt252> {
    let payload_hash = compute_payload_hash(
        conversation_tag,
        encrypted_event_type,
        encrypted_payload,
        first_chunk,
        second_chunk,
        2,
    );

    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(conversation_tag);
    calldata.append(encrypted_event_type);
    calldata.append(encrypted_payload);
    calldata.append(payload_hash);
    calldata.append(2);
    calldata.append(first_chunk);
    calldata.append(second_chunk);
    calldata
}

fn assert_event(
    event: VeilTimelineEvent,
    event_id: felt252,
    conversation_tag: felt252,
    encrypted_event_type: felt252,
    encrypted_payload: felt252,
    payload_chunk_count: u64,
) {
    assert(event.event_id == event_id, 'Invalid event id');
    assert(
        event.conversation_tag == conversation_tag,
        'Invalid conversation',
    );
    assert(
        event.encrypted_event_type == encrypted_event_type,
        'Invalid event type',
    );
    assert(
        event.encrypted_payload == encrypted_payload,
        'Invalid payload',
    );
    assert(
        event.payload_chunk_count == payload_chunk_count,
        'Invalid chunk count',
    );
}

#[test]
fn constructor_stores_privacy_pool() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    assert(
        dispatcher.get_privacy_pool() == privacy_pool(),
        'Invalid privacy pool',
    );
}

#[test]
fn direct_invoke_stores_timeline_event() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = make_calldata(1001, 2002, 3003);

    let deposits = dispatcher.invoke(calldata.span());

    assert(deposits.len() == 0, 'Expected no deposits');
    assert(dispatcher.get_event_count(1001) == 1, 'Invalid count');
    assert_event(dispatcher.get_event(1001, 0), 1, 1001, 2002, 3003, 0);
}

#[test]
fn privacy_invoke_accepts_configured_pool() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = make_calldata(4004, 5005, 6006);

    start_cheat_caller_address(contract_address, privacy_pool());
    let deposits = dispatcher.privacy_invoke(calldata.span());

    assert(deposits.len() == 0, 'Expected no deposits');
    assert(dispatcher.get_event_count(4004) == 1, 'Invalid count');

    start_cheat_caller_address(contract_address, other_caller());
}

#[test]
fn chunked_payloads_are_stored_separately() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = make_chunked_calldata(7007, 8008, 9009, 111, 222);

    let deposits = dispatcher.invoke(calldata.span());

    assert(deposits.len() == 0, 'Expected no deposits');
    let event = dispatcher.get_event(7007, 0);
    assert_event(event, 1, 7007, 8008, 9009, 2);
    assert(dispatcher.get_payload_chunk(7007, 0, 0) == 111, 'Bad chunk 0');
    assert(dispatcher.get_payload_chunk(7007, 0, 1) == 222, 'Bad chunk 1');
}
