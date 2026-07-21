use starknet::ContractAddress;

use crate::interfaces::privacy_pool_types::OpenNoteDeposit;
use crate::private_escrow::private_escrow_types::EncryptedPrivateEscrowActionRecord;

/// Interface for the VEIL encrypted Private Escrow helper.
///
/// This contract is an application-specific helper invoked through the STRK20
/// Privacy Pool `InvokeExternal` action.
///
/// IMPORTANT PROTOCOL BOUNDARY:
///
/// - InvokeExternal calldata is public on-chain.
/// - VEIL must encrypt all Private Escrow semantics before constructing this calldata.
/// - This helper does not make calldata private.
/// - This helper does not provide participant authorization by itself.
/// - This helper does not make a standalone Private Escrow-only pool transaction valid.
/// - The containing Privacy Pool transaction must independently satisfy the
///   pool's official WriteOnce replay-protection requirement.
///
/// Every Private Escrow lifecycle action is represented as a separate encrypted payload:
///
/// - create private escrow;
/// - funding intent;
/// - accept private escrow;
/// - funding confirmation;
/// - cancel private escrow;
/// - refund private escrow;
/// - dispute and resolution.
///
/// The action kind, participant context, lifecycle relationships, and settlement coordination exist only inside ciphertext.
#[starknet::interface]
pub trait IVeilPrivateEscrowHelper<TContractState> {
    /// Store one encrypted Private Escrow action through the configured Privacy Pool.
    ///
    /// Only the pinned Privacy Pool may call this entrypoint.
    ///
    /// Calldata layout:
    ///
    /// ```text
    /// [0] envelope_version
    /// [1] private_escrow_action_locator
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
    /// - participant context;
    /// - private escrow nonce;
    /// - root and parent escrow action relationships;
    /// - asset;
    /// - payment terms;
    /// - funding and settlement terms;
    /// - conditions;
    /// - expiry;
    /// - release, refund, dispute, or resolution reason;
    /// - settlement commitment.
    ///
    /// The helper returns an empty deposit span because storing an encrypted
    /// Private Escrow action does not itself credit an output token to an open note.
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
    /// - private escrow id;
    /// - conversation id;
    /// - deal-room id;
    /// - channel id;
    /// - participant id;
    /// - escrow id.
    fn has_private_escrow_action(
        self: @TContractState,
        private_escrow_action_locator: felt252,
    ) -> bool;

    /// Return the structural public record for one encrypted Private Escrow action.
    ///
    /// The implementation must revert when the locator does not exist.
    fn get_private_escrow_action(
        self: @TContractState,
        private_escrow_action_locator: felt252,
    ) -> EncryptedPrivateEscrowActionRecord;

    /// Return one ciphertext chunk belonging to an encrypted Private Escrow action.
    ///
    /// The implementation must revert when:
    ///
    /// - the locator does not exist; or
    /// - `chunk_index` is greater than or equal to the recorded chunk count.
    fn get_private_escrow_payload_chunk(
        self: @TContractState,
        private_escrow_action_locator: felt252,
        chunk_index: u64,
    ) -> felt252;

    /// Return true when the payload commitment has already been stored.
    ///
    /// This helper-level idempotency check is separate from the official
    /// Privacy Pool replay-protection requirement.
    fn is_private_escrow_payload_committed(
        self: @TContractState,
        payload_commitment: felt252,
    ) -> bool;
}
