use snforge_std::{ContractClassTrait, DeclareResultTrait, declare};
use starknet::ContractAddress;
use veilc::messaging::veil_channel_helper::{
    EVENT_CHAT, EVENT_OFFER, EVENT_PAYMENT_MEMO, IVeilChannelHelperDispatcher,
    IVeilChannelHelperDispatcherTrait, IVeilChannelHelperSafeDispatcher,
    IVeilChannelHelperSafeDispatcherTrait, VeilTimelineEvent,
};

fn deploy_contract() -> ContractAddress {
    let contract = declare("VeilChannelHelper").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@ArrayTrait::new()).unwrap();
    contract_address
}

fn make_calldata(
    channel_id: felt252, event_type: felt252, encrypted_payload: felt252, payload_hash: felt252,
) -> Array<felt252> {
    let mut calldata = ArrayTrait::<felt252>::new();
    calldata.append(channel_id);
    calldata.append(event_type);
    calldata.append(encrypted_payload);
    calldata.append(payload_hash);
    calldata
}

fn make_chunked_calldata(
    channel_id: felt252,
    event_type: felt252,
    encrypted_payload: felt252,
    payload_hash: felt252,
    first_chunk: felt252,
    second_chunk: felt252,
) -> Array<felt252> {
    let mut calldata = make_calldata(channel_id, event_type, encrypted_payload, payload_hash);
    calldata.append(2);
    calldata.append(first_chunk);
    calldata.append(second_chunk);
    calldata
}

fn store_event(
    dispatcher: IVeilChannelHelperDispatcher,
    channel_id: felt252,
    event_type: felt252,
    encrypted_payload: felt252,
    payload_hash: felt252,
) {
    let calldata = make_calldata(channel_id, event_type, encrypted_payload, payload_hash);
    let deposits = dispatcher.invoke(calldata.span());
    assert(deposits.len() == 0, 'Expected empty deposits');
}

fn store_event_privacy(
    dispatcher: IVeilChannelHelperDispatcher,
    channel_id: felt252,
    event_type: felt252,
    encrypted_payload: felt252,
    payload_hash: felt252,
) {
    let calldata = make_calldata(channel_id, event_type, encrypted_payload, payload_hash);
    let deposits = dispatcher.privacy_invoke(calldata.span());
    assert(deposits.len() == 0, 'Expected empty deposits');
}

fn assert_event_eq(
    event: VeilTimelineEvent,
    event_id: felt252,
    channel_id: felt252,
    event_type: felt252,
    encrypted_payload: felt252,
    payload_hash: felt252,
) {
    assert(event.event_id == event_id, 'Invalid event id');
    assert(event.channel_id == channel_id, 'Invalid channel id');
    assert(event.event_type == event_type, 'Invalid event type');
    assert(event.encrypted_payload == encrypted_payload, 'Invalid payload');
    assert(event.payload_hash == payload_hash, 'Invalid hash');
}

#[test]
fn store_chat_event() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    store_event(dispatcher, 1001, EVENT_CHAT, 111, 222);

    assert(dispatcher.get_event_count(1001) == 1, 'Invalid count');
    let event = dispatcher.get_event(1001, 0);
    assert_event_eq(event, 1, 1001, EVENT_CHAT, 111, 222);
}

#[test]
fn store_chat_event_via_privacy_invoke() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    store_event_privacy(dispatcher, 1010, EVENT_CHAT, 112, 223);

    assert(dispatcher.get_event_count(1010) == 1, 'Invalid count');
    let event = dispatcher.get_event(1010, 0);
    assert_event_eq(event, 1, 1010, EVENT_CHAT, 112, 223);
}

#[test]
fn store_chat_event_with_onchain_payload_chunks() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };
    let calldata = make_chunked_calldata(1111, EVENT_CHAT, 700, 800, 900, 901);

    let deposits = dispatcher.privacy_invoke(calldata.span());
    assert(deposits.len() == 0, 'Expected empty deposits');

    let event = dispatcher.get_event(1111, 0);
    assert_event_eq(event, 1, 1111, EVENT_CHAT, 700, 800);
    assert(event.payload_chunk_count == 2, 'Invalid chunk count');
    assert(dispatcher.get_payload_chunk(1111, 0, 0) == 900, 'Invalid chunk 0');
    assert(dispatcher.get_payload_chunk(1111, 0, 1) == 901, 'Invalid chunk 1');
}

#[test]
fn store_payment_memo_event() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    store_event(dispatcher, 2002, EVENT_PAYMENT_MEMO, 333, 444);

    let event = dispatcher.get_event(2002, 0);
    assert_event_eq(event, 1, 2002, EVENT_PAYMENT_MEMO, 333, 444);
}

#[test]
fn store_offer_event() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    store_event(dispatcher, 3003, EVENT_OFFER, 555, 666);

    let event = dispatcher.get_event(3003, 0);
    assert_event_eq(event, 1, 3003, EVENT_OFFER, 555, 666);
}

#[test]
#[feature("safe_dispatcher")]
fn reject_invalid_event_type() {
    let contract_address = deploy_contract();
    let safe_dispatcher = IVeilChannelHelperSafeDispatcher { contract_address };
    let calldata = make_calldata(4004, 99, 777, 888);

    match safe_dispatcher.invoke(calldata.span()) {
        Result::Ok(_) => core::panic_with_felt252('Should have panicked'),
        Result::Err(panic_data) => {
            assert(*panic_data.at(0) == 'Invalid event type', *panic_data.at(0));
        },
    };
}

#[test]
#[feature("safe_dispatcher")]
fn reject_zero_channel_id() {
    let contract_address = deploy_contract();
    let safe_dispatcher = IVeilChannelHelperSafeDispatcher { contract_address };
    let calldata = make_calldata(0, EVENT_CHAT, 999, 1000);

    match safe_dispatcher.invoke(calldata.span()) {
        Result::Ok(_) => core::panic_with_felt252('Should have panicked'),
        Result::Err(panic_data) => {
            assert(*panic_data.at(0) == 'Invalid channel', *panic_data.at(0));
        },
    };
}

#[test]
fn event_count_increments_correctly() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    store_event(dispatcher, 5005, EVENT_CHAT, 1, 10);
    store_event(dispatcher, 5005, EVENT_PAYMENT_MEMO, 2, 20);
    store_event(dispatcher, 5005, EVENT_OFFER, 3, 30);

    assert(dispatcher.get_event_count(5005) == 3, 'Invalid count');
}

#[test]
fn get_event_returns_correct_stored_event() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    store_event(dispatcher, 6006, EVENT_PAYMENT_MEMO, 12345, 67890);

    let event = dispatcher.get_event(6006, 0);
    assert_event_eq(event, 1, 6006, EVENT_PAYMENT_MEMO, 12345, 67890);
}

#[test]
fn multiple_events_in_same_channel_preserve_order() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    store_event(dispatcher, 7007, EVENT_CHAT, 101, 201);
    store_event(dispatcher, 7007, EVENT_OFFER, 102, 202);
    store_event(dispatcher, 7007, EVENT_PAYMENT_MEMO, 103, 203);

    assert_event_eq(dispatcher.get_event(7007, 0), 1, 7007, EVENT_CHAT, 101, 201);
    assert_event_eq(dispatcher.get_event(7007, 1), 2, 7007, EVENT_OFFER, 102, 202);
    assert_event_eq(dispatcher.get_event(7007, 2), 3, 7007, EVENT_PAYMENT_MEMO, 103, 203);
}

#[test]
fn multiple_channels_are_isolated() {
    let contract_address = deploy_contract();
    let dispatcher = IVeilChannelHelperDispatcher { contract_address };

    store_event(dispatcher, 8008, EVENT_CHAT, 11, 21);
    store_event(dispatcher, 9009, EVENT_OFFER, 12, 22);
    store_event(dispatcher, 8008, EVENT_PAYMENT_MEMO, 13, 23);

    assert(dispatcher.get_event_count(8008) == 2, 'Invalid count');
    assert(dispatcher.get_event_count(9009) == 1, 'Invalid count');
    assert_event_eq(dispatcher.get_event(8008, 0), 1, 8008, EVENT_CHAT, 11, 21);
    assert_event_eq(dispatcher.get_event(8008, 1), 2, 8008, EVENT_PAYMENT_MEMO, 13, 23);
    assert_event_eq(dispatcher.get_event(9009, 0), 1, 9009, EVENT_OFFER, 12, 22);
}
