// -----------------------------------------------------------------------------
// Shared contract errors
// -----------------------------------------------------------------------------

pub const ZERO_ADDRESS: felt252 = 'ZERO_ADDRESS';

/// Caller is not the Privacy Pool fixed during helper deployment.
///
/// Shared by encrypted Message and Offer helpers.
pub const UNAUTHORIZED_PRIVACY_POOL: felt252 = 'NOT_PRIVACY_POOL';

// -----------------------------------------------------------------------------
// Encrypted messaging calldata and envelope validation
// -----------------------------------------------------------------------------

/// Calldata is shorter than the fixed encrypted-message header.
pub const INVALID_MESSAGE_CALLDATA: felt252 = 'BAD_MESSAGE_DATA';

/// Message envelope version could not be decoded into the expected Cairo type.
pub const INVALID_ENVELOPE_VERSION: felt252 = 'BAD_ENVELOPE_VER';

/// Message envelope version is structurally valid but unsupported.
pub const UNSUPPORTED_ENVELOPE_VERSION: felt252 = 'UNSUPPORTED_VER';

/// A one-time message locator must not be zero.
pub const ZERO_MESSAGE_LOCATOR: felt252 = 'ZERO_MSG_LOCATOR';

/// The claimed encrypted-message commitment must not be zero.
pub const ZERO_PAYLOAD_COMMITMENT: felt252 = 'ZERO_PAYLOAD_COMMIT';

/// Every stored encrypted message must contain at least one ciphertext chunk.
pub const EMPTY_ENCRYPTED_PAYLOAD: felt252 = 'EMPTY_CIPHERTEXT';

/// The declared message ciphertext count could not be decoded.
pub const INVALID_CHUNK_COUNT: felt252 = 'BAD_CHUNK_COUNT';

/// The declared message ciphertext count exceeds the configured maximum.
pub const TOO_MANY_PAYLOAD_CHUNKS: felt252 = 'TOO_MANY_CHUNKS';

/// Message calldata length does not match the declared ciphertext count.
pub const INVALID_PAYLOAD_SIZE: felt252 = 'BAD_PAYLOAD_SIZE';

/// Computed encrypted-message commitment differs from the claimed commitment.
pub const PAYLOAD_COMMITMENT_MISMATCH: felt252 = 'COMMITMENT_MISMATCH';

// -----------------------------------------------------------------------------
// Encrypted messaging storage and duplicate protection
// -----------------------------------------------------------------------------

/// The one-time locator has already been used by another stored message.
pub const MESSAGE_LOCATOR_ALREADY_USED: felt252 = 'LOCATOR_ALREADY_USED';

/// The encrypted-message envelope commitment has already been stored.
pub const PAYLOAD_ALREADY_COMMITTED: felt252 = 'PAYLOAD_ALREADY_USED';

/// No encrypted message exists under the requested locator.
pub const MESSAGE_NOT_FOUND: felt252 = 'MESSAGE_NOT_FOUND';

/// Requested message ciphertext chunk is outside the stored range.
pub const CHUNK_INDEX_OUT_OF_BOUNDS: felt252 = 'CHUNK_OOB';

// -----------------------------------------------------------------------------
// Encrypted Offer calldata and envelope validation
// -----------------------------------------------------------------------------

/// Calldata is shorter than the fixed encrypted-Offer header.
pub const INVALID_OFFER_CALLDATA: felt252 = 'BAD_OFFER_DATA';

/// Offer envelope version could not be decoded into the expected Cairo type.
pub const INVALID_OFFER_ENVELOPE_VERSION: felt252 = 'BAD_OFFER_VER';

/// Offer envelope version is structurally valid but unsupported.
pub const UNSUPPORTED_OFFER_ENVELOPE_VERSION: felt252 =
    'UNSUPPORTED_OFFER_VER';

/// A one-time encrypted Offer action locator must not be zero.
pub const ZERO_OFFER_ACTION_LOCATOR: felt252 = 'ZERO_OFFER_LOCATOR';

/// The claimed encrypted Offer commitment must not be zero.
pub const ZERO_OFFER_PAYLOAD_COMMITMENT: felt252 = 'ZERO_OFFER_COMMIT';

/// Every encrypted Offer action must contain at least one ciphertext chunk.
pub const EMPTY_OFFER_PAYLOAD: felt252 = 'EMPTY_OFFER_CIPHERTEXT';

/// The declared Offer ciphertext count could not be decoded.
pub const INVALID_OFFER_CHUNK_COUNT: felt252 = 'BAD_OFFER_CHUNK_COUNT';

/// The declared Offer ciphertext count exceeds the configured maximum.
pub const TOO_MANY_OFFER_PAYLOAD_CHUNKS: felt252 =
    'TOO_MANY_OFFER_CHUNKS';

/// Offer calldata length does not match the declared ciphertext count.
pub const INVALID_OFFER_PAYLOAD_SIZE: felt252 =
    'BAD_OFFER_PAYLOAD_SIZE';

/// Computed encrypted Offer commitment differs from the claimed commitment.
pub const OFFER_PAYLOAD_COMMITMENT_MISMATCH: felt252 =
    'OFFER_COMMIT_MISMATCH';

// -----------------------------------------------------------------------------
// Encrypted Offer storage and duplicate protection
// -----------------------------------------------------------------------------

/// The one-time Offer action locator has already been stored.
pub const OFFER_ACTION_LOCATOR_ALREADY_USED: felt252 =
    'OFFER_LOCATOR_USED';

/// The encrypted Offer envelope commitment has already been stored.
pub const OFFER_PAYLOAD_ALREADY_COMMITTED: felt252 =
    'OFFER_PAYLOAD_USED';

/// No encrypted Offer action exists under the requested locator.
pub const OFFER_ACTION_NOT_FOUND: felt252 =
    'OFFER_ACTION_NOT_FOUND';

/// Requested Offer ciphertext chunk is outside the stored range.
pub const OFFER_CHUNK_INDEX_OUT_OF_BOUNDS: felt252 =
    'OFFER_CHUNK_OOB';

// -----------------------------------------------------------------------------
// Encrypted Private Escrow calldata and storage
// -----------------------------------------------------------------------------

pub const INVALID_PRIVATE_ESCROW_CALLDATA: felt252 =
    'BAD_ESCROW_DATA';

pub const INVALID_PRIVATE_ESCROW_ENVELOPE_VERSION: felt252 =
    'BAD_ESCROW_VER';

pub const UNSUPPORTED_PRIVATE_ESCROW_ENVELOPE_VERSION: felt252 =
    'UNSUPPORTED_ESCROW_VER';

pub const ZERO_PRIVATE_ESCROW_ACTION_LOCATOR: felt252 =
    'ZERO_ESCROW_LOCATOR';

pub const ZERO_PRIVATE_ESCROW_PAYLOAD_COMMITMENT: felt252 =
    'ZERO_ESCROW_COMMIT';

pub const EMPTY_PRIVATE_ESCROW_PAYLOAD: felt252 =
    'EMPTY_ESCROW_CIPHERTEXT';

pub const INVALID_PRIVATE_ESCROW_CHUNK_COUNT: felt252 =
    'BAD_ESCROW_CHUNK_COUNT';

pub const TOO_MANY_PRIVATE_ESCROW_PAYLOAD_CHUNKS: felt252 =
    'TOO_MANY_ESCROW_CHUNKS';

pub const INVALID_PRIVATE_ESCROW_PAYLOAD_SIZE: felt252 =
    'BAD_ESCROW_PAYLOAD_SIZE';

pub const PRIVATE_ESCROW_PAYLOAD_COMMITMENT_MISMATCH: felt252 =
    'ESCROW_COMMIT_MISMATCH';

pub const PRIVATE_ESCROW_ACTION_LOCATOR_ALREADY_USED: felt252 =
    'ESCROW_LOCATOR_USED';

pub const PRIVATE_ESCROW_PAYLOAD_ALREADY_COMMITTED: felt252 =
    'ESCROW_PAYLOAD_USED';

pub const PRIVATE_ESCROW_ACTION_NOT_FOUND: felt252 =
    'ESCROW_ACTION_NOT_FOUND';

pub const PRIVATE_ESCROW_CHUNK_INDEX_OUT_OF_BOUNDS: felt252 =
    'ESCROW_CHUNK_OOB';

// -----------------------------------------------------------------------------
// Existing settlement and escrow errors
//
// Keep these until their respective modules are audited and replaced.
// -----------------------------------------------------------------------------

pub const ZERO_NOTE_ID: felt252 = 'ZERO_NOTE_ID';
pub const ZERO_TOKEN: felt252 = 'ZERO_TOKEN';
pub const ZERO_AMOUNT: felt252 = 'ZERO_AMOUNT';
pub const SETTLEMENT_REPLAY: felt252 = 'SETTLEMENT_REPLAY';
pub const BALANCE_TOO_LOW: felt252 = 'BALANCE_TOO_LOW';
pub const INVALID_SETTLEMENT_COMMITMENT: felt252 = 'BAD_SETTLEMENT';
