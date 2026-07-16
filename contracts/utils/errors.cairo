// -----------------------------------------------------------------------------
// Shared contract errors
// -----------------------------------------------------------------------------

pub const ZERO_ADDRESS: felt252 = 'ZERO_ADDRESS';

// -----------------------------------------------------------------------------
// Encrypted messaging calldata and envelope validation
// -----------------------------------------------------------------------------

/// Calldata is shorter than the fixed encrypted-message header.
pub const INVALID_MESSAGE_CALLDATA: felt252 = 'BAD_MESSAGE_DATA';

/// Envelope version could not be decoded into the expected Cairo type.
pub const INVALID_ENVELOPE_VERSION: felt252 = 'BAD_ENVELOPE_VER';

/// Envelope version is structurally valid but unsupported by this deployment.
pub const UNSUPPORTED_ENVELOPE_VERSION: felt252 = 'UNSUPPORTED_VER';

/// A one-time message locator must not be zero.
pub const ZERO_MESSAGE_LOCATOR: felt252 = 'ZERO_MSG_LOCATOR';

/// The claimed encrypted-envelope commitment must not be zero.
pub const ZERO_PAYLOAD_COMMITMENT: felt252 = 'ZERO_PAYLOAD_COMMIT';

/// Every stored encrypted message must contain at least one ciphertext chunk.
pub const EMPTY_ENCRYPTED_PAYLOAD: felt252 = 'EMPTY_CIPHERTEXT';

/// The declared ciphertext count could not be decoded.
pub const INVALID_CHUNK_COUNT: felt252 = 'BAD_CHUNK_COUNT';

/// The declared ciphertext count exceeds the protocol maximum.
pub const TOO_MANY_PAYLOAD_CHUNKS: felt252 = 'TOO_MANY_CHUNKS';

/// The exact calldata length does not match the declared ciphertext count.
pub const INVALID_PAYLOAD_SIZE: felt252 = 'BAD_PAYLOAD_SIZE';

/// The contract-computed commitment differs from the claimed commitment.
pub const PAYLOAD_COMMITMENT_MISMATCH: felt252 = 'COMMITMENT_MISMATCH';

// -----------------------------------------------------------------------------
// Encrypted messaging storage and duplicate protection
// -----------------------------------------------------------------------------

/// The one-time locator has already been used by another stored message.
pub const MESSAGE_LOCATOR_ALREADY_USED: felt252 = 'LOCATOR_ALREADY_USED';

/// The encrypted-envelope commitment has already been stored.
pub const PAYLOAD_ALREADY_COMMITTED: felt252 = 'PAYLOAD_ALREADY_USED';

/// No encrypted message exists under the requested locator.
pub const MESSAGE_NOT_FOUND: felt252 = 'MESSAGE_NOT_FOUND';

/// The requested ciphertext chunk index is outside the stored chunk range.
pub const CHUNK_INDEX_OUT_OF_BOUNDS: felt252 = 'CHUNK_OOB';

/// The caller is not the Privacy Pool fixed during helper deployment.
pub const UNAUTHORIZED_PRIVACY_POOL: felt252 = 'NOT_PRIVACY_POOL';

// -----------------------------------------------------------------------------
// Existing non-messaging errors
//
// These remain unchanged until their respective settlement and escrow modules
// are audited.
// -----------------------------------------------------------------------------

pub const ZERO_NOTE_ID: felt252 = 'ZERO_NOTE_ID';
pub const ZERO_TOKEN: felt252 = 'ZERO_TOKEN';
pub const ZERO_AMOUNT: felt252 = 'ZERO_AMOUNT';
pub const SETTLEMENT_REPLAY: felt252 = 'SETTLEMENT_REPLAY';
pub const BALANCE_TOO_LOW: felt252 = 'BALANCE_TOO_LOW';
pub const INVALID_SETTLEMENT_COMMITMENT: felt252 = 'BAD_SETTLEMENT';
