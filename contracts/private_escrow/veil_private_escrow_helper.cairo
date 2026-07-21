#[starknet::contract]
pub mod VeilPrivateEscrowHelper {
    use starknet::storage::{
        Map,
        StorageMapReadAccess,
        StorageMapWriteAccess,
        StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    use crate::interfaces::privacy_pool_types::OpenNoteDeposit;

    use crate::private_escrow::private_escrow_commitments::compute_private_escrow_action_commitment;
    use crate::private_escrow::private_escrow_events::PrivateEscrowActionCommitted;
    use crate::private_escrow::private_escrow_interfaces::IVeilPrivateEscrowHelper;
    use crate::private_escrow::private_escrow_types::EncryptedPrivateEscrowActionRecord;
    use crate::private_escrow::private_escrow_validation;

    use crate::utils::constants::PRIVATE_ESCROW_ENVELOPE_HEADER_FELTS;
    use crate::utils::errors;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    #[storage]
    struct Storage {
        /// Only this Privacy Pool may invoke the encrypted Private Escrow path.
        privacy_pool: ContractAddress,

        /// Public structural records indexed by one-time action locators.
        private_escrow_actions: Map<felt252, EncryptedPrivateEscrowActionRecord>,

        /// Ciphertext chunks indexed by:
        ///
        /// `(private_escrow_action_locator, chunk_index)`.
        payload_chunks: Map<(felt252, u64), felt252>,

        /// Explicit action existence marker.
        ///
        /// Cairo maps return default values for unwritten keys, so this map
        /// distinguishes an absent action from an all-zero record.
        stored_private_escrow_action_locators: Map<felt252, bool>,

        /// Global encrypted-envelope commitment reuse guard.
        ///
        /// This is helper-level duplicate protection only. It does not replace
        /// Privacy Pool replay protection.
        committed_private_escrow_payloads: Map<felt252, bool>,
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        PrivateEscrowActionCommitted: PrivateEscrowActionCommitted,
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

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
    // External implementation
    // -------------------------------------------------------------------------

    #[abi(embed_v0)]
    impl VeilPrivateEscrowHelperImpl of IVeilPrivateEscrowHelper<ContractState> {
        /// Store one encrypted VEIL Private Escrow action through Privacy Pool
        /// `InvokeExternal`.
        ///
        /// SECURITY BOUNDARIES:
        ///
        /// - only the Privacy Pool fixed at deployment may call this function;
        /// - arbitrary wallets and contracts cannot write directly;
        /// - InvokeExternal calldata remains public ciphertext;
        /// - the helper validates only envelope structure and commitment;
        /// - the helper never parses Private Escrow lifecycle semantics;
        /// - participant authorization remains outside this helper;
        /// - the containing pool transaction must independently satisfy the
        ///   official replay-protection requirement.
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

            self.store_private_escrow_action(calldata)
        }

        fn get_privacy_pool(
            self: @ContractState,
        ) -> ContractAddress {
            self.privacy_pool.read()
        }

        fn has_private_escrow_action(
            self: @ContractState,
            private_escrow_action_locator: felt252,
        ) -> bool {
            self
                .stored_private_escrow_action_locators
                .read(private_escrow_action_locator)
        }

        fn get_private_escrow_action(
            self: @ContractState,
            private_escrow_action_locator: felt252,
        ) -> EncryptedPrivateEscrowActionRecord {
            let exists = self
                .stored_private_escrow_action_locators
                .read(private_escrow_action_locator);

            private_escrow_validation::assert_private_escrow_action_exists(exists);

            self.private_escrow_actions.read(private_escrow_action_locator)
        }

        fn get_private_escrow_payload_chunk(
            self: @ContractState,
            private_escrow_action_locator: felt252,
            chunk_index: u64,
        ) -> felt252 {
            let exists = self
                .stored_private_escrow_action_locators
                .read(private_escrow_action_locator);

            private_escrow_validation::assert_private_escrow_action_exists(exists);

            let private_escrow_action =
                self.private_escrow_actions.read(private_escrow_action_locator);

            private_escrow_validation::assert_valid_private_escrow_chunk_index(
                chunk_index,
                private_escrow_action.payload_chunk_count,
            );

            self
                .payload_chunks
                .read((private_escrow_action_locator, chunk_index))
        }

        fn is_private_escrow_payload_committed(
            self: @ContractState,
            payload_commitment: felt252,
        ) -> bool {
            self.committed_private_escrow_payloads.read(payload_commitment)
        }
    }

    // -------------------------------------------------------------------------
    // Internal implementation
    // -------------------------------------------------------------------------

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Validate and persist one encrypted Private Escrow action.
        ///
        /// Calldata layout:
        ///
        /// 0. envelope_version
        /// 1. private_escrow_action_locator
        /// 2. claimed_payload_commitment
        /// 3. payload_chunk_count
        /// 4... ciphertext_chunks
        fn store_private_escrow_action(
            ref self: ContractState,
            calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            assert(
                calldata.len() >= PRIVATE_ESCROW_ENVELOPE_HEADER_FELTS,
                errors::INVALID_PRIVATE_ESCROW_CALLDATA,
            );

            let envelope_version: u8 = (*calldata.at(0))
                .try_into()
                .expect(errors::INVALID_PRIVATE_ESCROW_ENVELOPE_VERSION);

            let private_escrow_action_locator = *calldata.at(1);
            let claimed_payload_commitment = *calldata.at(2);

            let payload_chunk_count: u64 = (*calldata.at(3))
                .try_into()
                .expect(errors::INVALID_PRIVATE_ESCROW_CHUNK_COUNT);

            private_escrow_validation::assert_valid_private_escrow_action_header(
                envelope_version,
                private_escrow_action_locator,
                claimed_payload_commitment,
                payload_chunk_count,
            );

            let chunk_count_usize: usize = payload_chunk_count
                .try_into()
                .expect('Private Escrow chunk overflow');

            let expected_calldata_length =
                PRIVATE_ESCROW_ENVELOPE_HEADER_FELTS + chunk_count_usize;

            assert(
                calldata.len() == expected_calldata_length,
                errors::INVALID_PRIVATE_ESCROW_PAYLOAD_SIZE,
            );

            let computed_payload_commitment =
                compute_private_escrow_action_commitment(
                    envelope_version,
                    private_escrow_action_locator,
                    payload_chunk_count,
                    calldata,
                );

            assert(
                computed_payload_commitment
                    == claimed_payload_commitment,
                errors::PRIVATE_ESCROW_PAYLOAD_COMMITMENT_MISMATCH,
            );

            let locator_exists = self
                .stored_private_escrow_action_locators
                .read(private_escrow_action_locator);

            private_escrow_validation::assert_private_escrow_action_not_stored(
                locator_exists,
            );

            let commitment_exists = self
                .committed_private_escrow_payloads
                .read(computed_payload_commitment);

            private_escrow_validation::assert_private_escrow_payload_not_committed(
                commitment_exists,
            );

            let private_escrow_action = EncryptedPrivateEscrowActionRecord {
                envelope_version,
                private_escrow_action_locator,
                payload_commitment: computed_payload_commitment,
                payload_chunk_count,
            };

            self
                .private_escrow_actions
                .write(private_escrow_action_locator, private_escrow_action);

            self.store_private_escrow_payload_chunks(
                private_escrow_action_locator,
                payload_chunk_count,
                calldata,
            );

            self
                .stored_private_escrow_action_locators
                .write(private_escrow_action_locator, true);

            self
                .committed_private_escrow_payloads
                .write(computed_payload_commitment, true);

            self.emit(
                Event::PrivateEscrowActionCommitted(
                    PrivateEscrowActionCommitted {
                        private_escrow_action_locator,
                        payload_commitment:
                            computed_payload_commitment,
                    },
                ),
            );

            // Storing an encrypted Private Escrow action does not request an ERC-20
            // output deposit into an open note.
            ArrayTrait::<OpenNoteDeposit>::new().span()
        }

        /// Persist opaque ciphertext chunks.
        ///
        /// Zero-valued felts are accepted because a valid encrypted
        /// representation may contain zero.
        fn store_private_escrow_payload_chunks(
            ref self: ContractState,
            private_escrow_action_locator: felt252,
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
                    .expect('Escrow chunk overflow');

                let calldata_index =
                    PRIVATE_ESCROW_ENVELOPE_HEADER_FELTS + chunk_offset;

                let chunk = *calldata.at(calldata_index);

                self
                    .payload_chunks
                    .write(
                        (private_escrow_action_locator, chunk_index),
                        chunk,
                    );

                chunk_index += 1;
            };
        }
    }
}
