use core::poseidon::poseidon_hash_span;
use snforge_std::{
    ContractClassTrait,
    DeclareResultTrait,
    Event,
    EventSpyAssertionsTrait,
    declare,
    spy_events,
    start_cheat_caller_address,
};
use starknet::ContractAddress;

use veilc::messaging_interfaces::{
    IVeilChannelHelperDispatcher,
    IVeilChannelHelperDispatcherTrait,
};
use veilc::utils::constants::{
    MAX_PAYLOAD_CHUNKS,
    VEIL_MESSAGE_COMMITMENT_DOMAIN,
    VEIL_MESSAGE_ENVELOPE_VERSION,
};

/// These tests prove the local Cairo behavior of `VeilChannelHelper`.
///
/// They do not prove the real Privacy Pool transaction flow, zero-value
/// encrypted-note creation, proof generation, relaying, or recipient-side
/// decryption. Those require a separate SDK and Sepolia E2E test.
const PRIVACY_POOL: felt252 = 0x123;
const OTHER_CALLER: felt252 = 0x456;

fn privacy_pool() -> ContractAddress {
    PRIVACY_POOL.try_into().unwrap()
}

fn other_caller() -> ContractAddress {
    OTHER_CALLER.try_into().unwrap()
}

fn deploy_contract() -> ContractAddress {
    let contract = declare("VeilChannelHelper")
        .unwrap()
        .contract_class();

    let constructor_calldata = array![PRIVACY_POOL];

    let (contract_address, _) = contract
        .deploy(@constructor_calldata)
        .unwrap();

    contract_address
}

/// Independent test-side implementation of the public message commitment.
///
/// This must remain synchronized with:
/// `contracts/messaging/timeline_payload_hash.cairo`.
fn compute_message_commitment(
    envelope_version: u8,
    message_locator: felt252,
    chunks: Span<felt252>,
) -> felt252 {
    let payload_chunk_count: u64 = chunks
        .len()
        .try_into()
        .expect('Chunk count overflow');

    let mut hash_input = ArrayTrait::<felt252>::new();

    hash_input.append(VEIL_MESSAGE_COMMITMENT_DOMAIN);
    hash_input.append(envelope_version.into());
    hash_input.append(message_locator);
    hash_input.append(payload_chunk_count.into());

    let mut chunk_index: usize = 0;

    loop {
        if chunk_index == chunks.len() {
            break;
        }

        hash_input.append(*chunks.at(chunk_index));
        chunk_index += 1;
    };

    poseidon_hash_span(hash_input.span())
}

fn make_calldata_with_version(
    envelope_version: u8,
    message_locator: felt252,
    chunks: Span<felt252>,
) -> Array<felt252> {
    let payload_commitment = compute_message_commitment(
        envelope_version,
        message_locator,
        chunks,
    );

    let mut calldata = array![
        envelope_version.into(),
        message_locator,
        payload_commitment,
        chunks.len().into(),
    ];

    let mut chunk_index: usize = 0;

    loop {
        if chunk_index == chunks.len() {
            break;
        }

        calldata.append(*chunks.at(chunk_index));
        chunk_index += 1;
    };

    calldata
}

fn make_calldata(
    message_locator: felt252,
    chunks: Span<felt252>,
) -> Array<felt252> {
    make_calldata_with_version(
        VEIL_MESSAGE_ENVELOPE_VERSION,
        message_locator,
        chunks,
    )
}

fn make_sequential_chunks(count: u64) -> Array<felt252> {
    let mut chunks = ArrayTrait::<felt252>::new();
    let mut chunk_index: u64 = 0;

    loop {
        if chunk_index == count {
            break;
        }

        chunks.append((chunk_index + 1).into());
        chunk_index += 1;
    };

    chunks
}

// -----------------------------------------------------------------------------
// Constructor and commitment primitives
// -----------------------------------------------------------------------------

#[test]
fn constructor_stores_privacy_pool() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    assert(
        dispatcher.get_privacy_pool() == privacy_pool(),
        'pool mismatch',
    );
}

#[test]
fn constructor_rejects_zero_privacy_pool() {
    let contract = declare("VeilChannelHelper")
        .unwrap()
        .contract_class();

    let constructor_calldata = array![0];

    match contract.deploy(@constructor_calldata) {
        Result::Err(_) => {},
        Result::Ok(_) => core::panic_with_felt252('ZERO_POOL_ACCEPTED'),
    }
}

#[test]
fn message_commitment_is_deterministic() {
    let chunks = array![111, 222, 333];

    let first = compute_message_commitment(
        VEIL_MESSAGE_ENVELOPE_VERSION,
        1001,
        chunks.span(),
    );

    let second = compute_message_commitment(
        VEIL_MESSAGE_ENVELOPE_VERSION,
        1001,
        chunks.span(),
    );

    assert(first == second, 'commitment mismatch');
}

#[test]
fn message_commitment_binds_locator() {
    let chunks = array![111, 222];

    let first = compute_message_commitment(
        VEIL_MESSAGE_ENVELOPE_VERSION,
        1001,
        chunks.span(),
    );

    let second = compute_message_commitment(
        VEIL_MESSAGE_ENVELOPE_VERSION,
        1002,
        chunks.span(),
    );

    assert(first != second, 'locator not bound');
}

#[test]
fn message_commitment_binds_ciphertext_order() {
    let first_chunks = array![111, 222];
    let second_chunks = array![222, 111];

    let first = compute_message_commitment(
        VEIL_MESSAGE_ENVELOPE_VERSION,
        1001,
        first_chunks.span(),
    );

    let second = compute_message_commitment(
        VEIL_MESSAGE_ENVELOPE_VERSION,
        1001,
        second_chunks.span(),
    );

    assert(first != second, 'order not bound');
}

#[test]
fn message_commitment_binds_envelope_version() {
    let chunks = array![111];

    let first = compute_message_commitment(
        VEIL_MESSAGE_ENVELOPE_VERSION,
        1001,
        chunks.span(),
    );

    let second = compute_message_commitment(
        VEIL_MESSAGE_ENVELOPE_VERSION + 1,
        1001,
        chunks.span(),
    );

    assert(first != second, 'version not bound');
}

// -----------------------------------------------------------------------------
// Successful Privacy Pool message writes
// -----------------------------------------------------------------------------

#[test]
fn privacy_pool_stores_encrypted_message() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let message_locator = 0x111;
    let chunks = array![0x222, 0x333];
    let calldata = make_calldata(message_locator, chunks.span());
    let payload_commitment = *calldata.at(2);

    assert(
        !dispatcher.message_exists(message_locator),
        'locator preexists',
    );
    assert(
        !dispatcher.is_payload_committed(payload_commitment),
        'commit preexists',
    );

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    let deposits = dispatcher.privacy_invoke(calldata.span());

    assert(deposits.len() == 0, 'unexpected deposits');
    assert(
        dispatcher.message_exists(message_locator),
        'message not stored',
    );
    assert(
        dispatcher.is_payload_committed(payload_commitment),
        'commit not stored',
    );

    let message = dispatcher.get_message(message_locator);

    assert(
        message.envelope_version == VEIL_MESSAGE_ENVELOPE_VERSION,
        'bad version',
    );
    assert(
        message.message_locator == message_locator,
        'bad locator',
    );
    assert(
        message.payload_commitment == payload_commitment,
        'bad commitment',
    );
    assert(
        message.payload_chunk_count == 2,
        'bad chunk count',
    );
    assert(
        dispatcher.get_payload_chunk(message_locator, 0) == 0x222,
        'bad chunk zero',
    );
    assert(
        dispatcher.get_payload_chunk(message_locator, 1) == 0x333,
        'bad chunk one',
    );
}

#[test]
fn different_locators_store_independent_messages() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let first_chunks = array![111];
    let second_chunks = array![222];

    let first_calldata = make_calldata(1001, first_chunks.span());
    let second_calldata = make_calldata(1002, second_chunks.span());

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(first_calldata.span());
    dispatcher.privacy_invoke(second_calldata.span());

    assert(dispatcher.message_exists(1001), 'first missing');
    assert(dispatcher.message_exists(1002), 'second missing');
    assert(
        dispatcher.get_payload_chunk(1001, 0) == 111,
        'first chunk bad',
    );
    assert(
        dispatcher.get_payload_chunk(1002, 0) == 222,
        'second chunk bad',
    );
}

#[test]
fn zero_valued_ciphertext_chunk_is_accepted() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let message_locator = 2001;
    let chunks = array![0];
    let calldata = make_calldata(message_locator, chunks.span());

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());

    assert(
        dispatcher.get_payload_chunk(message_locator, 0) == 0,
        'zero chunk changed',
    );
}

#[test]
fn maximum_ciphertext_boundary_is_accepted() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let message_locator = 3001;
    let chunks = make_sequential_chunks(MAX_PAYLOAD_CHUNKS);
    let calldata = make_calldata(message_locator, chunks.span());

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    let deposits = dispatcher.privacy_invoke(calldata.span());

    assert(deposits.len() == 0, 'unexpected deposits');

    let message = dispatcher.get_message(message_locator);

    assert(
        message.payload_chunk_count == MAX_PAYLOAD_CHUNKS,
        'boundary count bad',
    );
    assert(
        dispatcher.get_payload_chunk(
            message_locator,
            MAX_PAYLOAD_CHUNKS - 1,
        ) == MAX_PAYLOAD_CHUNKS.into(),
        'boundary chunk bad',
    );
}

#[test]
fn message_committed_event_has_minimal_shape() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let message_locator = 4001;
    let chunks = array![401, 402];
    let calldata = make_calldata(message_locator, chunks.span());
    let payload_commitment = *calldata.at(2);

    let mut spy = spy_events();

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());

    let expected = Event {
        keys: array![
            selector!("MessageCommitted"),
            message_locator,
        ],
        data: array![payload_commitment],
    };

    spy.assert_emitted(@array![(contract_address, expected)]);
}

// -----------------------------------------------------------------------------
// Authorization
// -----------------------------------------------------------------------------

#[test]
#[should_panic(expected: 'NOT_PRIVACY_POOL')]
fn privacy_invoke_rejects_non_pool_caller() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let chunks = array![111];
    let calldata = make_calldata(5001, chunks.span());

    start_cheat_caller_address(
        contract_address,
        other_caller(),
    );

    dispatcher.privacy_invoke(calldata.span());
}

// -----------------------------------------------------------------------------
// Envelope and calldata validation
// -----------------------------------------------------------------------------

#[test]
#[should_panic(expected: 'BAD_MESSAGE_DATA')]
fn privacy_invoke_rejects_truncated_header() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let calldata = array![
        VEIL_MESSAGE_ENVELOPE_VERSION.into(),
        6001,
        1,
    ];

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'BAD_ENVELOPE_VER')]
fn privacy_invoke_rejects_version_that_does_not_fit_u8() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let calldata = array![
        0x100,
        6002,
        1,
        1,
        111,
    ];

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'UNSUPPORTED_VER')]
fn privacy_invoke_rejects_unsupported_version() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let unsupported_version: u8 =
        VEIL_MESSAGE_ENVELOPE_VERSION + 1;

    let calldata = array![
        unsupported_version.into(),
        6003,
        1,
        1,
        111,
    ];

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_MSG_LOCATOR')]
fn privacy_invoke_rejects_zero_message_locator() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let chunks = array![111];
    let calldata = make_calldata(0, chunks.span());

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'ZERO_PAYLOAD_COMMIT')]
fn privacy_invoke_rejects_zero_commitment() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let calldata = array![
        VEIL_MESSAGE_ENVELOPE_VERSION.into(),
        6005,
        0,
        1,
        111,
    ];

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'EMPTY_CIPHERTEXT')]
fn privacy_invoke_rejects_empty_ciphertext() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let calldata = array![
        VEIL_MESSAGE_ENVELOPE_VERSION.into(),
        6006,
        1,
        0,
    ];

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'COMMITMENT_MISMATCH')]
fn privacy_invoke_rejects_invalid_commitment() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let calldata = array![
        VEIL_MESSAGE_ENVELOPE_VERSION.into(),
        6007,
        1,
        1,
        111,
    ];

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'BAD_CHUNK_COUNT')]
fn privacy_invoke_rejects_chunk_count_above_u64() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let calldata = array![
        VEIL_MESSAGE_ENVELOPE_VERSION.into(),
        6008,
        1,
        0x10000000000000000,
    ];

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'TOO_MANY_CHUNKS')]
fn privacy_invoke_rejects_oversized_ciphertext() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let oversized_count = MAX_PAYLOAD_CHUNKS + 1;

    let calldata = array![
        VEIL_MESSAGE_ENVELOPE_VERSION.into(),
        6009,
        1,
        oversized_count.into(),
    ];

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'BAD_PAYLOAD_SIZE')]
fn privacy_invoke_rejects_missing_ciphertext_chunk() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let calldata = array![
        VEIL_MESSAGE_ENVELOPE_VERSION.into(),
        6010,
        1,
        2,
        111,
    ];

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'BAD_PAYLOAD_SIZE')]
fn privacy_invoke_rejects_trailing_calldata() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let calldata = array![
        VEIL_MESSAGE_ENVELOPE_VERSION.into(),
        6011,
        1,
        1,
        111,
        222,
    ];

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());
}

// -----------------------------------------------------------------------------
// Replay and one-time locator protection
// -----------------------------------------------------------------------------

#[test]
#[should_panic(expected: 'LOCATOR_ALREADY_USED')]
fn exact_message_replay_is_rejected() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let chunks = array![111, 222];
    let calldata = make_calldata(7001, chunks.span());

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());
    dispatcher.privacy_invoke(calldata.span());
}

#[test]
#[should_panic(expected: 'LOCATOR_ALREADY_USED')]
fn reused_locator_with_different_ciphertext_is_rejected() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let first_chunks = array![111];
    let second_chunks = array![222];

    let first_calldata = make_calldata(
        7002,
        first_chunks.span(),
    );
    let second_calldata = make_calldata(
        7002,
        second_chunks.span(),
    );

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(first_calldata.span());
    dispatcher.priacy_invoke(second_calldata.span());
}

// -----------------------------------------------------------------------------
// Read protections
// -----------------------------------------------------------------------------

#[test]
#[should_panic(expected: 'MESSAGE_NOT_FOUND')]
fn get_message_rejects_unknown_locator() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    dispatcher.get_message(8001);
}

#[test]
#[should_panic(expected: 'MESSAGE_NOT_FOUND')]
fn get_payload_chunk_rejects_unknown_locator() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    dispatcher.get_payload_chunk(8002, 0);
}

#[test]
#[should_panic(expected: 'CHUNK_OOB')]
fn get_payload_chunk_rejects_out_of_bounds_index() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    let message_locator = 8003;
    let chunks = array![111, 222];
    let calldata = make_calldata(message_locator, chunks.span());

    start_cheat_caller_address(
        contract_address,
        privacy_pool(),
    );

    dispatcher.privacy_invoke(calldata.span());
    dispatcher.get_payload_chunk(message_locator, 2);
}
