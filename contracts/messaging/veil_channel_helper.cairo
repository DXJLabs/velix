use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
use starknet::ContractAddress;

/// Maximum number of additional ciphertext chunks accepted
/// by a single timeline append operation.
///
/// This bound prevents unbounded calldata, storage growth,
/// and unexpectedly large execution costs.
pub const MAX_PAYLOAD_CHUNKS: u64 = 64;

/// Domain separator for Veil timeline payload commitments.
///
/// The commitment intentionally binds:
/// - protocol domain
/// - conversation tag
/// - encrypted event type
/// - encrypted payload envelope
/// - chunk count
/// - payload chunks
pub const TIMELINE_PAYLOAD_DOMAIN: felt252 = 'VEIL_TIMELINE_V1';

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct VeilTimelineEvent {
    /// Monotonic application event id within this opaque conversation tag.
    pub event_id: felt252,

    /// Opaque Veil application-level conversation tag.
    ///
    /// This must NOT be:
    /// - a wallet address
    /// - a recipient address
    /// - a plaintext conversation identifier
    /// - a Canonical Privacy Pool channel identifier
    pub conversation_tag: felt252,

    /// Encrypted event kind.
    ///
    /// Examples such as CHAT, OFFER, COUNTER_OFFER,
    /// ACCEPT, ESCROW, and SETTLEMENT must be encrypted
    /// by the Veil SDK.
    ///
    /// The contract intentionally does not interpret
    /// or expose plaintext application semantics.
    pub encrypted_event_type: felt252,

    /// First ciphertext felt or encrypted payload envelope.
    pub encrypted_payload: felt252,

    /// Domain-separated Poseidon commitment over:
    ///
    /// [
    ///   TIMELINE_PAYLOAD_DOMAIN,
    ///   conversation_tag,
    ///   encrypted_event_type,
    ///   encrypted_payload,
    ///   payload_chunk_count,
    ///   ...payload_chunks
    /// ]
    pub payload_hash: felt252,

    /// Number of additional ciphertext chunks.
    pub payload_chunk_count: u64,

    /// Block timestamp used for application ordering.
    ///
    /// Transaction timing is public on a public blockchain.
    pub created_at: u64,
}

#[starknet::interface]
pub trait IVeilChannelHelper<TContractState> {
    /// Canonical Privacy Pool entrypoint.
    ///
    /// Expected calldata:
    ///
    /// [
    ///   conversation_tag,
    ///   encrypted_event_type,
    ///   encrypted_payload,
    ///   payload_hash,
    ///   payload_chunk_count,
    ///   ...payload_chunks
    /// ]
    ///
    /// This entrypoint is intended to be called through:
    ///
    /// Canonical Privacy Pool
    ///   -> InvokeExternal
    ///   -> privacy_invoke(...)
    fn privacy_invoke(
        ref self: TContractState,
        calldata: Span<felt252>,
    ) -> Span<OpenNoteDeposit>;

    /// Direct/unshielded timeline append path.
    ///
    /// Uses the same calldata encoding as `privacy_invoke`.
    ///
    /// IMPORTANT:
    /// This entrypoint does not claim Privacy Pool provenance.
    /// Direct participant authorization must be enforced by the
    /// application flow and verified by the client/indexer.
    fn invoke(
        ref self: TContractState,
        calldata: Span<felt252>,
    ) -> Span<OpenNoteDeposit>;

    /// Return the configured Canonical Privacy Pool address.
    fn get_privacy_pool(
        self: @TContractState,
    ) -> ContractAddress;

    /// Return the number of timeline events stored
    /// for an opaque conversation tag.
    fn get_event_count(
        self: @TContractState,
        conversation_tag: felt252,
    ) -> u64;

    /// Return a specific timeline event.
    fn get_event(
        self: @TContractState,
        conversation_tag: felt252,
        index: u64,
    ) -> VeilTimelineEvent;

    /// Return a specific additional ciphertext chunk.
    fn get_payload_chunk(
        self: @TContractState,
        conversation_tag: felt252,
        event_index: u64,
        chunk_index: u64,
    ) -> felt252;
}

#[starknet::contract]
pub mod VeilChannelHelper {
    use starknet::{
        ContractAddress,
        get_block_timestamp,
        get_caller_address,
    };

    use starknet::storage::{
        Map,
        StorageMapReadAccess,
        StorageMapWriteAccess,
        StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };

    use super::{
        IVeilChannelHelper,
        MAX_PAYLOAD_CHUNKS,
        OpenNoteDeposit,
        TIMELINE_PAYLOAD_DOMAIN,
        VeilTimelineEvent,
    };

    #[path("timeline_payload_hash.cairo")]
    mod timeline_payload_hash;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    #[storage]
    struct Storage {
        /// Canonical Privacy Pool authorized to call
        /// the shielded `privacy_invoke` entrypoint.
        privacy_pool: ContractAddress,

        /// Timeline events indexed by:
        ///
        /// (opaque conversation tag, local event index)
        events: Map<(felt252, u64), VeilTimelineEvent>,

        /// Additional ciphertext chunks indexed by:
        ///
        /// (conversation tag, event index, chunk index)
        payload_chunks: Map<(felt252, u64, u64), felt252>,

        /// Number of events per opaque conversation tag.
        event_count: Map<felt252, u64>,
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        TimelineCommitmentStored: TimelineCommitmentStored,
    }

    /// Minimal public timeline commitment event.
    ///
    /// The contract intentionally does NOT emit:
    /// - plaintext application event type
    /// - payload chunks
    /// - sender address
    /// - recipient address
    /// - user-supplied execution mode
    ///
    /// Ciphertext remains available through contract storage.
    #[derive(Drop, starknet::Event)]
    struct TimelineCommitmentStored {
        #[key]
        conversation_tag: felt252,

        #[key]
        event_id: felt252,

        payload_hash: felt252,
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    #[constructor]
    fn constructor(
        ref self: ContractState,
        privacy_pool: ContractAddress,
    ) {
        let zero_address: ContractAddress =
            0.try_into().unwrap();

        assert(
            privacy_pool != zero_address,
            'Invalid privacy pool',
        );

        self.privacy_pool.write(
            privacy_pool,
        );
    }

    // -------------------------------------------------------------------------
    // Public implementation
    // -------------------------------------------------------------------------

    #[abi(embed_v0)]
    impl VeilChannelHelperImpl of IVeilChannelHelper<ContractState> {
        /// Shielded/private timeline append path.
        ///
        /// The caller must be the configured Canonical Privacy Pool.
        ///
        /// This prevents a wallet from directly calling
        /// `privacy_invoke` and pretending that an event originated
        /// through Privacy Pool InvokeExternal.
        fn privacy_invoke(
            ref self: ContractState,
            calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            let caller =
                get_caller_address();

            let expected_privacy_pool =
                self.privacy_pool.read();

            assert(
                caller == expected_privacy_pool,
                'Unauthorized privacy caller',
            );

            self.store_timeline_event(
                calldata,
            )
        }

        /// Direct/unshielded timeline append path.
        ///
        /// This entrypoint is intentionally distinct from
        /// `privacy_invoke`.
        ///
        /// Transaction provenance can therefore distinguish:
        ///
        /// - authenticated Privacy Pool path
        /// - direct application path
        ///
        /// without trusting a user-provided mode field.
        fn invoke(
            ref self: ContractState,
            calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            self.store_timeline_event(
                calldata,
            )
        }

        fn get_privacy_pool(
            self: @ContractState,
        ) -> ContractAddress {
            self.privacy_pool.read()
        }

        fn get_event_count(
            self: @ContractState,
            conversation_tag: felt252,
        ) -> u64 {
            self.event_count.read(
                conversation_tag,
            )
        }

        fn get_event(
            self: @ContractState,
            conversation_tag: felt252,
            index: u64,
        ) -> VeilTimelineEvent {
            let count =
                self.event_count.read(
                    conversation_tag,
                );

            assert(
                index < count,
                'Event not found',
            );

            self.events.read(
                (
                    conversation_tag,
                    index,
                ),
            )
        }

        fn get_payload_chunk(
            self: @ContractState,
            conversation_tag: felt252,
            event_index: u64,
            chunk_index: u64,
        ) -> felt252 {
            let count =
                self.event_count.read(
                    conversation_tag,
                );

            assert(
                event_index < count,
                'Event not found',
            );

            let timeline_event =
                self.events.read(
                    (
                        conversation_tag,
                        event_index,
                    ),
                );

            assert(
                chunk_index
                    < timeline_event.payload_chunk_count,
                'Chunk not found',
            );

            self.payload_chunks.read(
                (
                    conversation_tag,
                    event_index,
                    chunk_index,
                ),
            )
        }
    }

    // -------------------------------------------------------------------------
    // Internal implementation
    // -------------------------------------------------------------------------

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Validate, commit, and persist one encrypted
        /// Veil conversation timeline event.
        fn store_timeline_event(
            ref self: ContractState,
            calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            // Required calldata header:
            //
            // 0 conversation_tag
            // 1 encrypted_event_type
            // 2 encrypted_payload
            // 3 payload_hash
            // 4 payload_chunk_count
            assert(
                calldata.len() >= 5,
                'Invalid calldata',
            );

            let conversation_tag =
                *calldata.at(0);

            let encrypted_event_type =
                *calldata.at(1);

            let encrypted_payload =
                *calldata.at(2);

            let claimed_payload_hash =
                *calldata.at(3);

            let payload_chunk_count: u64 =
                (*calldata.at(4))
                    .try_into()
                    .expect('Invalid chunk count');

            // Prevent unbounded calldata and storage growth.
            assert(
                payload_chunk_count
                    <= MAX_PAYLOAD_CHUNKS,
                'Too many chunks',
            );

            let chunk_count_usize: usize =
                payload_chunk_count
                    .try_into()
                    .expect('Chunk count overflow');

            assert(
                calldata.len()
                    == 5 + chunk_count_usize,
                'Invalid payload size',
            );

            // Only the opaque conversation tag is required
            // to be non-zero.
            //
            // Encrypted felt values are intentionally NOT
            // rejected when zero because valid ciphertext
            // representations may contain zero-valued fields.
            assert(
                conversation_tag != 0,
                'Invalid conversation tag',
            );

            // Compute a domain-separated commitment.
            let computed_payload_hash =
                timeline_payload_hash::compute_payload_hash(
                    conversation_tag,
                    encrypted_event_type,
                    encrypted_payload,
                    payload_chunk_count,
                    calldata,
                );

            assert(
                computed_payload_hash
                    == claimed_payload_hash,
                'Payload hash mismatch',
            );

            let current_count =
                self.event_count.read(
                    conversation_tag,
                );

            let event_id: felt252 =
                current_count.into() + 1;

            let created_at =
                get_block_timestamp();

            let timeline_event =
                VeilTimelineEvent {
                    event_id,

                    conversation_tag,

                    encrypted_event_type,

                    encrypted_payload,

                    payload_hash:
                        computed_payload_hash,

                    payload_chunk_count,

                    created_at,
                };

            self.events.write(
                (
                    conversation_tag,
                    current_count,
                ),
                timeline_event,
            );

            self.store_payload_chunks(
                conversation_tag,
                current_count,
                payload_chunk_count,
                calldata,
            );

            self.event_count.write(
                conversation_tag,
                current_count + 1,
            );

            // Emit only the minimum timeline commitment
            // required by an indexer.
            //
            // Payload chunks are not duplicated
            // into public event logs.
            self.emit(
                Event::TimelineCommitmentStored(
                    TimelineCommitmentStored {
                        conversation_tag,

                        event_id,

                        payload_hash:
                            computed_payload_hash,
                    },
                ),
            );

            // Messaging does not create an OpenNoteDeposit.
            //
            // The exact canonical ABI type is imported from:
            //
            // privacy::objects::OpenNoteDeposit
            ArrayTrait::<OpenNoteDeposit>::new()
                .span()
        }

        /// Persist additional ciphertext payload chunks.
        fn store_payload_chunks(
            ref self: ContractState,
            conversation_tag: felt252,
            event_index: u64,
            payload_chunk_count: u64,
            calldata: Span<felt252>,
        ) {
            let mut chunk_index: u64 = 0;

            loop {
                if chunk_index
                    == payload_chunk_count
                {
                    break;
                }

                let chunk_offset: usize =
                    chunk_index
                        .try_into()
                        .expect('Chunk index overflow');

                let calldata_index =
                    5 + chunk_offset;

                let chunk =
                    *calldata.at(
                        calldata_index,
                    );

                // Ciphertext chunks are opaque.
                //
                // Zero is intentionally accepted because
                // valid encrypted representations may contain
                // zero-valued felt fields.
                self.payload_chunks.write(
                    (
                        conversation_tag,
                        event_index,
                        chunk_index,
                    ),
                    chunk,
                );

                chunk_index += 1;
            };
        }
    }
}
