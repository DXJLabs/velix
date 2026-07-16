#[starknet::contract]
pub mod VeilChannelHelper {
    use starknet::storage::{
        Map,
        StorageMapReadAccess,
        StorageMapWriteAccess,
        StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
    use crate::messaging::messaging_events::MessageCommitted;
    use crate::messaging::messaging_interfaces::IVeilChannelHelper;
    use crate::messaging::messaging_types::VeilMessageRecord;
    use crate::messaging::messaging_validation;
    use crate::utils::constants::MESSAGE_ENVELOPE_HEADER_FELTS;
    use crate::utils::errors;

    #[path("../../contracts/messaging/timeline_payload_hash.cairo")]
    mod timeline_payload_hash;

    #[storage]
    struct Storage {
        /// Only this Privacy Pool may invoke the encrypted messaging path.
        privacy_pool: ContractAddress,

        /// Public structural record indexed by a one-time message locator.
        messages: Map<felt252, VeilMessageRecord>,

        /// Ciphertext storage indexed by `(message_locator, chunk_index)`.
        payload_chunks: Map<(felt252, u64), felt252>,

        /// Explicit existence marker.
        ///
        /// Cairo maps return default values for keys that were never written,
        /// so this map distinguishes an absent record from an all-zero value.
        stored_message_locators: Map<felt252, bool>,

        /// Global encrypted-envelope commitment reuse guard.
        committed_payloads: Map<felt252, bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        MessageCommitted: MessageCommitted,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        privacy_pool: ContractAddress,
    ) {
        let zero_address: ContractAddress = 0.try_into().unwrap();

        assert(
            privacy_pool != zero_address,
            errors::ZERO_ADDRESS,
        );

        self.privacy_pool.write(privacy_pool);
    }

    // -------------------------------------------------------------------------
    // Public implementation
    // -------------------------------------------------------------------------

    #[abi(embed_v0)]
    impl VeilChannelHelperImpl of IVeilChannelHelper<ContractState> {
        /// Store one encrypted VEIL message through Privacy Pool
        /// `InvokeExternal`.
        ///
        /// SECURITY:
        /// - only the Privacy Pool fixed during deployment may call this path;
        /// - wallets and arbitrary contracts cannot write messages directly;
        /// - the helper validates structure and ciphertext commitment only;
        /// - sender, recipient, message type, and plaintext are never accepted.
        ///
        /// The zero-value encrypted note used by the messaging action is built
        /// by the Privacy SDK in the same proved action batch. This helper does
        /// not receive or independently verify that note.
        fn privacy_invoke(
            ref self: ContractState,
            calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            let caller = get_caller_address();
            let expected_privacy_pool = self.privacy_pool.read();

            assert(
                caller == expected_privacy_pool,
                errors::UNAUTHORIZED_PRIVACY_POOL,
            );

            self.store_message(calldata)
        }

        fn get_privacy_pool(
            self: @ContractState,
        ) -> ContractAddress {
            self.privacy_pool.read()
        }

        fn message_exists(
            self: @ContractState,
            message_locator: felt252,
        ) -> bool {
            self.stored_message_locators.read(message_locator)
        }

        fn get_message(
            self: @ContractState,
            message_locator: felt252,
        ) -> VeilMessageRecord {
            let exists = self
                .stored_message_locators
                .read(message_locator);

            messaging_validation::assert_message_exists(exists);

            self.messages.read(message_locator)
        }

        fn get_payload_chunk(
            self: @ContractState,
            message_locator: felt252,
            chunk_index: u64,
        ) -> felt252 {
            let exists = self
                .stored_message_locators
                .read(message_locator);

            messaging_validation::assert_message_exists(exists);

            let message = self.messages.read(message_locator);

            messaging_validation::assert_valid_chunk_index(
                chunk_index,
                message.payload_chunk_count,
            );

            self
                .payload_chunks
                .read((message_locator, chunk_index))
        }

        fn is_payload_committed(
            self: @ContractState,
            payload_commitment: felt252,
        ) -> bool {
            self.committed_payloads.read(payload_commitment)
        }
    }

    // -------------------------------------------------------------------------
    // Internal implementation
    // -------------------------------------------------------------------------

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Validate and persist one independently addressable encrypted message.
        ///
        /// Calldata:
        ///
        /// 0. envelope_version
        /// 1. message_locator
        /// 2. claimed_payload_commitment
        /// 3. payload_chunk_count
        /// 4... ciphertext_chunks
        fn store_message(
            ref self: ContractState,
            calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            assert(
                calldata.len() >= MESSAGE_ENVELOPE_HEADER_FELTS,
                errors::INVALID_MESSAGE_CALLDATA,
            );

            let envelope_version: u8 = (*calldata.at(0))
                .try_into()
                .expect(errors::INVALID_ENVELOPE_VERSION);

            let message_locator = *calldata.at(1);
            let claimed_payload_commitment = *calldata.at(2);

            let payload_chunk_count: u64 = (*calldata.at(3))
                .try_into()
                .expect(errors::INVALID_CHUNK_COUNT);

            messaging_validation::assert_valid_message_header(
                envelope_version,
                message_locator,
                claimed_payload_commitment,
                payload_chunk_count,
            );

            let chunk_count_usize: usize = payload_chunk_count
                .try_into()
                .expect('Chunk count overflow');

            let expected_calldata_length =
                MESSAGE_ENVELOPE_HEADER_FELTS + chunk_count_usize;

            assert(
                calldata.len() == expected_calldata_length,
                errors::INVALID_PAYLOAD_SIZE,
            );

            let computed_payload_commitment =
                timeline_payload_hash::compute_message_commitment(
                    envelope_version,
                    message_locator,
                    payload_chunk_count,
                    calldata,
                );

            assert(
                computed_payload_commitment == claimed_payload_commitment,
                errors::PAYLOAD_COMMITMENT_MISMATCH,
            );

            let locator_exists = self
                .stored_message_locators
                .read(message_locator);

            messaging_validation::assert_message_not_stored(
                locator_exists,
            );

            let commitment_exists = self
                .committed_payloads
                .read(computed_payload_commitment);

            messaging_validation::assert_payload_not_committed(
                commitment_exists,
            );

            let message = VeilMessageRecord {
                envelope_version,
                message_locator,
                payload_commitment: computed_payload_commitment,
                payload_chunk_count,
            };

            self.messages.write(message_locator, message);

            self.store_payload_chunks(
                message_locator,
                payload_chunk_count,
                calldata,
            );

            self
                .stored_message_locators
                .write(message_locator, true);

            self
                .committed_payloads
                .write(computed_payload_commitment, true);

            self.emit(
                Event::MessageCommitted(
                    MessageCommitted {
                        message_locator,
                        payload_commitment: computed_payload_commitment,
                    },
                ),
            );

            // Messaging does not request an ERC-20 deposit into an open note.
            ArrayTrait::<OpenNoteDeposit>::new().span()
        }

        /// Persist opaque ciphertext chunks.
        ///
        /// Zero-valued felts are accepted because valid encrypted
        /// representations may contain zero.
        fn store_payload_chunks(
            ref self: ContractState,
            message_locator: felt252,
            payload_chunk_count: u64,
            calldata: Span<felt252>,
        ) {
            let mut chunk_index: u64 = 0;

            loop {
                if chunk_index == payload_chunk_count {
                    break;
                }

                let chunk_offset: usize = chunk_index
                    .try_into()
                    .expect('Chunk index overflow');

                let calldata_index =
                    MESSAGE_ENVELOPE_HEADER_FELTS + chunk_offset;

                let chunk = *calldata.at(calldata_index);

                self
                    .payload_chunks
                    .write(
                        (message_locator, chunk_index),
                        chunk,
                    );

                chunk_index += 1;
            };
        }
    }
}
