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

/// TEST SUITE SCOPE
///
/// These tests prove the local Cairo behavior of `VeilChannelHelper`.
///
/// PROVEN HERE:
/// - constructor configuration;
/// - Privacy Pool-only authorization;
/// - message-envelope validation;
/// - Poseidon commitment validation;
/// - one-time locator replay protection;
/// - ciphertext storage and guarded reads;
/// - minimal discovery event shape;
/// - empty `OpenNoteDeposit` return.
///
/// NOT PROVEN HERE:
/// - `CreateEncNote(amount = 0)` construction by the official Privacy SDK;
/// - real transaction proof generation;
/// - Invoke Transaction V3 and Outside Execution V2 submission;
/// - execution against the deployed Sepolia Privacy Pool;
/// - recipient discovery and local decryption;
/// - Alice-to-Bob and Bob-to-Alice end-to-end messaging.
///
/// Those properties require separate SDK, prover, integration, and Sepolia E2E tests.
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

/// TEST PURPOSE:
/// Proves that deployment stores the configured Privacy Pool address exactly.
/// This address becomes the sole authorized caller of `privacy_invoke`.
#[test]
fn constructor_stores_privacy_pool() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    assert(
        dispatcher.get_privacy_pool() == privacy_pool(),
        'pool mismatch',
    );
}

/// TEST PURPOSE:
/// Proves that the helper cannot be deployed without a valid Privacy Pool.
/// A zero pool address would permanently break or weaken caller authorization.
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

/// TEST PURPOSE:
/// Proves that identical envelope fields and ciphertext chunks produce the same Poseidon commitment.
/// SDK and contract implementations require deterministic hashing for compatibility.
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

/// TEST PURPOSE:
/// Proves that changing only the one-time message locator changes the commitment.
/// A commitment therefore cannot be silently moved to another locator.
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

/// TEST PURPOSE:
/// Proves that ciphertext chunk ordering is part of the commitment.
/// Reordering encrypted fields must invalidate the claimed envelope commitment.
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

/// TEST PURPOSE:
/// Proves that the envelope format version is part of the commitment.
/// A payload from another format version cannot reuse the same commitment.
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

/// TEST PURPOSE:
/// Proves the complete successful local contract path for one encrypted message.
/// It checks pool authorization, empty deposit return, record persistence, chunk persistence, and commitment status.
/// This is a Cairo unit/integration test and does not prove real Privacy Pool proof generation.
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

/// TEST PURPOSE:
/// Proves that two one-time locators create two independent message records.
/// The test also verifies that ciphertext chunks are not mixed between messages.
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

/// TEST PURPOSE:
/// Proves that a ciphertext felt equal to zero is treated as opaque encrypted data.
/// The helper must not reject valid ciphertext based on plaintext-like assumptions.
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

/// TEST PURPOSE:
/// Proves that exactly `MAX_PAYLOAD_CHUNKS` ciphertext chunks are accepted.
/// This confirms the inclusive upper boundary of the storage and execution limit.
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

/// TEST PURPOSE:
/// Proves that discovery emits only the event selector, one-time locator, and commitment.
/// It guards against accidentally reintroducing conversation tags, event counters, or plaintext metadata.
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

/// TEST PURPOSE:
/// Proves that wallets and arbitrary contracts cannot store messages directly.
/// Only the Privacy Pool address fixed during deployment may call `privacy_invoke`.
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

/// TEST PURPOSE:
/// Proves that calldata shorter than the fixed four-felt envelope header is rejected.
/// This prevents unsafe reads and ambiguous envelope decoding.
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

/// TEST PURPOSE:
/// Proves that the public envelope version must be representable as `u8`.
/// Malformed version values are rejected before application validation.
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

/// TEST PURPOSE:
/// Proves that structurally valid but unsupported envelope versions are rejected.
/// This prevents old or future formats from being interpreted under the wrong commitment rules.
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

/// TEST PURPOSE:
/// Proves that zero cannot be used as a one-time message locator.
/// Zero is reserved as an invalid/default storage value.
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

/// TEST PURPOSE:
/// Proves that a zero claimed commitment is rejected before storage.
/// A valid encrypted envelope must carry a non-zero commitment.
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

/// TEST PURPOSE:
/// Proves that every stored message contains at least one ciphertext chunk.
/// The helper no longer supports the old separate compact payload field.
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

/// TEST PURPOSE:
/// Proves that the helper recomputes Poseidon and rejects a false claimed commitment.
/// A caller cannot store ciphertext under an unrelated commitment.
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

/// TEST PURPOSE:
/// Proves that chunk counts which cannot be decoded as `u64` are rejected.
/// This protects length calculations and chunk iteration.
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

/// TEST PURPOSE:
/// Proves that a declared chunk count above `MAX_PAYLOAD_CHUNKS` is rejected.
/// This is the contract-level protection against unbounded calldata and storage writes.
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

/// TEST PURPOSE:
/// Proves that declared chunk count must exactly match the provided ciphertext length.
/// Missing chunks cannot be committed or stored.
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

/// TEST PURPOSE:
/// Proves that extra uncommitted calldata after the declared ciphertext is rejected.
/// Every accepted felt must be covered by the exact envelope layout and commitment.
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

/// TEST PURPOSE:
/// Proves that an identical message cannot be stored twice under the same one-time locator.
/// The second call must fail with `LOCATOR_ALREADY_USED`.
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

/// TEST PURPOSE:
/// Proves that a used locator cannot be overwritten with different ciphertext.
/// This protects one-time locator immutability, not only exact replay detection.
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
    dispatcher.privacy_invoke(second_calldata.span());
}

// -----------------------------------------------------------------------------
// Read protections
// -----------------------------------------------------------------------------

/// TEST PURPOSE:
/// Proves that an unknown storage key does not return an all-zero record as if it existed.
/// The explicit existence map must force `MESSAGE_NOT_FOUND`.
#[test]
#[should_panic(expected: 'MESSAGE_NOT_FOUND')]
fn get_message_rejects_unknown_locator() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    dispatcher.get_message(8001);
}

/// TEST PURPOSE:
/// Proves that ciphertext cannot be read for a message locator that was never stored.
/// Existence is checked before reading the record or chunk map.
#[test]
#[should_panic(expected: 'MESSAGE_NOT_FOUND')]
fn get_payload_chunk_rejects_unknown_locator() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    dispatcher.get_payload_chunk(8002, 0);
}

/// TEST PURPOSE:
/// Proves that chunk reads are restricted to the stored message's declared chunk count.
/// Reading index equal to the count must fail with `CHUNK_OOB`.
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
