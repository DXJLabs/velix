use snforge_std::{
    ContractClassTrait,
    DeclareResultTrait,
    declare,
    start_cheat_caller_address,
};
use starknet::ContractAddress;

use veilc::private_escrow_commitments::compute_private_escrow_action_commitment;
use veilc::private_escrow_interfaces::{
    IVeilPrivateEscrowHelperDispatcher,
    IVeilPrivateEscrowHelperDispatcherTrait,
};
use veilc::utils::constants::{
    MAX_PRIVATE_ESCROW_PAYLOAD_CHUNKS,
    VEIL_PRIVATE_ESCROW_ENVELOPE_VERSION,
};

const PRIVACY_POOL: felt252 = 0x123;
const OTHER_CALLER: felt252 = 0x456;

fn address(value: felt252) -> ContractAddress {
    value.try_into().unwrap()
}

fn privacy_pool() -> ContractAddress {
    address(PRIVACY_POOL)
}

fn other_caller() -> ContractAddress {
    address(OTHER_CALLER)
}

fn deploy_private_escrow_helper() -> ContractAddress {
    let contract = declare("VeilPrivateEscrowHelper").unwrap().contract_class();
    let calldata = array![PRIVACY_POOL];
    let (contract_address, _) = contract.deploy(@calldata).unwrap();
    contract_address
}

fn dispatcher(
    contract_address: ContractAddress,
) -> IVeilPrivateEscrowHelperDispatcher {
    IVeilPrivateEscrowHelperDispatcher { contract_address }
}

fn make_calldata_with_version(
    envelope_version: u8,
    private_escrow_action_locator: felt252,
    override_commitment: felt252,
    chunks: Span<felt252>,
) -> Span<felt252> {
    let payload_chunk_count: u64 = chunks.len().try_into().unwrap();

    // The commitment function reads the envelope structure and ciphertext
    // chunks. The claimed commitment slot is deliberately ignored because
    // including it would create a circular hash.
    let mut provisional = ArrayTrait::<felt252>::new();
    provisional.append(envelope_version.into());
    provisional.append(private_escrow_action_locator);
    provisional.append(0);
    provisional.append(payload_chunk_count.into());

    let mut i: usize = 0;
    loop {
        if i == chunks.len() {
            break;
        }

        provisional.append(*chunks.at(i));
        i += 1;
    };

    let computed_commitment = compute_private_escrow_action_commitment(
        envelope_version,
        private_escrow_action_locator,
        payload_chunk_count,
        provisional.span(),
    );

    let claimed_commitment = if override_commitment == 0 {
        computed_commitment
    } else {
        override_commitment
    };

    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(envelope_version.into());
    calldata.append(private_escrow_action_locator);
    calldata.append(claimed_commitment);
    calldata.append(payload_chunk_count.into());

    let mut j: usize = 0;
    loop {
        if j == chunks.len() {
            break;
        }

        calldata.append(*chunks.at(j));
        j += 1;
    };

    calldata.span()
}

fn make_calldata(
    private_escrow_action_locator: felt252,
    override_commitment: felt252,
    chunks: Span<felt252>,
) -> Span<felt252> {
    make_calldata_with_version(
        VEIL_PRIVATE_ESCROW_ENVELOPE_VERSION,
        private_escrow_action_locator,
        override_commitment,
        chunks,
    )
}

#[test]
fn constructor_stores_privacy_pool() {
    let contract_address = deploy_private_escrow_helper();
    let private_escrow = dispatcher(contract_address);

    assert(
        private_escrow.get_privacy_pool() == privacy_pool(),
        'BAD_PRIVACY_POOL',
    );
}

#[test]
#[should_panic]
fn constructor_rejects_zero_privacy_pool() {
    let contract = declare("VeilPrivateEscrowHelper").unwrap().contract_class();
    let calldata = array![0];
    contract.deploy(@calldata).unwrap();
}

#[test]
fn privacy_invoke_stores_encrypted_private_escrow_action() {
    let contract_address = deploy_private_escrow_helper();
    let private_escrow = dispatcher(contract_address);

    let chunks = array![0xAAA, 0xBBB, 0xCCC];
    let calldata = make_calldata(1001, 0, chunks.span());
    let expected_commitment = *calldata.at(2);

    start_cheat_caller_address(contract_address, privacy_pool());
    let deposits = private_escrow.privacy_invoke(calldata);

    assert(deposits.len() == 0, 'DEPOSITS_NOT_EMPTY');
    assert(private_escrow.has_private_escrow_action(1001), 'ACTION_NOT_STORED');

    let stored = private_escrow.get_private_escrow_action(1001);

    assert(
        stored.envelope_version == VEIL_PRIVATE_ESCROW_ENVELOPE_VERSION,
        'BAD_ENVELOPE_VERSION',
    );
    assert(
        stored.private_escrow_action_locator == 1001,
        'BAD_ACTION_LOCATOR',
    );
    assert(
        stored.payload_commitment == expected_commitment,
        'BAD_COMMITMENT',
    );
    assert(
        stored.payload_chunk_count == 3,
        'BAD_CHUNK_COUNT',
    );

    assert(
        private_escrow.get_private_escrow_payload_chunk(1001, 0) == 0xAAA,
        'BAD_CHUNK_0',
    );
    assert(
        private_escrow.get_private_escrow_payload_chunk(1001, 1) == 0xBBB,
        'BAD_CHUNK_1',
    );
    assert(
        private_escrow.get_private_escrow_payload_chunk(1001, 2) == 0xCCC,
        'BAD_CHUNK_2',
    );

    assert(
        private_escrow.is_private_escrow_payload_committed(expected_commitment),
        'COMMITMENT_NOT_STORED',
    );
}

#[test]
#[should_panic]
fn privacy_invoke_rejects_unconfigured_caller() {
    let contract_address = deploy_private_escrow_helper();
    let private_escrow = dispatcher(contract_address);

    let chunks = array![0xAAA];
    let calldata = make_calldata(1001, 0, chunks.span());

    start_cheat_caller_address(contract_address, other_caller());
    private_escrow.privacy_invoke(calldata);
}

#[test]
#[should_panic]
fn privacy_invoke_rejects_truncated_header() {
    let contract_address = deploy_private_escrow_helper();
    let private_escrow = dispatcher(contract_address);

    start_cheat_caller_address(contract_address, privacy_pool());
    let calldata = array![1, 1001, 0xAAA];
    private_escrow.privacy_invoke(calldata.span());
}

#[test]
#[should_panic]
fn privacy_invoke_rejects_wrong_envelope_version() {
    let contract_address = deploy_private_escrow_helper();
    let private_escrow = dispatcher(contract_address);

    let chunks = array![0xAAA];
    let calldata = make_calldata_with_version(
        VEIL_PRIVATE_ESCROW_ENVELOPE_VERSION + 1,
        1001,
        0,
        chunks.span(),
    );

    start_cheat_caller_address(contract_address, privacy_pool());
    private_escrow.privacy_invoke(calldata);
}

#[test]
#[should_panic]
fn privacy_invoke_rejects_zero_locator() {
    let contract_address = deploy_private_escrow_helper();
    let private_escrow = dispatcher(contract_address);

    let chunks = array![0xAAA];
    let calldata = make_calldata(0, 0, chunks.span());

    start_cheat_caller_address(contract_address, privacy_pool());
    private_escrow.privacy_invoke(calldata);
}

#[test]
#[should_panic]
fn privacy_invoke_rejects_zero_commitment() {
    let contract_address = deploy_private_escrow_helper();
    let private_escrow = dispatcher(contract_address);

    let calldata = array![
        VEIL_PRIVATE_ESCROW_ENVELOPE_VERSION.into(),
        1001,
        0,
        1,
        0xAAA,
    ];

    start_cheat_caller_address(contract_address, privacy_pool());
    private_escrow.privacy_invoke(calldata.span());
}

#[test]
#[should_panic]
fn privacy_invoke_rejects_zero_chunk_count() {
    let contract_address = deploy_private_escrow_helper();
    let private_escrow = dispatcher(contract_address);

    let calldata = array![
        VEIL_PRIVATE_ESCROW_ENVELOPE_VERSION.into(),
        1001,
        0xAAA,
        0,
    ];

    start_cheat_caller_address(contract_address, privacy_pool());
    private_escrow.privacy_invoke(calldata.span());
}

#[test]
#[should_panic]
fn privacy_invoke_rejects_oversized_chunk_count() {
    let contract_address = deploy_private_escrow_helper();
    let private_escrow = dispatcher(contract_address);

    let oversized_count = MAX_PRIVATE_ESCROW_PAYLOAD_CHUNKS + 1;
    let calldata = array![
        VEIL_PRIVATE_ESCROW_ENVELOPE_VERSION.into(),
        1001,
        0xAAA,
        oversized_count.into(),
    ];

    start_cheat_caller_address(contract_address, privacy_pool());
    private_escrow.privacy_invoke(calldata.span());
}

#[test]
#[should_panic]
fn privacy_invoke_rejects_payload_size_mismatch() {
    let contract_address = deploy_private_escrow_helper();
    let private_escrow = dispatcher(contract_address);

    let chunks = array![0xAAA];
    let valid = make_calldata(1001, 0, chunks.span());
    let commitment = *valid.at(2);

    // Declares one chunk but submits two.
    let calldata = array![
        VEIL_PRIVATE_ESCROW_ENVELOPE_VERSION.into(),
        1001,
        commitment,
        1,
        0xAAA,
        0xBBB,
    ];

    start_cheat_caller_address(contract_address, privacy_pool());
    private_escrow.privacy_invoke(calldata.span());
}

#[test]
#[should_panic]
fn privacy_invoke_rejects_commitment_mismatch() {
    let contract_address = deploy_private_escrow_helper();
    let private_escrow = dispatcher(contract_address);

    let chunks = array![0xAAA, 0xBBB];
    let calldata = make_calldata(1001, 0xBAD, chunks.span());

    start_cheat_caller_address(contract_address, privacy_pool());
    private_escrow.privacy_invoke(calldata);
}

#[test]
#[should_panic]
fn privacy_invoke_rejects_duplicate_locator() {
    let contract_address = deploy_private_escrow_helper();
    let private_escrow = dispatcher(contract_address);

    let first_chunks = array![0xAAA];
    let first_calldata = make_calldata(1001, 0, first_chunks.span());

    start_cheat_caller_address(contract_address, privacy_pool());
    private_escrow.privacy_invoke(first_calldata);

    let second_chunks = array![0xBBB];
    let second_calldata = make_calldata(1001, 0, second_chunks.span());

    private_escrow.privacy_invoke(second_calldata);
}

#[test]
#[should_panic]
fn get_private_escrow_action_rejects_missing_locator() {
    let contract_address = deploy_private_escrow_helper();
    dispatcher(contract_address).get_private_escrow_action(0x404);
}

#[test]
#[should_panic]
fn get_private_escrow_payload_chunk_rejects_out_of_bounds_index() {
    let contract_address = deploy_private_escrow_helper();
    let private_escrow = dispatcher(contract_address);

    let chunks = array![0xAAA];
    let calldata = make_calldata(1001, 0, chunks.span());

    start_cheat_caller_address(contract_address, privacy_pool());
    private_escrow.privacy_invoke(calldata);

    private_escrow.get_private_escrow_payload_chunk(1001, 1);
}
