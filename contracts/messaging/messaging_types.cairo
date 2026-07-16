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

/// Persisted encrypted VEIL conversation event.
///
/// The helper intentionally stores only opaque ciphertext fields and a
/// commitment. Sender, recipient, and plaintext event kind remain outside the
/// contract state so the helper does not become an application metadata oracle.
#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct VeilTimelineEvent {
    /// Monotonic event id within the opaque conversation tag.
    pub event_id: felt252,

    /// Opaque application-level conversation identifier.
    ///
    /// This value must be produced by the SDK/application layer. It must not be
    /// a raw wallet address, recipient address, plaintext deal id, or assumed
    /// canonical Privacy Pool channel id.
    pub conversation_tag: felt252,

    /// Encrypted application event kind.
    ///
    /// The contract never interprets the plaintext type, which keeps chat,
    /// offer, escrow, and settlement semantics in the VEIL application layer.
    pub encrypted_event_type: felt252,

    /// First ciphertext field or compact encrypted envelope value.
    ///
    /// Zero is a valid ciphertext representation; validation belongs to the
    /// commitment and chunk-count checks, not to plaintext assumptions.
    pub encrypted_payload: felt252,

    /// Domain-separated Poseidon commitment over the encrypted envelope.
    pub payload_hash: felt252,

    /// Number of additional ciphertext payload chunks stored separately.
    pub payload_chunk_count: u64,

    /// Public block timestamp. This is intentionally public chain metadata.
    pub created_at: u64,
}
