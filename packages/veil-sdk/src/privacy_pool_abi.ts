export const PRIVACY_POOL_CLIENT_ACTIONS = [
  {
    variant: 0,
    name: "SetViewingKey",
    fields: [{ name: "random", type: "felt252" }],
  },
  {
    variant: 1,
    name: "OpenChannel",
    fields: [
      { name: "recipient_addr", type: "ContractAddress" },
      { name: "index", type: "u32" },
      { name: "random", type: "felt252" },
      { name: "salt", type: "felt252" },
    ],
  },
  {
    variant: 2,
    name: "OpenSubchannel",
    fields: [
      { name: "recipient_addr", type: "ContractAddress" },
      { name: "recipient_public_key", type: "felt252" },
      { name: "channel_key", type: "felt252" },
      { name: "index", type: "u32" },
      { name: "token", type: "ContractAddress" },
      { name: "salt", type: "felt252" },
    ],
  },
  {
    variant: 3,
    name: "CreateEncNote",
    fields: [
      { name: "recipient_addr", type: "ContractAddress" },
      { name: "recipient_public_key", type: "felt252" },
      { name: "token", type: "ContractAddress" },
      { name: "amount", type: "u128" },
      { name: "index", type: "u32" },
      { name: "salt", type: "u128" },
    ],
  },
  {
    variant: 4,
    name: "CreateOpenNote",
    fields: [
      { name: "recipient_addr", type: "ContractAddress" },
      { name: "recipient_public_key", type: "felt252" },
      { name: "token", type: "ContractAddress" },
      { name: "index", type: "u32" },
      { name: "random", type: "felt252" },
    ],
  },
  {
    variant: 5,
    name: "Deposit",
    fields: [
      { name: "token", type: "ContractAddress" },
      { name: "amount", type: "u128" },
    ],
  },
  {
    variant: 6,
    name: "UseNote",
    fields: [
      { name: "channel_key", type: "felt252" },
      { name: "token", type: "ContractAddress" },
      { name: "index", type: "u32" },
    ],
  },
  {
    variant: 7,
    name: "Withdraw",
    fields: [
      { name: "to_addr", type: "ContractAddress" },
      { name: "token", type: "ContractAddress" },
      { name: "amount", type: "u128" },
      { name: "random", type: "felt252" },
    ],
  },
  {
    variant: 8,
    name: "InvokeExternal",
    fields: [
      { name: "contract_address", type: "ContractAddress" },
      { name: "calldata", type: "Span<felt252>" },
    ],
  },
] as const;

export const PRIVACY_POOL_SERVER_ACTIONS = [
  {
    variant: 0,
    name: "WriteOnce",
    fields: [
      { name: "storage_address", type: "felt252" },
      { name: "value", type: "Span<felt252>" },
    ],
  },
  {
    variant: 1,
    name: "Append",
    fields: [
      { name: "recipient_addr", type: "ContractAddress" },
      { name: "ephemeral_pubkey", type: "felt252" },
      { name: "enc_channel_key", type: "felt252" },
      { name: "enc_sender_addr", type: "felt252" },
    ],
  },
  {
    variant: 2,
    name: "TransferFrom",
    fields: [
      { name: "from_addr", type: "ContractAddress" },
      { name: "token", type: "ContractAddress" },
      { name: "amount", type: "u128" },
    ],
  },
  {
    variant: 3,
    name: "TransferTo",
    fields: [
      { name: "to_addr", type: "ContractAddress" },
      { name: "token", type: "ContractAddress" },
      { name: "amount", type: "u128" },
    ],
  },
  { variant: 4, name: "EmitViewingKeySet", fields: [] },
  { variant: 5, name: "EmitWithdrawal", fields: [] },
  { variant: 6, name: "EmitDeposit", fields: [] },
  { variant: 7, name: "EmitOpenNoteCreated", fields: [] },
  { variant: 8, name: "EmitEncNoteCreated", fields: [] },
  { variant: 9, name: "EmitNoteUsed", fields: [] },
  {
    variant: 10,
    name: "Invoke",
    fields: [
      { name: "contract_address", type: "ContractAddress" },
      { name: "calldata", type: "Span<felt252>" },
    ],
  },
] as const;

export const PRIVACY_POOL_EVENT_ABI = [
  {
    type: "event",
    name: "privacy::events::ViewingKeySet",
    kind: "struct",
    members: [
      { name: "user_addr", type: "ContractAddress", kind: "key" },
      { name: "public_key", type: "felt252", kind: "key" },
      { name: "auditor_public_key", type: "felt252", kind: "data" },
      { name: "ephemeral_pubkey", type: "felt252", kind: "data" },
      { name: "enc_private_key", type: "felt252", kind: "data" },
    ],
  },
  {
    type: "event",
    name: "privacy::events::Withdrawal",
    kind: "struct",
    members: [
      { name: "to_addr", type: "ContractAddress", kind: "key" },
      { name: "token", type: "ContractAddress", kind: "key" },
      { name: "auditor_public_key", type: "felt252", kind: "data" },
      { name: "ephemeral_pubkey", type: "felt252", kind: "data" },
      { name: "enc_user_addr", type: "felt252", kind: "data" },
      { name: "amount", type: "u128", kind: "data" },
    ],
  },
  {
    type: "event",
    name: "privacy::events::Deposit",
    kind: "struct",
    members: [
      { name: "user_addr", type: "ContractAddress", kind: "key" },
      { name: "token", type: "ContractAddress", kind: "key" },
      { name: "amount", type: "u128", kind: "data" },
    ],
  },
  {
    type: "event",
    name: "privacy::events::AuditorPublicKeySet",
    kind: "struct",
    members: [{ name: "auditor_public_key", type: "felt252", kind: "data" }],
  },
  {
    type: "event",
    name: "privacy::events::OpenNoteCreated",
    kind: "struct",
    members: [
      { name: "token", type: "ContractAddress", kind: "key" },
      { name: "note_id", type: "felt252", kind: "key" },
      { name: "auditor_public_key", type: "felt252", kind: "data" },
      { name: "ephemeral_pubkey", type: "felt252", kind: "data" },
      { name: "enc_recipient_addr", type: "felt252", kind: "data" },
    ],
  },
  {
    type: "event",
    name: "privacy::events::EncNoteCreated",
    kind: "struct",
    members: [
      { name: "note_id", type: "felt252", kind: "key" },
      { name: "packed_value", type: "felt252", kind: "data" },
    ],
  },
  {
    type: "event",
    name: "privacy::events::OpenNoteDeposited",
    kind: "struct",
    members: [
      { name: "depositor", type: "ContractAddress", kind: "key" },
      { name: "token", type: "ContractAddress", kind: "key" },
      { name: "note_id", type: "felt252", kind: "key" },
      { name: "amount", type: "u128", kind: "data" },
    ],
  },
  {
    type: "event",
    name: "privacy::events::NoteUsed",
    kind: "struct",
    members: [{ name: "nullifier", type: "felt252", kind: "key" }],
  },
  {
    type: "event",
    name: "privacy::events::FeeAmountSet",
    kind: "struct",
    members: [{ name: "fee_amount", type: "u128", kind: "data" }],
  },
  {
    type: "event",
    name: "privacy::events::FeeCollectorSet",
    kind: "struct",
    members: [{ name: "fee_collector", type: "ContractAddress", kind: "data" }],
  },
  {
    type: "event",
    name: "privacy::events::ProofValidityBlocksSet",
    kind: "struct",
    members: [{ name: "proof_validity_blocks", type: "u64", kind: "data" }],
  },
] as const;
