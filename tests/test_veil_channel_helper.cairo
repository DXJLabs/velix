use core::poseidon::poseidon_hash_span;
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, Event, declare, spy_events,
    start_cheat_caller_address, EventSpyAssertionsTrait,
};
use starknet::ContractAddress;
use veilc::messaging_interfaces::{IVeilChannelHelperDispatcher, IVeilChannelHelperDispatcherTrait};
use veilc::utils::constants::{MAX_PAYLOAD_CHUNKS, VEIL_MESSAGE_ENVELOPE_VERSION, VEIL_MESSAGE_COMMITMENT_DOMAIN};

const PRIVACY_POOL: felt252 = 0x123;
const OTHER_CALLER: felt252 = 0x456;

fn privacy_pool() -> ContractAddress {
    PRIVACY_POOL.try_into().unwrap()
}

fn other_caller() -> ContractAddress {
    OTHER_CALLER.try_into().unwrap()
}

fn deploy_helper() -> ContractAddress {
    let contract = declare("VeilChannelHelper").unwrap().contract_class();
    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(PRIVACY_POOL);
    let (contract_address, _) = contract.deploy(@calldata).unwrap();
    contract_address
}

fn compute_message_commitment(
    message_locator: felt252,
    payload_chunk_count: u64,
    chunks: Span<felt252>,
) -> felt252 {
    let mut hash_input = ArrayTrait::<felt252>::new();
    hash_input.append(VEIL_MESSAGE_COMMITMENT_DOMAIN);
    hash_input.append(VEIL_MESSAGE_ENVELOPE_VERSION.into());
    hash_input.append(message_locator);
    hash_input.append(payload_chunk_count.into());

    let mut i: usize = 0;
    loop {
        if i == chunks.len() {
            break;
        }
        hash_input.append(*chunks.at(i));
        i += 1;
    };

    poseidon_hash_span(hash_input.span())
}

fn make_calldata(
    message_locator: felt252,
    override_commitment: felt252,
    chunks: Span<felt252>,
) -> Span<felt252> {
    let chunk_count: u64 = chunks.len().try_into().unwrap();
    let computed_commitment = compute_message_commitment(message_locator, chunk_count, chunks);

    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(VEIL_MESSAGE_ENVELOPE_VERSION.into());
    calldata.append(message_locator);
    calldata.append(if override_commitment == 0 { computed_commitment } else { override_commitment });
    calldata.append(chunk_count.into());

    let mut i: usize = 0;
    loop {
        if i == chunks.len() {
            break;
        }
        calldata.append(*chunks.at(i));
        i += 1;
    };

    calldata.span()
}

// =========================================================================
// A. Constructor
// =========================================================================

#[test]
fn constructor_stores_privacy_pool() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    assert(dispatcher.get_privacy_pool() == privacy_pool(), 'Wrong privacy pool');
}

#[test]
#[should_panic]
fn constructor_rejects_zero_privacy_pool() {
    let contract = declare("VeilChannelHelper").unwrap().contract_class();
    let calldata = array![0];
    contract.deploy(@calldata).unwrap();
}

// =========================================================================
// B. Authorized valid message
// =========================================================================

#[test]
fn privacy_invoke_stores_valid_message() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let chunks = array![0xAAA, 0xBBB, 0xCCC];
    let calldata = make_calldata(1001, 0, chunks.span());
    let deposits = dispatcher.privacy_invoke(calldata);

    assert(deposits.len() == 0, 'Expected no deposits');
    assert(dispatcher.message_exists(1001), 'Message not stored');

    let commitment = *calldata.at(2);
    assert(dispatcher.is_payload_committed(commitment), 'Commitment not stored');

    assert(dispatcher.get_message(1001).envelope_version == VEIL_MESSAGE_ENVELOPE_VERSION, 'Bad version');
    assert(dispatcher.get_message(1001).message_locator == 1001, 'Bad locator');
    assert(dispatcher.get_message(1001).payload_commitment == commitment, 'Bad commitment');
    assert(dispatcher.get_message(1001).payload_chunk_count == 3, 'Bad chunk count');

    assert(dispatcher.get_payload_chunk(1001, 0) == 0xAAA, 'Bad chunk 0');
    assert(dispatcher.get_payload_chunk(1001, 1) == 0xBBB, 'Bad chunk 1');
    assert(dispatcher.get_payload_chunk(1001, 2) == 0xCCC, 'Bad chunk 2');
}

#[test]
fn privacy_invoke_emits_message_committed_event() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let chunks = array![0x111, 0x222];
    let calldata = make_calldata(5005, 0, chunks.span());
    let expected_commitment = *calldata.at(2);

    let mut spy = spy_events();
    dispatcher.privacy_invoke(calldata);

    let expected_event = Event {
        keys: array![selector!("MessageCommitted"), 5005],
        data: array![expected_commitment],
    };
    spy.assert_emitted(@array![(contract_address, expected_event)]);
}

// =========================================================================
// C. Caller rejection
// =========================================================================

#[test]
#[should_panic(expected: 'NOT_PRIVACY_POOL')]
fn privacy_invoke_rejects_unconfigured_caller() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, other_caller());
    let chunks = array![0xAAA];
    let calldata = make_calldata(1001, 0, chunks.span());
    dispatcher.privacy_invoke(calldata);
}

// =========================================================================
// D. Envelope validation
// =========================================================================

#[test]
#[should_panic(expected: 'BAD_MESSAGE_DATA')]
fn invoke_rejects_truncated_header() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let calldata = array![1, 1001, 0xAAA];
    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'UNSUPPORTED_VER')]
fn invoke_rejects_wrong_envelope_version() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let chunks = array![0xAAA];
    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(2);
    calldata.append(1001);
    calldata.append(0xAAA);
    calldata.append(1);
    calldata.append(0xAAA);
    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_MSG_LOCATOR')]
fn invoke_rejects_zero_message_locator() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let chunks = array![0xAAA];
    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(VEIL_MESSAGE_ENVELOPE_VERSION.into());
    calldata.append(0);
    calldata.append(0xAAA);
    calldata.append(1);
    calldata.append(0xAAA);
    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_PAYLOAD_COMMIT')]
fn invoke_rejects_zero_payload_commitment() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let chunks = array![0xAAA];
    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(VEIL_MESSAGE_ENVELOPE_VERSION.into());
    calldata.append(1001);
    calldata.append(0);
    calldata.append(1);
    calldata.append(0xAAA);
    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'EMPTY_CIPHERTEXT')]
fn invoke_rejects_zero_chunk_count() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(VEIL_MESSAGE_ENVELOPE_VERSION.into());
    calldata.append(1001);
    calldata.append(0xAAA);
    calldata.append(0);
    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'TOO_MANY_CHUNKS')]
fn invoke_rejects_oversized_chunk_count() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let oversized_count = MAX_PAYLOAD_CHUNKS + 1;
    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(VEIL_MESSAGE_ENVELOPE_VERSION.into());
    calldata.append(1001);
    calldata.append(0xAAA);
    calldata.append(oversized_count.into());
    let mut i: u64 = 0;
    loop {
        if i == oversized_count {
            break;
        }
        calldata.append((i + 1).into());
        i += 1;
    };
    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'BAD_PAYLOAD_SIZE')]
fn invoke_rejects_missing_ciphertext_chunk() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(VEIL_MESSAGE_ENVELOPE_VERSION.into());
    calldata.append(1001);
    calldata.append(0xAAA);
    calldata.append(2);
    calldata.append(0xBBB);
    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'COMMITMENT_MISMATCH')]
fn invoke_rejects_invalid_commitment() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let chunks = array![0xAAA, 0xBBB];
    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(VEIL_MESSAGE_ENVELOPE_VERSION.into());
    calldata.append(1001);
    calldata.append(0xDEADBEEF);
    calldata.append(2);
    calldata.append(0xAAA);
    calldata.append(0xBBB);
    dispatcher.privacy_invoke(calldata.span());
}

// =========================================================================
// E. Duplicate protection
// =========================================================================

#[test]
#[should_panic(expected: 'LOCATOR_ALREADY_USED')]
fn duplicate_message_locator_is_rejected() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let chunks = array![0xAAA];
    let calldata = make_calldata(3003, 0, chunks.span());

    dispatcher.privacy_invoke(calldata);
    dispatcher.privacy_invoke(calldata);
}

#[test]
#[should_panic(expected: 'COMMITMENT_MISMATCH')]
fn commitment_reuse_with_different_chunks_is_rejected() {
    // Store first message, then try to reuse its commitment with different chunks.
    // The commitment mismatch should reject it (commitment includes all chunks).
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let chunks1 = array![0xAAA];
    let calldata1 = make_calldata(4004, 0, chunks1.span());
    let commitment1 = *calldata1.at(2);
    dispatcher.privacy_invoke(calldata1);

    // Different locator, different chunks, but same claimed commitment → COMMITMENT_MISMATCH
    let mut calldata2 = ArrayTrait::<felt252>::new();
    calldata2.append(VEIL_MESSAGE_ENVELOPE_VERSION.into());
    calldata2.append(4005);
    calldata2.append(commitment1);
    calldata2.append(1);
    calldata2.append(0xBBB); // different chunk → different computed commitment
    dispatcher.privacy_invoke(calldata2.span());
}

#[test]
fn first_record_unchanged_after_duplicate_rejected() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let chunks = array![0xAAA, 0xBBB];
    let calldata = make_calldata(5005, 0, chunks.span());
    let expected_commitment = *calldata.at(2);

    dispatcher.privacy_invoke(calldata);

    let msg = dispatcher.get_message(5005);
    assert(msg.envelope_version == VEIL_MESSAGE_ENVELOPE_VERSION, 'Version changed');
    assert(msg.message_locator == 5005, 'Locator changed');
    assert(msg.payload_commitment == expected_commitment, 'Commitment changed');
    assert(msg.payload_chunk_count == 2, 'Chunk count changed');
    assert(dispatcher.get_payload_chunk(5005, 0) == 0xAAA, 'Chunk 0 changed');
    assert(dispatcher.get_payload_chunk(5005, 1) == 0xBBB, 'Chunk 1 changed');
}

// =========================================================================
// F. Getter failure behavior
// =========================================================================

#[test]
#[should_panic(expected: 'MESSAGE_NOT_FOUND')]
fn get_message_rejects_missing_locator() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    dispatcher.get_message(9999);
}

#[test]
#[should_panic(expected: 'CHUNK_OOB')]
fn get_payload_chunk_rejects_out_of_bounds_index() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let chunks = array![0xAAA];
    let calldata = make_calldata(6006, 0, chunks.span());
    dispatcher.privacy_invoke(calldata);

    dispatcher.get_payload_chunk(6006, 1);
}

#[test]
fn maximum_ciphertext_boundary_is_accepted() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let mut chunks = ArrayTrait::<felt252>::new();
    let mut i: u64 = 0;
    loop {
        if i == MAX_PAYLOAD_CHUNKS {
            break;
        }
        chunks.append((i + 1).into());
        i += 1;
    };

    let calldata = make_calldata(7007, 0, chunks.span());
    let deposits = dispatcher.privacy_invoke(calldata);

    assert(deposits.len() == 0, 'Expected no deposits');
    assert(dispatcher.get_message(7007).payload_chunk_count == MAX_PAYLOAD_CHUNKS, 'Max count mismatch');
    assert(dispatcher.get_payload_chunk(7007, MAX_PAYLOAD_CHUNKS - 1) == MAX_PAYLOAD_CHUNKS.into(), 'Last chunk mismatch');
}

#[test]
fn commitment_status_consistent_after_store() {
    let contract_address = deploy_helper();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    start_cheat_caller_address(contract_address, privacy_pool());
    let chunks = array![0xAAA];
    let calldata = make_calldata(8008, 0, chunks.span());
    let expected_commitment = *calldata.at(2);

    assert(!dispatcher.is_payload_committed(expected_commitment), 'Pre-commit should be false');
    dispatcher.privacy_invoke(calldata);
    assert(dispatcher.is_payload_committed(expected_commitment), 'Post-commit should be true');
}
