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

export const PRIVACY_POOL_CLIENT_ACTION_PHASES = [
  { phase: 0, action: "SetViewingKey", description: "Register or replace viewing key" },
  { phase: 1, action: "OpenChannel", description: "Open channel to recipient" },
  { phase: 2, action: "OpenSubchannel", description: "Open token-specific subchannel" },
  { phase: 3, action: "Deposit", description: "Deposit tokens into contract" },
  { phase: 4, action: "UseNote", description: "Spend a note and create nullifier" },
  { phase: 5, action: "CreateEncNote", description: "Create encrypted note" },
  { phase: 5, action: "CreateOpenNote", description: "Create open note" },
  { phase: 6, action: "Withdraw", description: "Withdraw tokens" },
  { phase: 7, action: "InvokeExternal", description: "Call external contract" },
] as const;

export const PRIVACY_POOL_CLIENT_FUNCTIONS = [
  {
    name: "__execute__",
    mutability: "external",
    inputs: [{ name: "calls", type: "Array<Call>" }],
    outputs: [],
  },
  {
    name: "compile_and_panic",
    mutability: "external",
    inputs: [
      { name: "user_addr", type: "ContractAddress" },
      { name: "user_private_key", type: "felt252" },
      { name: "client_actions", type: "Span<ClientAction>" },
    ],
    outputs: [],
  },
  {
    name: "compile_actions",
    mutability: "view",
    inputs: [
      { name: "user_addr", type: "ContractAddress" },
      { name: "user_private_key", type: "felt252" },
      { name: "client_actions", type: "Span<ClientAction>" },
    ],
    outputs: [{ type: "Span<ServerAction>" }],
  },
  {
    name: "__validate__",
    mutability: "view",
    inputs: [{ name: "calls", type: "Array<Call>" }],
    outputs: [{ type: "felt252" }],
  },
] as const;

export const PRIVACY_POOL_SERVER_FUNCTIONS = [
  {
    name: "apply_actions",
    mutability: "external",
    inputs: [{ name: "actions", type: "Span<ServerAction>" }],
    outputs: [],
  },
  {
    name: "deposit_to_open_note",
    mutability: "external",
    inputs: [
      { name: "depositor", type: "ContractAddress" },
      { name: "deposit", type: "OpenNoteDeposit" },
    ],
    outputs: [],
  },
] as const;

export const PRIVACY_POOL_VIEW_FUNCTIONS = [
  {
    name: "channel_exists",
    inputs: [{ name: "channel_marker", type: "felt252" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "get_num_of_channels",
    inputs: [{ name: "recipient_addr", type: "ContractAddress" }],
    outputs: [{ type: "u64" }],
  },
  {
    name: "get_channel_info",
    inputs: [
      { name: "recipient_addr", type: "ContractAddress" },
      { name: "channel_index", type: "u64" },
    ],
    outputs: [{ type: "EncChannelInfo" }],
  },
  {
    name: "subchannel_exists",
    inputs: [{ name: "subchannel_marker", type: "felt252" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "get_subchannel_info",
    inputs: [{ name: "subchannel_id", type: "felt252" }],
    outputs: [{ type: "EncSubchannelInfo" }],
  },
  {
    name: "get_outgoing_channel_info",
    inputs: [{ name: "outgoing_channel_id", type: "felt252" }],
    outputs: [{ type: "EncOutgoingChannelInfo" }],
  },
  {
    name: "get_note",
    inputs: [{ name: "note_id", type: "felt252" }],
    outputs: [{ type: "Note" }],
  },
  {
    name: "nullifier_exists",
    inputs: [{ name: "nullifier", type: "felt252" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "get_public_key",
    inputs: [{ name: "user_addr", type: "ContractAddress" }],
    outputs: [{ type: "felt252" }],
  },
  {
    name: "get_enc_private_key",
    inputs: [{ name: "user_addr", type: "ContractAddress" }],
    outputs: [{ type: "EncPrivateKey" }],
  },
  {
    name: "get_auditor_public_key",
    inputs: [],
    outputs: [{ type: "felt252" }],
  },
  {
    name: "get_fee_amount",
    inputs: [],
    outputs: [{ type: "u128" }],
  },
  {
    name: "get_fee_collector",
    inputs: [],
    outputs: [{ type: "ContractAddress" }],
  },
  {
    name: "get_proof_validity_blocks",
    inputs: [],
    outputs: [{ type: "u64" }],
  },
] as const;

export const PRIVACY_POOL_ABI_CAPABILITIES = {
  hasClientActionInvokeExternal: true,
  invokeExternalVariant: 8,
  hasServerActionInvoke: true,
  serverInvokeVariant: 10,
  hasPublicKeyView: true,
  hasEncryptedPrivateKeyView: true,
  hasChannelInfoViews: true,
  hasEncryptedNoteEvents: true,
  hasOpenNoteDepositEvent: true,
  requiresImplementationForEcdh: true,
  requiresOfficialSdkForProductionSubmission: true,
} as const;

export const PRIVACY_POOL_SOURCE_CONSTRAINTS = {
  isAccountContract: true,
  helperEntrypoint: "invoke",
  invokeEntrypointSelectorConstant: "INVOKE_SELECTOR",
  invokeExternalReturns: "Span<OpenNoteDeposit>",
  applyActionsRequiresProofFacts: true,
  clientExecuteCompilesActionsBeforeServerMessage: true,
  validatesUserSignatureBeforeServerMessage: true,
  zeroTipAndResourcePriceRequired: true,
  clientActionPhasesEnforced: true,
  invokeExternalPhase: 7,
  invokeExternalAtMostOncePerTx: true,
  everyClientActionBatchRequiresReplayProtection: true,
  replayProtectionSource: "ServerAction::WriteOnce",
  invokeExternalProvidesReplayProtection: false,
  standaloneInvokeExternalLikelyReverts: true,
  writeOnceGeneratingClientActions: [
    "SetViewingKey",
    "OpenChannel",
    "OpenSubchannel",
    "CreateEncNote",
    "CreateOpenNote",
    "UseNote",
  ],
  channelKeyComputation:
    "compute_channel_key(sender_addr, sender_private_key, recipient_addr, recipient_public_key)",
  openChannelRequiresSenderRegistered: true,
  openChannelRequiresRecipientRegistered: true,
  openChannelRequiresSequentialIndex: true,
  openSubchannelRequiresExistingChannel: true,
  noteCreationRequiresExistingSubchannel: true,
  useNoteWritesNullifier: true,
} as const;

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
