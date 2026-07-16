use crate::deal_escrow::deal_escrow_interfaces::IVeilDealEscrow;

#[starknet::contract]
pub mod VeilDealEscrow {
    use openzeppelin_security::reentrancyguard::ReentrancyGuardComponent;
    use openzeppelin_security::reentrancyguard::ReentrancyGuardComponent::InternalTrait
        as ReentrancyGuardInternalTrait;
    use openzeppelin_token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin_token::erc721::interface::{IERC721Dispatcher, IERC721DispatcherTrait};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };

    use super::IVeilDealEscrow;
    use crate::deal_escrow::deal_escrow_errors as errors;
    use crate::deal_escrow::deal_escrow_events::{
        AssetDeposited, DealAccepted, DealActivated, DealCancelled, DealCreated,
        DealRefunded, DealReleased, PaymentDeposited, PrivatePaymentAuthorized,
        PrivateReleaseAuthorized,
    };
    use crate::deal_escrow::deal_escrow_types::{Deal, DealStatus};
    use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
    use crate::utils::errors::{UNAUTHORIZED_PRIVACY_POOL, ZERO_NOTE_ID};
    use crate::utils::validation::assert_non_zero_address;

    /// Pool calldata is intentionally closed over these two actions. Token,
    /// amount, NFT and recipients always come from stored deal state.
    pub const PRIVATE_FUND_PAYMENT_ACTION: felt252 = 1;
    pub const PRIVATE_RELEASE_ACTION: felt252 = 2;

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
        deals: Map<felt252, Deal>,
        deal_exists: Map<felt252, bool>,
        used_nonce: Map<(ContractAddress, felt252), bool>,
        deal_count: u64,
        reserved_by_token: Map<ContractAddress, u128>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
        DealCreated: DealCreated,
        DealAccepted: DealAccepted,
        PrivatePaymentAuthorized: PrivatePaymentAuthorized,
        PaymentDeposited: PaymentDeposited,
        AssetDeposited: AssetDeposited,
        DealActivated: DealActivated,
        PrivateReleaseAuthorized: PrivateReleaseAuthorized,
        DealReleased: DealReleased,
        DealRefunded: DealRefunded,
        DealCancelled: DealCancelled,
    }

    #[constructor]
    fn constructor(ref self: ContractState, privacy_pool: ContractAddress) {
        assert_non_zero_address(privacy_pool);
        self.privacy_pool.write(privacy_pool);
    }

    #[abi(embed_v0)]
    impl VeilDealEscrowImpl of IVeilDealEscrow<ContractState> {
        fn create_deal(
            ref self: ContractState,
            seller: ContractAddress,
            payment_token: ContractAddress,
            payment_amount: u128,
            nft_contract: ContractAddress,
            nft_token_id: u256,
            encrypted_terms_commitment: felt252,
            deal_nonce: felt252,
            expiry: u64,
        ) -> felt252 {
            let buyer = get_caller_address();
            assert_non_zero_address(buyer);
            assert_non_zero_address(seller);
            assert_non_zero_address(payment_token);
            assert_non_zero_address(nft_contract);
            assert(buyer != seller, errors::SAME_PARTICIPANT);
            assert(payment_amount != 0, errors::ZERO_PAYMENT_AMOUNT);
            assert(
                encrypted_terms_commitment != 0,
                errors::ZERO_TERMS_COMMITMENT,
            );
            assert(deal_nonce != 0, errors::ZERO_NONCE);
            assert(
                !self.used_nonce.read((buyer, deal_nonce)),
                errors::NONCE_REPLAY,
            );

            let now = get_block_timestamp();
            assert(expiry > now, errors::INVALID_EXPIRY);

            let next_count = self.deal_count.read() + 1;
            let deal_id: felt252 = next_count.into();
            self.deal_count.write(next_count);
            self.used_nonce.write((buyer, deal_nonce), true);
            self.deal_exists.write(deal_id, true);
            self.deals.write(
                deal_id,
                Deal {
                    deal_id,
                    deal_nonce,
                    buyer,
                    seller,
                    payment_token,
                    payment_amount,
                    nft_contract,
                    nft_token_id,
                    encrypted_terms_commitment,
                    expiry,
                    accepted: false,
                    payment_deposited: false,
                    payment_via_pool: false,
                    nft_deposited: false,
                    private_payment_authorized: false,
                    private_release_authorized: false,
                    private_release_note_id: 0,
                    status: DealStatus::Created,
                    created_at: now,
                    updated_at: now,
                    completed_at: 0,
                },
            );
            self.emit(
                DealCreated {
                    deal_id,
                    buyer,
                    seller,
                    deal_nonce,
                    payment_token,
                    payment_amount,
                    nft_contract,
                    nft_token_id,
                    encrypted_terms_commitment,
                    expiry,
                    timestamp: now,
                },
            );
            deal_id
        }

        fn accept_deal(ref self: ContractState, deal_id: felt252) {
            let mut deal = self.read_deal(deal_id);
            assert(get_caller_address() == deal.seller, errors::ONLY_SELLER);
            assert(deal.status == DealStatus::Created, errors::INVALID_STATE);
            assert(!deal.accepted, errors::ALREADY_ACCEPTED);
            self.assert_not_expired(@deal);

            let now = get_block_timestamp();
            deal.accepted = true;
            deal.updated_at = now;
            self.deals.write(deal_id, deal);
            self.emit(DealAccepted { deal_id, seller: deal.seller, timestamp: now });
        }

        fn deposit_payment(ref self: ContractState, deal_id: felt252) {
            self.reentrancy_guard.start();
            let mut deal = self.read_deal(deal_id);
            assert(get_caller_address() == deal.buyer, errors::ONLY_BUYER);
            self.assert_payment_fundable(@deal);

            let erc20 = IERC20Dispatcher { contract_address: deal.payment_token };
            let contract = get_contract_address();
            let amount: u256 = deal.payment_amount.into();
            let reserved = self.reserved_by_token.read(deal.payment_token);
            let balance_before = erc20.balance_of(account: contract);
            assert(balance_before >= reserved.into(), errors::PAYMENT_RESERVE_BROKEN);

            // Effects precede the token interaction. Any failed transfer or
            // exact-balance assertion reverts these writes atomically.
            let now = get_block_timestamp();
            deal.payment_deposited = true;
            deal.payment_via_pool = false;
            deal.status = DealStatus::BuyerFunded;
            deal.updated_at = now;
            self.deals.write(deal_id, deal);
            self
                .reserved_by_token
                .write(deal.payment_token, reserved + deal.payment_amount);

            assert(
                erc20.transfer_from(
                    sender: deal.buyer, recipient: contract, amount: amount,
                ),
                errors::PAYMENT_TRANSFER_FAILED,
            );
            let balance_after = erc20.balance_of(account: contract);
            assert(
                balance_after == balance_before + amount,
                errors::PAYMENT_AMOUNT_MISMATCH,
            );
            self.emit(
                PaymentDeposited {
                    deal_id,
                    token: deal.payment_token,
                    amount: deal.payment_amount,
                    via_privacy_pool: false,
                    timestamp: now,
                },
            );
            self.reentrancy_guard.end();
        }

        fn authorize_private_payment(ref self: ContractState, deal_id: felt252) {
            let mut deal = self.read_deal(deal_id);
            assert(get_caller_address() == deal.buyer, errors::ONLY_BUYER);
            self.assert_payment_fundable(@deal);
            assert(
                !deal.private_payment_authorized,
                errors::PRIVATE_PAYMENT_AUTH_EXISTS,
            );

            let now = get_block_timestamp();
            deal.private_payment_authorized = true;
            deal.updated_at = now;
            self.deals.write(deal_id, deal);
            self.emit(PrivatePaymentAuthorized { deal_id, timestamp: now });
        }

        fn deposit_asset(ref self: ContractState, deal_id: felt252) {
            self.reentrancy_guard.start();
            let mut deal = self.read_deal(deal_id);
            assert(get_caller_address() == deal.seller, errors::ONLY_SELLER);
            assert(deal.accepted, errors::NOT_ACCEPTED);
            assert(!deal.nft_deposited, errors::ASSET_ALREADY_FUNDED);
            assert(deal.status == DealStatus::BuyerFunded, errors::INVALID_STATE);
            self.assert_not_expired(@deal);

            let nft = IERC721Dispatcher { contract_address: deal.nft_contract };
            assert(
                nft.owner_of(token_id: deal.nft_token_id) == deal.seller,
                errors::WRONG_NFT_OWNER,
            );

            let now = get_block_timestamp();
            deal.nft_deposited = true;
            deal.status = DealStatus::SellerFunded;
            deal.updated_at = now;
            self.deals.write(deal_id, deal);

            nft.transfer_from(
                from: deal.seller,
                to: get_contract_address(),
                token_id: deal.nft_token_id,
            );
            assert(
                nft.owner_of(token_id: deal.nft_token_id) == get_contract_address(),
                errors::WRONG_NFT_OWNER,
            );
            self.emit(
                AssetDeposited {
                    deal_id,
                    nft_contract: deal.nft_contract,
                    nft_token_id: deal.nft_token_id,
                    timestamp: now,
                },
            );
            self.reentrancy_guard.end();
        }

        fn activate(ref self: ContractState, deal_id: felt252) {
            let mut deal = self.read_deal(deal_id);
            self.assert_participant(@deal, get_caller_address());
            assert(deal.status == DealStatus::SellerFunded, errors::INVALID_STATE);
            assert(deal.payment_deposited, errors::NOT_FUNDED);
            assert(deal.nft_deposited, errors::NOT_FUNDED);
            self.assert_not_expired(@deal);

            let now = get_block_timestamp();
            deal.status = DealStatus::Active;
            deal.updated_at = now;
            self.deals.write(deal_id, deal);
            self.emit(DealActivated { deal_id, timestamp: now });
        }

        fn release(ref self: ContractState, deal_id: felt252) {
            self.reentrancy_guard.start();
            let mut deal = self.read_deal(deal_id);
            assert(get_caller_address() == deal.buyer, errors::ONLY_BUYER);
            assert(deal.status == DealStatus::Active, errors::INVALID_STATE);
            self.assert_not_expired(@deal);
            self.assert_assets_held(@deal);

            let erc20 = IERC20Dispatcher { contract_address: deal.payment_token };
            let nft = IERC721Dispatcher { contract_address: deal.nft_contract };
            let contract = get_contract_address();
            let amount: u256 = deal.payment_amount.into();
            let reserved = self.reserved_by_token.read(deal.payment_token);
            assert(reserved >= deal.payment_amount, errors::PAYMENT_RESERVE_BROKEN);
            let balance_before = erc20.balance_of(account: contract);
            assert(balance_before >= reserved.into(), errors::PAYMENT_RESERVE_BROKEN);

            let now = get_block_timestamp();
            deal.status = DealStatus::Released;
            deal.private_release_authorized = false;
            deal.updated_at = now;
            deal.completed_at = now;
            self.deals.write(deal_id, deal);
            self
                .reserved_by_token
                .write(deal.payment_token, reserved - deal.payment_amount);

            nft.transfer_from(
                from: contract, to: deal.buyer, token_id: deal.nft_token_id,
            );
            assert(
                nft.owner_of(token_id: deal.nft_token_id) == deal.buyer,
                errors::WRONG_NFT_OWNER,
            );
            assert(
                erc20.transfer(recipient: deal.seller, amount: amount),
                errors::PAYMENT_TRANSFER_FAILED,
            );
            let balance_after = erc20.balance_of(account: contract);
            assert(
                balance_after + amount == balance_before,
                errors::PAYMENT_AMOUNT_MISMATCH,
            );
            self.emit(
                DealReleased {
                    deal_id, via_privacy_pool: false, note_id: 0, timestamp: now,
                },
            );
            self.reentrancy_guard.end();
        }

        fn authorize_private_release(
            ref self: ContractState, deal_id: felt252, output_note_id: felt252,
        ) {
            let mut deal = self.read_deal(deal_id);
            assert(get_caller_address() == deal.buyer, errors::ONLY_BUYER);
            assert(deal.status == DealStatus::Active, errors::INVALID_STATE);
            self.assert_not_expired(@deal);
            assert(output_note_id != 0, ZERO_NOTE_ID);
            assert(
                !deal.private_release_authorized,
                errors::PRIVATE_RELEASE_AUTH_EXISTS,
            );

            let now = get_block_timestamp();
            deal.private_release_authorized = true;
            deal.private_release_note_id = output_note_id;
            deal.updated_at = now;
            self.deals.write(deal_id, deal);
            self.emit(
                PrivateReleaseAuthorized {
                    deal_id, note_id: output_note_id, timestamp: now,
                },
            );
        }

        fn refund_expired(ref self: ContractState, deal_id: felt252) {
            self.reentrancy_guard.start();
            let mut deal = self.read_deal(deal_id);
            self.assert_participant(@deal, get_caller_address());
            assert(get_block_timestamp() >= deal.expiry, errors::DEAL_NOT_EXPIRED);
            let refundable = deal.status == DealStatus::BuyerFunded
                || deal.status == DealStatus::SellerFunded
                || deal.status == DealStatus::Active;
            assert(refundable, errors::INVALID_STATE);
            assert(deal.payment_deposited || deal.nft_deposited, errors::NOT_FUNDED);

            let contract = get_contract_address();
            let mut payment_balance_before: u256 = 0;
            let mut reserved: u128 = 0;
            if deal.payment_deposited {
                let erc20 = IERC20Dispatcher { contract_address: deal.payment_token };
                reserved = self.reserved_by_token.read(deal.payment_token);
                assert(reserved >= deal.payment_amount, errors::PAYMENT_RESERVE_BROKEN);
                payment_balance_before = erc20.balance_of(account: contract);
                assert(
                    payment_balance_before >= reserved.into(),
                    errors::PAYMENT_RESERVE_BROKEN,
                );
            }
            if deal.nft_deposited {
                let nft = IERC721Dispatcher { contract_address: deal.nft_contract };
                assert(
                    nft.owner_of(token_id: deal.nft_token_id) == contract,
                    errors::WRONG_NFT_OWNER,
                );
            }

            let now = get_block_timestamp();
            deal.status = DealStatus::Refunded;
            deal.private_release_authorized = false;
            deal.private_payment_authorized = false;
            deal.updated_at = now;
            deal.completed_at = now;
            self.deals.write(deal_id, deal);
            if deal.payment_deposited {
                self
                    .reserved_by_token
                    .write(deal.payment_token, reserved - deal.payment_amount);
            }

            if deal.nft_deposited {
                let nft = IERC721Dispatcher { contract_address: deal.nft_contract };
                nft.transfer_from(
                    from: contract, to: deal.seller, token_id: deal.nft_token_id,
                );
                assert(
                    nft.owner_of(token_id: deal.nft_token_id) == deal.seller,
                    errors::WRONG_NFT_OWNER,
                );
            }
            if deal.payment_deposited {
                let erc20 = IERC20Dispatcher { contract_address: deal.payment_token };
                let amount: u256 = deal.payment_amount.into();
                assert(
                    erc20.transfer(recipient: deal.buyer, amount: amount),
                    errors::PAYMENT_TRANSFER_FAILED,
                );
                assert(
                    erc20.balance_of(account: contract) + amount
                        == payment_balance_before,
                    errors::PAYMENT_AMOUNT_MISMATCH,
                );
            }
            self.emit(
                DealRefunded {
                    deal_id,
                    payment_refunded: deal.payment_deposited,
                    asset_refunded: deal.nft_deposited,
                    timestamp: now,
                },
            );
            self.reentrancy_guard.end();
        }

        fn cancel(ref self: ContractState, deal_id: felt252) {
            let mut deal = self.read_deal(deal_id);
            self.assert_participant(@deal, get_caller_address());
            assert(deal.status == DealStatus::Created, errors::INVALID_STATE);
            assert(!deal.payment_deposited && !deal.nft_deposited, errors::NOT_FUNDED);

            let now = get_block_timestamp();
            deal.status = DealStatus::Cancelled;
            deal.private_payment_authorized = false;
            deal.updated_at = now;
            deal.completed_at = now;
            self.deals.write(deal_id, deal);
            self.emit(DealCancelled { deal_id, timestamp: now });
        }

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
            let result = if action == PRIVATE_FUND_PAYMENT_ACTION {
                self.private_fund_payment(calldata)
            } else if action == PRIVATE_RELEASE_ACTION {
                self.private_release(calldata)
            } else {
                core::panic_with_felt252(errors::INVALID_ACTION)
            };
            self.reentrancy_guard.end();
            result
        }

        fn get_deal(self: @ContractState, deal_id: felt252) -> Deal {
            self.read_deal(deal_id)
        }

        fn get_status(self: @ContractState, deal_id: felt252) -> DealStatus {
            self.read_deal(deal_id).status
        }

        fn get_deal_count(self: @ContractState) -> u64 {
            self.deal_count.read()
        }

        fn get_privacy_pool(self: @ContractState) -> ContractAddress {
            self.privacy_pool.read()
        }

        fn get_reserved_amount(
            self: @ContractState, token: ContractAddress,
        ) -> u128 {
            self.reserved_by_token.read(token)
        }

        fn is_privacy_path_e2e_verified(self: @ContractState) -> bool {
            false
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn read_deal(self: @ContractState, deal_id: felt252) -> Deal {
            assert(deal_id != 0, errors::DEAL_NOT_FOUND);
            assert(self.deal_exists.read(deal_id), errors::DEAL_NOT_FOUND);
            self.deals.read(deal_id)
        }

        fn assert_not_expired(self: @ContractState, deal: @Deal) {
            assert(get_block_timestamp() < *deal.expiry, errors::DEAL_EXPIRED);
        }

        fn assert_participant(
            self: @ContractState, deal: @Deal, caller: ContractAddress,
        ) {
            assert(
                caller == *deal.buyer || caller == *deal.seller,
                errors::ONLY_PARTICIPANT,
            );
        }

        fn assert_payment_fundable(self: @ContractState, deal: @Deal) {
            assert(*deal.accepted, errors::NOT_ACCEPTED);
            assert(!*deal.payment_deposited, errors::PAYMENT_ALREADY_FUNDED);
            assert(*deal.status == DealStatus::Created, errors::INVALID_STATE);
            self.assert_not_expired(deal);
        }

        fn assert_assets_held(self: @ContractState, deal: @Deal) {
            assert(*deal.payment_deposited, errors::NOT_FUNDED);
            assert(*deal.nft_deposited, errors::NOT_FUNDED);
            let nft = IERC721Dispatcher { contract_address: *deal.nft_contract };
            assert(
                nft.owner_of(token_id: *deal.nft_token_id) == get_contract_address(),
                errors::WRONG_NFT_OWNER,
            );
        }

        /// Pool funding has schema `[1, deal_id]`; token and amount cannot be
        /// supplied or redirected by calldata. The buyer's prior authorization
        /// is consumed exactly once, and actual unreserved balance backs it.
        fn private_fund_payment(
            ref self: ContractState, calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            assert(calldata.len() == 2, errors::INVALID_CALLDATA);
            let deal_id = *calldata.at(1);
            let mut deal = self.read_deal(deal_id);
            self.assert_payment_fundable(@deal);
            assert(
                deal.private_payment_authorized,
                errors::PRIVATE_PAYMENT_NOT_AUTH,
            );

            let erc20 = IERC20Dispatcher { contract_address: deal.payment_token };
            let reserved = self.reserved_by_token.read(deal.payment_token);
            let updated_reserved = reserved + deal.payment_amount;
            let balance = erc20.balance_of(account: get_contract_address());
            assert(balance >= updated_reserved.into(), errors::PAYMENT_NOT_RECEIVED);

            let now = get_block_timestamp();
            deal.payment_deposited = true;
            deal.payment_via_pool = true;
            deal.private_payment_authorized = false;
            deal.status = DealStatus::BuyerFunded;
            deal.updated_at = now;
            self.deals.write(deal_id, deal);
            self.reserved_by_token.write(deal.payment_token, updated_reserved);
            self.emit(
                PaymentDeposited {
                    deal_id,
                    token: deal.payment_token,
                    amount: deal.payment_amount,
                    via_privacy_pool: true,
                    timestamp: now,
                },
            );
            ArrayTrait::<OpenNoteDeposit>::new().span()
        }

        /// Pool settlement has schema `[2, deal_id, note_id]`. The note id must
        /// match the buyer's one-shot authorization; all other output fields
        /// are loaded from the deal. Pool/token failure reverts the NFT move,
        /// state transition and reserve decrement atomically.
        fn private_release(
            ref self: ContractState, calldata: Span<felt252>,
        ) -> Span<OpenNoteDeposit> {
            assert(calldata.len() == 3, errors::INVALID_CALLDATA);
            let deal_id = *calldata.at(1);
            let note_id = *calldata.at(2);
            assert(note_id != 0, ZERO_NOTE_ID);

            let mut deal = self.read_deal(deal_id);
            assert(deal.status == DealStatus::Active, errors::INVALID_STATE);
            self.assert_not_expired(@deal);
            assert(
                deal.private_release_authorized,
                errors::PRIVATE_RELEASE_NOT_AUTH,
            );
            assert(deal.private_release_note_id == note_id, errors::NOTE_ID_MISMATCH);
            self.assert_assets_held(@deal);

            let contract = get_contract_address();
            let pool = self.privacy_pool.read();
            let erc20 = IERC20Dispatcher { contract_address: deal.payment_token };
            let nft = IERC721Dispatcher { contract_address: deal.nft_contract };
            let reserved = self.reserved_by_token.read(deal.payment_token);
            assert(reserved >= deal.payment_amount, errors::PAYMENT_RESERVE_BROKEN);
            let balance = erc20.balance_of(account: contract);
            assert(balance >= reserved.into(), errors::PAYMENT_RESERVE_BROKEN);
            assert(
                erc20.allowance(owner: contract, spender: pool) == 0,
                errors::STALE_ALLOWANCE,
            );

            let now = get_block_timestamp();
            deal.status = DealStatus::Released;
            deal.private_release_authorized = false;
            deal.updated_at = now;
            deal.completed_at = now;
            self.deals.write(deal_id, deal);
            self
                .reserved_by_token
                .write(deal.payment_token, reserved - deal.payment_amount);

            nft.transfer_from(
                from: contract, to: deal.buyer, token_id: deal.nft_token_id,
            );
            assert(
                nft.owner_of(token_id: deal.nft_token_id) == deal.buyer,
                errors::WRONG_NFT_OWNER,
            );
            assert(
                erc20.approve(spender: pool, amount: deal.payment_amount.into()),
                errors::APPROVAL_FAILED,
            );
            assert(
                erc20.allowance(owner: contract, spender: pool)
                    == deal.payment_amount.into(),
                errors::APPROVAL_NOT_EXACT,
            );
            self.emit(
                DealReleased {
                    deal_id,
                    via_privacy_pool: true,
                    note_id,
                    timestamp: now,
                },
            );
            [
                OpenNoteDeposit {
                    note_id,
                    token: deal.payment_token,
                    amount: deal.payment_amount,
                },
            ]
                .span()
        }
    }
}
