use core::poseidon::poseidon_hash_span;

pub fn hash_domain_separated(domain: felt252, values: Span<felt252>) -> felt252 {
    let mut data = array![domain];
    let mut i: usize = 0;
    while i < values.len() {
        data.append(*values.at(i));
        i += 1;
    };
    poseidon_hash_span(data.span())
}
