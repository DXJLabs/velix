/// Application-level encrypted envelope categories.
///
/// These values are not stored in plaintext by `VeilChannelHelper`; SDKs may
/// use them before encryption to produce interoperable payloads.
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub enum VeilEnvelopeKind {
    #[default]
    Chat,
    PaymentMemo,
    Offer,
    CounterOffer,
    OfferAccepted,
    OfferRejected,
    EscrowProposal,
    EscrowFunding,
    EscrowSettlement,
    ProofAttachment,
}

#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct EncryptedEnvelopeHeader {
    pub conversation_tag: felt252,
    pub encrypted_event_type: felt252,
    pub encrypted_payload: felt252,
    pub payload_hash: felt252,
    pub payload_chunk_count: u64,
}
