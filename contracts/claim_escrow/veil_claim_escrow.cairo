use crate::claim_escrow::claim_escrow_interfaces::IVeilClaimEscrow;

#[starknet::contract]
pub mod VeilClaimEscrow {
    use openzeppelin_security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin_security::reentrancyguard::ReentrancyGuardComponent::InternalTrait
        as ReentrancyGuardInternalTrait;
    use openzeppelin_token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };

    use super::IVeilClaimEscrow;
    use crate::claim_escrow::claim_escrow_commitments::compute_claim_commitment;
    use crate::claim_escrow::claim_escrow_errors as errors;
    use crate::claim_escrow::claim_escrow_events::{ClaimCompleted, ClaimDeposited};
    use crate::claim_escrow::claim_escrow_types::ClaimEntry;
    use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
    use crate::utils::errors::{
        UNAUTHORIZED_PRIVACY_POOL, ZERO_AMOUNT, ZERO_NOTE_ID, ZERO_TOKEN,
    };
    use crate::utils::validation::assert_non_zero_address;

    pub const DEPOSIT_ACTION: felt252 = 1;
    pub const CLAIM_ACTION: felt252 = 2;

    component!(
        path: ReentrancyGuardComponent,
        storage: reentrancy_guard,
        event: ReentrancyGuardEvent,
    );

    #[storage]
    struct Storage {
        #[substorage(v0)]
        reentrancy_guard: ReentrancyGuardComponent::Storage,
        privacy_pool: ContractAddress,
        claims: Map<felt252, ClaimEntry>,
        claim_exists: Map<felt252, bool>,
        reserved_by_token: Map<ContractAddress, u128>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
        ClaimDeposited: ClaimDeposited,
        ClaimCompleted: ClaimCompleted,
    }

    #[constructor]
    fn constructor(ref self: ContractState, privacy_pool: ContractAddress) {
        assert_non_zero_address(privacy_pool);
        self.privacy_pool.write(privacy_pool);
    }

    #[abi(embed_v0)]
    impl VeilClaimEscrowImpl of IVeilClaimEscrow<ContractState> {
        fn privacy_invoke(
            ref self: ContractState, calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            assert(
                get_caller_address() == self.privacy_pool.read(),
                UNAUTHORIZED_PRIVACY_POOL,
            );
            assert(!calldata.is_empty(), errors::INVALID_CALLDATA);

            self.reentrancy_guard.start();
            let action = *calldata.at(0);
            let result = if action == DEPOSIT_ACTION {
                self.deposit(calldata)
            } else if action == CLAIM_ACTION {
                self.claim(calldata)
            } else {
                core::panic_with_felt252(errors::INVALID_ACTION)
            };
            self.reentrancy_guard.end();
            result
        }

        fn compute_commitment(self: @ContractState, secret: felt252) -> felt252 {
            compute_claim_commitment(secret)
        }

        fn get_privacy_pool(self: @ContractState) -> ContractAddress {
            self.privacy_pool.read()
        }

        fn claim_exists(self: @ContractState, commitment: felt252) -> bool {
            self.claim_exists.read(commitment)
        }

        fn is_claimed(self: @ContractState, commitment: felt252) -> bool {
            assert(self.claim_exists.read(commitment), errors::CLAIM_NOT_FOUND);
            self.claims.read(commitment).claimed
        }

        fn get_claim(self: @ContractState, commitment: felt252) -> ClaimEntry {
            assert(self.claim_exists.read(commitment), errors::CLAIM_NOT_FOUND);
            self.claims.read(commitment)
        }

        fn get_reserved_amount(
            self: @ContractState, token: ContractAddress,
        ) -> u128 {
            self.reserved_by_token.read(token)
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Records funds already transferred by the Pool in an earlier action.
        ///
        /// The reserve invariant prevents a caller from allocating funds that
        /// belong to an existing claim. Only the token balance above existing
        /// liabilities can back a new commitment.
        fn deposit(
            ref self: ContractState, calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            assert(calldata.len() == 4, errors::INVALID_CALLDATA);

            let commitment = *calldata.at(1);
            assert(commitment != 0, errors::ZERO_COMMITMENT);
            assert(!self.claim_exists.read(commitment), errors::DUPLICATE_COMMITMENT);

            let token: ContractAddress = (*calldata.at(2)).try_into().expect(ZERO_TOKEN);
            assert_non_zero_address(token);
            let amount: u128 = (*calldata.at(3)).try_into().expect(ZERO_AMOUNT);
            assert(amount != 0, ZERO_AMOUNT);

            let reserved = self.reserved_by_token.read(token);
            let updated_reserved = reserved + amount;
            let erc20 = IERC20Dispatcher { contract_address: token };
            let balance = erc20.balance_of(account: get_contract_address());
            assert(balance >= updated_reserved.into(), errors::FUNDS_NOT_RECEIVED);

            let now = get_block_timestamp();
            self.claims.write(
                commitment,
                ClaimEntry {
                    commitment,
                    token,
                    amount,
                    claimed: false,
                    created_at: now,
                    claimed_at: 0,
                },
            );
            self.claim_exists.write(commitment, true);
            self.reserved_by_token.write(token, updated_reserved);
            self.emit(ClaimDeposited { commitment, token, amount, timestamp: now });

            // Deposit parks the funds; no open note is funded yet.
            ArrayTrait::<OpenNoteDeposit>::new().span()
        }

        /// Consumes a secret once and lets the Pool pull exactly the parked
        /// amount into the caller-created open note.
        fn claim(
            ref self: ContractState, calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            assert(calldata.len() == 3, errors::INVALID_CALLDATA);

            let secret = *calldata.at(1);
            assert(secret != 0, errors::ZERO_SECRET);
            let note_id = *calldata.at(2);
            assert(note_id != 0, ZERO_NOTE_ID);

            let commitment = compute_claim_commitment(secret);
            assert(self.claim_exists.read(commitment), errors::CLAIM_NOT_FOUND);
            let mut entry = self.claims.read(commitment);
            assert(!entry.claimed, errors::CLAIM_ALREADY_CLAIMED);

            let reserved = self.reserved_by_token.read(entry.token);
            assert(reserved >= entry.amount, errors::RESERVE_INVARIANT);
            let erc20 = IERC20Dispatcher { contract_address: entry.token };
            let balance = erc20.balance_of(account: get_contract_address());
            assert(balance >= reserved.into(), errors::RESERVE_INVARIANT);

            // Checks-effects-interactions: consume the claim and liability
            // before the external approval call. A later Pool/token failure
            // reverts the entire transaction atomically.
            let now = get_block_timestamp();
            entry.claimed = true;
            entry.claimed_at = now;
            self.claims.write(commitment, entry);
            self.reserved_by_token.write(entry.token, reserved - entry.amount);

            let pool = self.privacy_pool.read();
            assert(
                erc20.approve(spender: pool, amount: entry.amount.into()),
                errors::APPROVAL_FAILED,
            );
            assert(
                erc20.allowance(owner: get_contract_address(), spender: pool)
                    == entry.amount.into(),
                errors::APPROVAL_NOT_EXACT,
            );

            self.emit(
                ClaimCompleted {
                    commitment,
                    token: entry.token,
                    note_id,
                    amount: entry.amount,
                    timestamp: now,
                },
            );

            [OpenNoteDeposit { note_id, token: entry.token, amount: entry.amount }].span()
        }
    }
}
