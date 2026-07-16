use core::poseidon::poseidon_hash_span;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, Event, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_block_timestamp, start_cheat_caller_address,
};
use starknet::ContractAddress;
use veilc::messaging_interfaces::{IVeilChannelHelperDispatcher, IVeilChannelHelperDispatcherTrait};
use veilc::messaging_types::VeilTimelineEvent;
use veilc::utils::constants::{MAX_PAYLOAD_CHUNKS, TIMELINE_PAYLOAD_DOMAIN};

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
    chunks: Span<felt252>,
) -> felt252 {
    let chunk_count: u64 = chunks.len().try_into().unwrap();
    let mut hash_input = ArrayTrait::<felt252>::new();
    hash_input.append(TIMELINE_PAYLOAD_DOMAIN);
    hash_input.append(conversation_tag);
    hash_input.append(encrypted_event_type);
    hash_input.append(encrypted_payload);
    hash_input.append(chunk_count.into());

    let mut chunk_index: usize = 0;
    loop {
        if chunk_index == chunks.len() {
            break;
        }
        hash_input.append(*chunks.at(chunk_index));
        chunk_index += 1;
    }

    poseidon_hash_span(hash_input.span())
}

fn make_calldata(
    conversation_tag: felt252, encrypted_event_type: felt252, encrypted_payload: felt252,
) -> Array<felt252> {
    let chunks = ArrayTrait::<felt252>::new();
    let payload_hash = compute_payload_hash(
        conversation_tag, encrypted_event_type, encrypted_payload, chunks.span(),
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
    let chunks = array![first_chunk, second_chunk];
    let payload_hash = compute_payload_hash(
        conversation_tag, encrypted_event_type, encrypted_payload, chunks.span(),
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

fn make_calldata_with_chunks(
    conversation_tag: felt252,
    encrypted_event_type: felt252,
    encrypted_payload: felt252,
    chunks: Span<felt252>,
) -> Array<felt252> {
    let payload_hash = compute_payload_hash(
        conversation_tag, encrypted_event_type, encrypted_payload, chunks,
    );

    let mut calldata = array![
        conversation_tag, encrypted_event_type, encrypted_payload, payload_hash,
        chunks.len().into(),
    ];

    let mut chunk_index: usize = 0;
    loop {
        if chunk_index == chunks.len() {
            break;
        }
        calldata.append(*chunks.at(chunk_index));
        chunk_index += 1;
    }

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
    assert(event.conversation_tag == conversation_tag, 'Invalid conversation');
    assert(event.encrypted_event_type == encrypted_event_type, 'Invalid event type');
    assert(event.encrypted_payload == encrypted_payload, 'Invalid payload');
    assert(event.payload_chunk_count == payload_chunk_count, 'Invalid chunk count');
}

#[test]
fn constructor_stores_privacy_pool() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    assert(dispatcher.get_privacy_pool() == privacy_pool(), 'Invalid privacy pool');
}

#[test]
fn direct_invoke_stores_timeline_event() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = make_calldata(1001, 2002, 3003);

    let deposits = dispatcher.invoke(calldata.span());

    assert(deposits.len() == 0, 'Expected no deposits');
    assert(dispatcher.get_event_count(1001) == 1, 'Invalid count');
    assert(!dispatcher.is_privacy_pool_event(1001, 0), 'Invalid direct origin');
    assert_event(dispatcher.get_event(1001, 0), 1, 1001, 2002, 3003, 0);
}

#[test]
fn payload_hash_matches_sdk_test_vector() {
    let no_chunks = ArrayTrait::<felt252>::new();
    let compact_hash = compute_payload_hash(1001, 2002, 3003, no_chunks.span());
    assert(
        compact_hash == 0x2a4ac8ff8d3bccf56f474476045a9b67da37a6ceb9433344ae37f77f924699,
        'Bad compact vector',
    );

    let chunks = array![111, 222];
    let chunked_hash = compute_payload_hash(7007, 8008, 9009, chunks.span());
    assert(
        chunked_hash == 0x7c313dafedaabe86f45f8a5cea959a9417137719bc5c10534608339def3202a,
        'Bad chunked vector',
    );
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
    assert(dispatcher.is_privacy_pool_event(4004, 0), 'Invalid pool origin');

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

#[test]
fn constructor_rejects_zero_privacy_pool() {
    let contract = declare("VeilChannelHelper").unwrap().contract_class();
    let calldata = array![0];
    match contract.deploy(@calldata) {
        Result::Err(_) => {},
        Result::Ok(_) => core::panic_with_felt252('ZERO_POOL_ACCEPTED'),
    }
}

#[test]
fn direct_invoke_remains_available_to_non_pool_callers() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = make_calldata(101, 202, 303);

    start_cheat_caller_address(contract_address, other_caller());
    let deposits = dispatcher.invoke(calldata.span());

    assert(deposits.len() == 0, 'Expected no deposits');
    assert(dispatcher.get_event_count(101) == 1, 'Direct path unavailable');
}

#[test]
#[should_panic(expected: 'NOT_PRIVACY_POOL')]
fn privacy_invoke_rejects_unconfigured_caller() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = make_calldata(101, 202, 303);

    start_cheat_caller_address(contract_address, other_caller());
    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'BAD_TIMELINE_DATA')]
fn invoke_rejects_truncated_header() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = array![1001, 2002, 3003, 4004];

    dispatcher.invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_CONV_TAG')]
fn invoke_rejects_zero_conversation_tag() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = make_calldata(0, 2002, 3003);

    dispatcher.invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_PAYLOAD_HASH')]
fn invoke_rejects_zero_payload_commitment() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = array![1001, 2002, 3003, 0, 0];

    dispatcher.invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'PAYLOAD_HASH_MISMATCH')]
fn invoke_rejects_invalid_payload_commitment() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = array![1001, 2002, 3003, 1, 0];

    dispatcher.invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'BAD_CHUNK_COUNT')]
fn invoke_rejects_chunk_count_that_does_not_fit_u64() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = array![1001, 2002, 3003, 1, 0x10000000000000000];

    dispatcher.invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'TOO_MANY_CHUNKS')]
fn invoke_rejects_oversized_ciphertext() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let oversized_count = MAX_PAYLOAD_CHUNKS + 1;
    let mut calldata = array![1001, 2002, 3003, 1, oversized_count.into()];
    let mut chunk_index: u64 = 0;

    loop {
        if chunk_index == oversized_count {
            break;
        }
        calldata.append((chunk_index + 1).into());
        chunk_index += 1;
    }

    dispatcher.invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'BAD_PAYLOAD_SIZE')]
fn invoke_rejects_missing_ciphertext_chunk() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = array![1001, 2002, 3003, 1, 2, 111];

    dispatcher.invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'BAD_PAYLOAD_SIZE')]
fn invoke_rejects_uncommitted_trailing_calldata() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = array![1001, 2002, 3003, 1, 0, 111];

    dispatcher.invoke(calldata.span());
}

#[test]
fn maximum_ciphertext_boundary_is_accepted() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let mut chunks = ArrayTrait::<felt252>::new();
    let mut chunk_index: u64 = 0;

    loop {
        if chunk_index == MAX_PAYLOAD_CHUNKS {
            break;
        }
        chunks.append((chunk_index + 1).into());
        chunk_index += 1;
    }

    let calldata = make_calldata_with_chunks(505, 606, 707, chunks.span());
    let deposits = dispatcher.invoke(calldata.span());

    assert(deposits.len() == 0, 'Expected no deposits');
    assert(
        dispatcher.get_event(505, 0).payload_chunk_count == MAX_PAYLOAD_CHUNKS,
        'Boundary count mismatch',
    );
    assert(
        dispatcher.get_payload_chunk(505, 0, MAX_PAYLOAD_CHUNKS - 1) == MAX_PAYLOAD_CHUNKS.into(),
        'Boundary chunk mismatch',
    );
}

#[test]
fn commitment_status_and_duplicate_guard_are_consistent() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = make_calldata(808, 909, 1001);
    let payload_hash = *calldata.at(3);

    assert(!dispatcher.is_payload_committed(808, payload_hash), 'Commitment unexpectedly exists');
    dispatcher.invoke(calldata.span());
    assert(dispatcher.is_payload_committed(808, payload_hash), 'Commitment status missing');
}

#[test]
#[should_panic(expected: 'TIMELINE_REPLAY')]
fn exact_ciphertext_replay_is_rejected() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = make_calldata(808, 909, 1001);

    dispatcher.invoke(calldata.span());
    dispatcher.invoke(calldata.span());
}

#[test]
fn event_ids_are_monotonic_per_conversation() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let first = make_calldata(1111, 2222, 3333);
    let second = make_calldata(1111, 2222, 4444);

    dispatcher.invoke(first.span());
    dispatcher.invoke(second.span());

    assert(dispatcher.get_event_count(1111) == 2, 'Invalid event count');
    assert(dispatcher.get_event(1111, 0).event_id == 1, 'Invalid first id');
    assert(dispatcher.get_event(1111, 1).event_id == 2, 'Invalid second id');
}

#[test]
#[should_panic(expected: 'EVENT_OOB')]
fn get_event_rejects_out_of_bounds_index() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    dispatcher.get_event(1001, 0);
}

#[test]
#[should_panic(expected: 'EVENT_OOB')]
fn get_payload_chunk_rejects_unknown_event_index() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    dispatcher.get_payload_chunk(1001, 0, 0);
}

#[test]
#[should_panic(expected: 'EVENT_OOB')]
fn privacy_origin_getter_rejects_unknown_event_index() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    dispatcher.is_privacy_pool_event(1001, 0);
}

#[test]
#[should_panic(expected: 'CHUNK_OOB')]
fn get_payload_chunk_rejects_out_of_bounds_chunk_index() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = make_chunked_calldata(7007, 8008, 9009, 111, 222);

    dispatcher.invoke(calldata.span());
    dispatcher.get_payload_chunk(7007, 0, 2);
}

#[test]
fn timeline_commitment_event_has_exact_minimal_shape() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = make_calldata(1201, 1202, 1203);
    let payload_hash = *calldata.at(3);
    let timestamp = 1_700_000_001;
    let mut spy = spy_events();

    start_cheat_block_timestamp(contract_address, timestamp);
    dispatcher.invoke(calldata.span());

    let expected = Event {
        keys: array![selector!("TimelineCommitmentStored"), 1201, 1], data: array![payload_hash],
    };
    spy.assert_emitted(@array![(contract_address, expected)]);

    let stored = dispatcher.get_event(1201, 0);
    assert(stored.created_at == timestamp, 'Invalid timestamp');
    assert(stored.payload_hash == payload_hash, 'Invalid stored hash');
}
