use starknet::ContractAddress;

use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
use crate::offers::offer_types::EncryptedOfferActionRecord;

/// Interface for the VEIL encrypted Offer helper.
///
/// This contract is an application-specific helper invoked through the STRK20
/// Privacy Pool `InvokeExternal` action.
///
/// IMPORTANT PROTOCOL BOUNDARY:
///
/// - InvokeExternal calldata is public on-chain.
/// - VEIL must encrypt all Offer semantics before constructing this calldata.
/// - This helper does not make calldata private.
/// - This helper does not provide participant authorization by itself.
/// - This helper does not make a standalone Offer-only pool transaction valid.
/// - The containing Privacy Pool transaction must independently satisfy the
///   pool's official WriteOnce replay-protection requirement.
///
/// Every Offer lifecycle action is represented as a separate encrypted payload:
///
/// - create offer;
/// - counter offer;
/// - accept offer;
/// - reject offer;
/// - cancel offer;
/// - expire offer;
/// - prepare deal escrow.
///
/// The action kind and negotiation relationships exist only inside ciphertext.
#[starknet::interface]
pub trait IVeilOfferHelper<TContractState> {
    /// Store one encrypted Offer action through the configured Privacy Pool.
    ///
    /// Only the pinned Privacy Pool may call this entrypoint.
    ///
    /// Calldata layout:
    ///
    /// ```text
    /// [0] envelope_version
    /// [1] offer_action_locator
    /// [2] claimed_payload_commitment
    /// [3] payload_chunk_count
    /// [4...] ciphertext_chunks
    /// ```
    ///
    /// Public information:
    ///
    /// - helper contract address;
    /// - envelope version;
    /// - one-time action locator;
    /// - payload commitment;
    /// - ciphertext length;
    /// - ciphertext chunks;
    /// - transaction timing.
    ///
    /// Encrypted information:
    ///
    /// - action kind;
    /// - maker and taker context;
    /// - private offer nonce;
    /// - root and parent offer relationships;
    /// - asset;
    /// - payment terms;
    /// - price;
    /// - conditions;
    /// - expiry;
    /// - accept or reject reason;
    /// - deal commitment.
    ///
    /// The helper returns an empty deposit span because storing an encrypted
    /// Offer action does not itself credit an output token to an open note.
    fn privacy_invoke(
        ref self: TContractState,
        calldata: Span<felt252>,
    ) -> Span<OpenNoteDeposit>;

    /// Return the only Privacy Pool authorized to call `privacy_invoke`.
    fn get_privacy_pool(
        self: @TContractState,
    ) -> ContractAddress;

    /// Return true when this one-time action locator has already been stored.
    ///
    /// The locator identifies exactly one encrypted action. It must not be used
    /// as a stable:
    ///
    /// - offer id;
    /// - conversation id;
    /// - deal-room id;
    /// - channel id;
    /// - participant id;
    /// - escrow id.
    fn has_offer_action(
        self: @TContractState,
        offer_action_locator: felt252,
    ) -> bool;

    /// Return the structural public record for one encrypted Offer action.
    ///
    /// The implementation must revert when the locator does not exist.
    fn get_offer_action(
        self: @TContractState,
        offer_action_locator: felt252,
    ) -> EncryptedOfferActionRecord;

    /// Return one ciphertext chunk belonging to an encrypted Offer action.
    ///
    /// The implementation must revert when:
    ///
    /// - the locator does not exist; or
    /// - `chunk_index` is greater than or equal to the recorded chunk count.
    fn get_offer_payload_chunk(
        self: @TContractState,
        offer_action_locator: felt252,
        chunk_index: u64,
    ) -> felt252;

    /// Return true when the payload commitment has already been stored.
    ///
    /// This helper-level idempotency check is separate from the official
    /// Privacy Pool replay-protection requirement.
    fn is_offer_payload_committed(
        self: @TContractState,
        payload_commitment: felt252,
    ) -> bool;
}
