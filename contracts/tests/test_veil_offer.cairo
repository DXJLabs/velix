use veilc::offers::offer_commitments::compute_offer_commitment;

#[test]
fn offer_commitment_is_deterministic() {
    let a = compute_offer_commitment(11, 22, 33, 44, 55, 66, 77, 0);
    let b = compute_offer_commitment(11, 22, 33, 44, 55, 66, 77, 0);
    assert(a == b, 'commitment mismatch');
}

#[test]
fn offer_commitment_binds_conversation() {
    let a = compute_offer_commitment(11, 22, 33, 44, 55, 66, 77, 0);
    let b = compute_offer_commitment(12, 22, 33, 44, 55, 66, 77, 0);
    assert(a != b, 'conversation not bound');
}
