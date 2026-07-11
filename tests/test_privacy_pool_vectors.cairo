use core::ec::{EcPoint, EcPointTrait};
use core::ec::stark_curve::{GEN_X, GEN_Y};
use core::poseidon::poseidon_hash_span;

const CHANNEL_KEY_TAG: felt252 = 'CHANNEL_KEY_TAG:V1';
const CHANNEL_MARKER_TAG: felt252 = 'CHANNEL_MARKER_TAG:V1';
const ENC_CHANNEL_KEY_TAG: felt252 = 'ENC_CHANNEL_KEY_TAG:V1';
const ENC_SENDER_ADDR_TAG: felt252 = 'ENC_SENDER_ADDR_TAG:V1';

fn gen_p() -> EcPoint {
    EcPointTrait::new(x: GEN_X, y: GEN_Y).unwrap()
}

fn derive_public_key(private_key: felt252) -> felt252 {
    let point = gen_p().mul(scalar: private_key);
    point.try_into().unwrap().x()
}

fn compute_shared_x(ephemeral_secret: felt252, public_key: felt252) -> (felt252, felt252) {
    let ephemeral_pub_point = gen_p().mul(scalar: ephemeral_secret);
    let ephemeral_pub_x = ephemeral_pub_point.try_into().unwrap().x();
    let public_point = EcPointTrait::new_from_x(x: public_key).unwrap();
    let shared_point = public_point.mul(scalar: ephemeral_secret);
    let shared_x = shared_point.try_into().unwrap().x();
    (ephemeral_pub_x, shared_x)
}

fn hash_channel_key(
    sender_addr: felt252,
    sender_private_key: felt252,
    recipient_addr: felt252,
    recipient_public_key: felt252,
) -> felt252 {
    poseidon_hash_span(
        array![
            CHANNEL_KEY_TAG,
            sender_addr,
            sender_private_key,
            recipient_addr,
            recipient_public_key,
        ]
            .span(),
    )
}

fn hash_channel_marker(
    channel_key: felt252,
    sender_addr: felt252,
    recipient_addr: felt252,
    recipient_public_key: felt252,
) -> felt252 {
    poseidon_hash_span(
        array![CHANNEL_MARKER_TAG, channel_key, sender_addr, recipient_addr, recipient_public_key].span(),
    )
}

fn hash_enc_channel_key(shared_x: felt252) -> felt252 {
    poseidon_hash_span(array![ENC_CHANNEL_KEY_TAG, shared_x].span())
}

fn hash_enc_sender_addr(shared_x: felt252) -> felt252 {
    poseidon_hash_span(array![ENC_SENDER_ADDR_TAG, shared_x].span())
}

#[test]
fn privacy_pool_stark_ecdh_vectors_match_reference_semantics() {
    let v1_sender_private = 123456789;
    let v1_recipient_private = 987654321;
    let v1_ephemeral_secret = 55555555;
    let v1_sender_addr = 0xabcde;
    let v1_recipient_addr = 0x12345;

    let v1_sender_public = derive_public_key(v1_sender_private);
    let v1_recipient_public = derive_public_key(v1_recipient_private);
    let (v1_ephemeral_public, v1_shared_x) =
        compute_shared_x(v1_ephemeral_secret, v1_recipient_public);
    let (_, v1_receiver_shared_x) = compute_shared_x(v1_recipient_private, v1_ephemeral_public);
    let v1_channel_key =
        hash_channel_key(v1_sender_addr, v1_sender_private, v1_recipient_addr, v1_recipient_public);
    let v1_enc_channel_key = hash_enc_channel_key(v1_shared_x) + v1_channel_key;
    let v1_enc_sender_addr = hash_enc_sender_addr(v1_shared_x) + v1_sender_addr;
    let v1_channel_marker =
        hash_channel_marker(v1_channel_key, v1_sender_addr, v1_recipient_addr, v1_recipient_public);

    assert(
        v1_sender_public
            == 0x32bb13ccdf02b6ea40c6d8003af53b8e84ed303be7dfe3c1775e7e7e9e26b98,
        'bad v1 sender pub',
    );
    assert(
        v1_recipient_public
            == 0x678217b3355ab841237a21ed3e7365e35ac96fcd9f1d51f348ee944ba8f0ca2,
        'bad v1 rec pub',
    );
    assert(
        v1_ephemeral_public
            == 0x3e99b5198d3511674caabb304bb64fc13888b39008de1c569a191134534ddf8,
        'bad v1 eph pub',
    );
    assert(
        v1_shared_x == 0x722aecd66546eb9d18148cef0299b5f494de882619c0aff0fbacd3bb01b3e8d,
        'bad v1 shared',
    );
    assert(v1_receiver_shared_x == v1_shared_x, 'bad v1 receiver');
    assert(
        v1_channel_key == 0x65abca2cc469c6ad5c4e41a3c708aa7018cd8aee2e5c507e00be5f87512568,
        'bad v1 channel',
    );
    assert(
        v1_enc_channel_key
            == 0x54c2c13f1f1f6511350cd01cc9fbd72f0721cfea527768b345a289be19fb66a,
        'bad v1 enc key',
    );
    assert(
        v1_enc_sender_addr
            == 0x117c786c8f079f67d2e62661204c3c3bc4a44bc88a7a75666f3d1fcb47e4923,
        'bad v1 enc sender',
    );
    assert(
        v1_channel_marker
            == 0xa259eb110f26200d185cbccf3c174485f6dbaf05f4c226bc7df53d2b3a0984,
        'bad v1 marker',
    );

    let v2_sender_private = 0x111111111111;
    let v2_recipient_private = 0x222222222222;
    let v2_ephemeral_secret = 0x333333333333;
    let v2_sender_addr = 0x44444;
    let v2_recipient_addr = 0x55555;
    let v2_recipient_public = derive_public_key(v2_recipient_private);
    let (v2_ephemeral_public, v2_shared_x) =
        compute_shared_x(v2_ephemeral_secret, v2_recipient_public);
    let v2_channel_key =
        hash_channel_key(v2_sender_addr, v2_sender_private, v2_recipient_addr, v2_recipient_public);

    assert(
        derive_public_key(v2_sender_private)
            == 0x51cc9901f6d165a3c7a143cf2b968365c660bc322247465c3c3c153da88320d,
        'bad v2 sender pub',
    );
    assert(
        v2_recipient_public
            == 0x60e4396872bdd836862c07baa6a69e0f013267f6b3514fe885bb339624f71e1,
        'bad v2 rec pub',
    );
    assert(
        v2_ephemeral_public
            == 0x7060fb05ae0430942829deadca6ca7f8c92e97990fba0fb7e249034b23383ae,
        'bad v2 eph pub',
    );
    assert(v2_shared_x == 0x65aacc6a8672a4fc1a8c665ec17e0f89265904fa6662b525aed5617d2210ea0, 'bad v2 shared');
    assert(
        hash_channel_marker(v2_channel_key, v2_sender_addr, v2_recipient_addr, v2_recipient_public)
            == 0x48bb236447676308e20e7eacdae05007f6debf1f4e68088d5531958dddd2de3,
        'bad v2 marker',
    );

    let v3_sender_private = 42;
    let v3_recipient_private = 31415926535897932384626433832795;
    let v3_ephemeral_secret = 27182818284590452353602874713526;
    let v3_recipient_public = derive_public_key(v3_recipient_private);
    let (v3_ephemeral_public, v3_shared_x) =
        compute_shared_x(v3_ephemeral_secret, v3_recipient_public);

    assert(
        derive_public_key(v3_sender_private)
            == 0x4219d1d981f872e3eabff54aca21110546964ec2699d4229ca0ecba76c70bb,
        'bad v3 sender pub',
    );
    assert(
        v3_recipient_public
            == 0x11b5e452158b01a8896b2092671eac71ad3957cef80dcecc26799079bc7ace4,
        'bad v3 rec pub',
    );
    assert(
        v3_ephemeral_public
            == 0x657339408b0d4c7f8c7f57fb049e48e0f8aac8c033450aaa92c4c9b73400a15,
        'bad v3 eph pub',
    );
    assert(v3_shared_x == 0x799ef5a5e266f01f403c1e616a4fbfffaa88bef2a93583a32661c6ed89206ea, 'bad v3 shared');
}
