#[starknet::contract]
pub mod VeilOfferHelper {
    use starknet::storage::{
        Map,
        StorageMapReadAccess,
        StorageMapWriteAccess,
        StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    use crate::interfaces::privacy_pool_types::OpenNoteDeposit;

    use crate::offers::offer_commitments::compute_offer_action_commitment;
    use crate::offers::offer_events::OfferActionCommitted;
    use crate::offers::offer_interfaces::IVeilOfferHelper;
    use crate::offers::offer_types::EncryptedOfferActionRecord;
    use crate::offers::offer_validation;

    use crate::utils::constants::OFFER_ENVELOPE_HEADER_FELTS;
    use crate::utils::errors;

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    #[storage]
    struct Storage {
        /// Only this Privacy Pool may invoke the encrypted Offer path.
        privacy_pool: ContractAddress,

        /// Public structural records indexed by one-time action locators.
        offer_actions: Map<felt252, EncryptedOfferActionRecord>,

        /// Ciphertext chunks indexed by:
        ///
        /// `(offer_action_locator, chunk_index)`.
        payload_chunks: Map<(felt252, u64), felt252>,

        /// Explicit action existence marker.
        ///
        /// Cairo maps return default values for unwritten keys, so this map
        /// distinguishes an absent action from an all-zero record.
        stored_offer_action_locators: Map<felt252, bool>,

        /// Global encrypted-envelope commitment reuse guard.
        ///
        /// This is helper-level duplicate protection only. It does not replace
        /// Privacy Pool replay protection.
        committed_offer_payloads: Map<felt252, bool>,
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        OfferActionCommitted: OfferActionCommitted,
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
    impl VeilOfferHelperImpl of IVeilOfferHelper<ContractState> {
        /// Store one encrypted VEIL Offer action through Privacy Pool
        /// `InvokeExternal`.
        ///
        /// SECURITY BOUNDARIES:
        ///
        /// - only the Privacy Pool fixed at deployment may call this function;
        /// - arbitrary wallets and contracts cannot write directly;
        /// - InvokeExternal calldata remains public ciphertext;
        /// - the helper validates only envelope structure and commitment;
        /// - the helper never parses Offer lifecycle semantics;
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

            self.store_offer_action(calldata)
        }

        fn get_privacy_pool(
            self: @ContractState,
        ) -> ContractAddress {
            self.privacy_pool.read()
        }

        fn has_offer_action(
            self: @ContractState,
            offer_action_locator: felt252,
        ) -> bool {
            self
                .stored_offer_action_locators
                .read(offer_action_locator)
        }

        fn get_offer_action(
            self: @ContractState,
            offer_action_locator: felt252,
        ) -> EncryptedOfferActionRecord {
            let exists = self
                .stored_offer_action_locators
                .read(offer_action_locator);

            offer_validation::assert_offer_action_exists(exists);

            self.offer_actions.read(offer_action_locator)
        }

        fn get_offer_payload_chunk(
            self: @ContractState,
            offer_action_locator: felt252,
            chunk_index: u64,
        ) -> felt252 {
            let exists = self
                .stored_offer_action_locators
                .read(offer_action_locator);

            offer_validation::assert_offer_action_exists(exists);

            let offer_action =
                self.offer_actions.read(offer_action_locator);

            offer_validation::assert_valid_offer_chunk_index(
                chunk_index,
                offer_action.payload_chunk_count,
            );

            self
                .payload_chunks
                .read((offer_action_locator, chunk_index))
        }

        fn is_offer_payload_committed(
            self: @ContractState,
            payload_commitment: felt252,
        ) -> bool {
            self.committed_offer_payloads.read(payload_commitment)
        }
    }

    // -------------------------------------------------------------------------
    // Internal implementation
    // -------------------------------------------------------------------------

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Validate and persist one encrypted Offer action.
        ///
        /// Calldata layout:
        ///
        /// 0. envelope_version
        /// 1. offer_action_locator
        /// 2. claimed_payload_commitment
        /// 3. payload_chunk_count
        /// 4... ciphertext_chunks
        fn store_offer_action(
            ref self: ContractState,
            calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            assert(
                calldata.len() >= OFFER_ENVELOPE_HEADER_FELTS,
                errors::INVALID_OFFER_CALLDATA,
            );

            let envelope_version: u8 = (*calldata.at(0))
                .try_into()
                .expect(errors::INVALID_OFFER_ENVELOPE_VERSION);

            let offer_action_locator = *calldata.at(1);
            let claimed_payload_commitment = *calldata.at(2);

            let payload_chunk_count: u64 = (*calldata.at(3))
                .try_into()
                .expect(errors::INVALID_OFFER_CHUNK_COUNT);

            offer_validation::assert_valid_offer_action_header(
                envelope_version,
                offer_action_locator,
                claimed_payload_commitment,
                payload_chunk_count,
            );

            let chunk_count_usize: usize = payload_chunk_count
                .try_into()
                .expect('Offer chunk overflow');

            let expected_calldata_length =
                OFFER_ENVELOPE_HEADER_FELTS + chunk_count_usize;

            assert(
                calldata.len() == expected_calldata_length,
                errors::INVALID_OFFER_PAYLOAD_SIZE,
            );

            let computed_payload_commitment =
                compute_offer_action_commitment(
                    envelope_version,
                    offer_action_locator,
                    payload_chunk_count,
                    calldata,
                );

            assert(
                computed_payload_commitment
                    == claimed_payload_commitment,
                errors::OFFER_PAYLOAD_COMMITMENT_MISMATCH,
            );

            let locator_exists = self
                .stored_offer_action_locators
                .read(offer_action_locator);

            offer_validation::assert_offer_action_not_stored(
                locator_exists,
            );

            let commitment_exists = self
                .committed_offer_payloads
                .read(computed_payload_commitment);

            offer_validation::assert_offer_payload_not_committed(
                commitment_exists,
            );

            let offer_action = EncryptedOfferActionRecord {
                envelope_version,
                offer_action_locator,
                payload_commitment: computed_payload_commitment,
                payload_chunk_count,
            };

            self
                .offer_actions
                .write(offer_action_locator, offer_action);

            self.store_offer_payload_chunks(
                offer_action_locator,
                payload_chunk_count,
                calldata,
            );

            self
                .stored_offer_action_locators
                .write(offer_action_locator, true);

            self
                .committed_offer_payloads
                .write(computed_payload_commitment, true);

            self.emit(
                Event::OfferActionCommitted(
                    OfferActionCommitted {
                        offer_action_locator,
                        payload_commitment:
                            computed_payload_commitment,
                    },
                ),
            );

            // Storing an encrypted Offer action does not request an ERC-20
            // output deposit into an open note.
            ArrayTrait::<OpenNoteDeposit>::new().span()
        }

        /// Persist opaque ciphertext chunks.
        ///
        /// Zero-valued felts are accepted because a valid encrypted
        /// representation may contain zero.
        fn store_offer_payload_chunks(
            ref self: ContractState,
            offer_action_locator: felt252,
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
                    .expect('Offer chunk index overflow');

                let calldata_index =
                    OFFER_ENVELOPE_HEADER_FELTS + chunk_offset;

                let chunk = *calldata.at(calldata_index);

                self
                    .payload_chunks
                    .write(
                        (offer_action_locator, chunk_index),
                        chunk,
                    );

                chunk_index += 1;
            };
        }
    }
}
