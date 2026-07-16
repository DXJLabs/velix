#[starknet::contract]
pub mod VeilChannelHelper {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
    use crate::messaging::messaging_events::TimelineCommitmentStored;
    use crate::messaging::messaging_interfaces::IVeilChannelHelper;
    use crate::messaging::messaging_types::VeilTimelineEvent;
    use crate::messaging::messaging_validation;
    use crate::utils::errors;

    #[path("../../contracts/messaging/timeline_payload_hash.cairo")]
    mod timeline_payload_hash;

    #[storage]
    struct Storage {
        privacy_pool: ContractAddress,
        events: Map<(felt252, u64), VeilTimelineEvent>,
        payload_chunks: Map<(felt252, u64, u64), felt252>,
        event_count: Map<felt252, u64>,
        /// Contract-derived provenance; never accepted from calldata.
        privacy_pool_origin: Map<(felt252, u64), bool>,
        /// Exact replay guard scoped to the opaque conversation tag.
        committed_payloads: Map<(felt252, felt252), bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        TimelineCommitmentStored: TimelineCommitmentStored,
    }

    #[constructor]
    fn constructor(ref self: ContractState, privacy_pool: ContractAddress) {
        let zero_address: ContractAddress = 0.try_into().unwrap();

        assert(privacy_pool != zero_address, errors::ZERO_ADDRESS);

        self.privacy_pool.write(privacy_pool);
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
            ref self: ContractState, calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            let caller = get_caller_address();

            let expected_privacy_pool = self.privacy_pool.read();

            assert(caller == expected_privacy_pool, errors::UNAUTHORIZED_PRIVACY_POOL);

            self.store_timeline_event(calldata, true)
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
        fn invoke(ref self: ContractState, calldata: Span<felt252>) -> Span<OpenNoteDeposit> {
            self.store_timeline_event(calldata, false)
        }

        fn get_privacy_pool(self: @ContractState) -> ContractAddress {
            self.privacy_pool.read()
        }

        fn get_event_count(self: @ContractState, conversation_tag: felt252) -> u64 {
            self.event_count.read(conversation_tag)
        }

        fn get_event(
            self: @ContractState, conversation_tag: felt252, index: u64,
        ) -> VeilTimelineEvent {
            let count = self.event_count.read(conversation_tag);

            messaging_validation::assert_valid_event_index(index, count);

            self.events.read((conversation_tag, index))
        }

        fn get_payload_chunk(
            self: @ContractState, conversation_tag: felt252, event_index: u64, chunk_index: u64,
        ) -> felt252 {
            let count = self.event_count.read(conversation_tag);

            messaging_validation::assert_valid_event_index(event_index, count);

            let timeline_event = self.events.read((conversation_tag, event_index));

            messaging_validation::assert_valid_chunk_index(
                chunk_index, timeline_event.payload_chunk_count,
            );

            self.payload_chunks.read((conversation_tag, event_index, chunk_index))
        }

        fn is_privacy_pool_event(
            self: @ContractState, conversation_tag: felt252, event_index: u64,
        ) -> bool {
            let count = self.event_count.read(conversation_tag);
            messaging_validation::assert_valid_event_index(event_index, count);
            self.privacy_pool_origin.read((conversation_tag, event_index))
        }

        fn is_payload_committed(
            self: @ContractState, conversation_tag: felt252, payload_hash: felt252,
        ) -> bool {
            self.committed_payloads.read((conversation_tag, payload_hash))
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
            ref self: ContractState, calldata: Span<felt252>, via_privacy_pool: bool,
        ) -> Span<OpenNoteDeposit> {
            // Required calldata header:
            //
            // 0 conversation_tag
            // 1 encrypted_event_type
            // 2 encrypted_payload
            // 3 payload_hash
            // 4 payload_chunk_count
            assert(calldata.len() >= 5, errors::INVALID_TIMELINE_CALLDATA);

            let conversation_tag = *calldata.at(0);

            let encrypted_event_type = *calldata.at(1);

            let encrypted_payload = *calldata.at(2);

            let claimed_payload_hash = *calldata.at(3);

            let payload_chunk_count: u64 = (*calldata.at(4))
                .try_into()
                .expect(errors::INVALID_CHUNK_COUNT);

            messaging_validation::assert_valid_timeline_header(
                conversation_tag, claimed_payload_hash, payload_chunk_count,
            );

            let chunk_count_usize: usize = payload_chunk_count
                .try_into()
                .expect('Chunk count overflow');

            assert(calldata.len() == 5 + chunk_count_usize, errors::INVALID_PAYLOAD_SIZE);

            // Compute a domain-separated commitment.
            let computed_payload_hash = timeline_payload_hash::compute_payload_hash(
                conversation_tag,
                encrypted_event_type,
                encrypted_payload,
                payload_chunk_count,
                calldata,
            );

            assert(computed_payload_hash == claimed_payload_hash, errors::PAYLOAD_HASH_MISMATCH);

            let is_committed = self
                .committed_payloads
                .read((conversation_tag, computed_payload_hash));

            messaging_validation::assert_payload_not_committed(is_committed);

            let current_count = self.event_count.read(conversation_tag);

            let event_id: felt252 = current_count.into() + 1;

            let created_at = get_block_timestamp();

            let timeline_event = VeilTimelineEvent {
                event_id,
                conversation_tag,
                encrypted_event_type,
                encrypted_payload,
                payload_hash: computed_payload_hash,
                payload_chunk_count,
                created_at,
            };

            self.events.write((conversation_tag, current_count), timeline_event);

            self.privacy_pool_origin.write((conversation_tag, current_count), via_privacy_pool);

            self
                .store_payload_chunks(
                    conversation_tag, current_count, payload_chunk_count, calldata,
                );

            self.committed_payloads.write((conversation_tag, computed_payload_hash), true);

            self.event_count.write(conversation_tag, current_count + 1);

            // Emit only the minimum timeline commitment
            // required by an indexer.
            //
            // Payload chunks are not duplicated
            // into public event logs.
            self
                .emit(
                    Event::TimelineCommitmentStored(
                        TimelineCommitmentStored {
                            conversation_tag, event_id, payload_hash: computed_payload_hash,
                        },
                    ),
                );

            // Messaging does not create an OpenNoteDeposit.
            //
            // The exact canonical ABI type is imported from:
            //
            // privacy::objects::OpenNoteDeposit
            ArrayTrait::<OpenNoteDeposit>::new().span()
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
                if chunk_index == payload_chunk_count {
                    break;
                }

                let chunk_offset: usize = chunk_index.try_into().expect('Chunk index overflow');

                let calldata_index = 5 + chunk_offset;

                let chunk = *calldata.at(calldata_index);

                // Ciphertext chunks are opaque.
                //
                // Zero is intentionally accepted because
                // valid encrypted representations may contain
                // zero-valued felt fields.
                self.payload_chunks.write((conversation_tag, event_index, chunk_index), chunk);

                chunk_index += 1;
            };
        }
    }
}
