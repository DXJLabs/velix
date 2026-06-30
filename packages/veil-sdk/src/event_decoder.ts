import { PRIVACY_POOL_EVENT_ABI } from "./privacy_pool_abi";

export type Felt = string;

export interface StarknetAbiMember {
  name: string;
  type: string;
  kind?: "key" | "data" | "nested" | string;
}

export interface StarknetAbiEntry {
  type: string;
  name?: string;
  kind?: string;
  selector?: string;
  members?: readonly StarknetAbiMember[];
  inputs?: readonly StarknetAbiMember[];
  outputs?: readonly StarknetAbiMember[];
}

export type StarknetAbi = readonly StarknetAbiEntry[];

export interface RawStarknetEvent {
  from_address?: Felt;
  keys?: Felt[];
  data?: Felt[];
  transaction_hash?: Felt;
  block_number?: number;
}

export interface DecodedEventField {
  name: string;
  value: Felt;
  source: "key" | "data" | "selector" | "unknown";
  type?: string;
}

export type DecodedEventCategory = "channel" | "note" | "invoke_external" | "timeline" | "unknown";

export interface DecodedPrivacyPoolEvent {
  name: string;
  category: DecodedEventCategory;
  contractAddress?: Felt;
  selector?: Felt;
  fields: DecodedEventField[];
  raw: RawStarknetEvent;
  confidence: "abi" | "helper-shape" | "heuristic" | "raw";
}

export interface DecodeEventOptions {
  abi?: StarknetAbi;
  helperAddress?: Felt;
  privacyPoolAddress?: Felt;
}

const TIMELINE_EVENT_TYPE_NAMES: Record<string, string> = {
  "1": "CHAT",
  "2": "PAYMENT_MEMO",
  "3": "OFFER",
  "4": "COUNTER_OFFER",
  "5": "ACCEPT_OFFER",
  "6": "REJECT_OFFER",
  "7": "ESCROW_CREATED",
  "8": "ESCROW_DEPOSITED",
  "9": "ESCROW_SETTLED",
  "10": "ESCROW_CANCELLED",
  "11": "PROOF_ATTACHED",
};

export function decodeChannelEvent(
  event: RawStarknetEvent,
  options: DecodeEventOptions = {},
): DecodedPrivacyPoolEvent | null {
  return decodeNamedEvent(event, "channel", options);
}

export function decodeNoteEvent(
  event: RawStarknetEvent,
  options: DecodeEventOptions = {},
): DecodedPrivacyPoolEvent | null {
  return decodeNamedEvent(event, "note", options);
}

export function decodeInvokeExternalEvent(
  event: RawStarknetEvent,
  options: DecodeEventOptions = {},
): DecodedPrivacyPoolEvent | null {
  const abiDecoded = decodeNamedEvent(event, "invoke", options) ?? decodeNamedEvent(event, "external", options);
  if (abiDecoded) {
    return { ...abiDecoded, category: "invoke_external" };
  }

  const keys = event.keys ?? [];
  const data = event.data ?? [];
  const fromHelper = options.helperAddress ? sameFelt(event.from_address, options.helperAddress) : false;
  if ((fromHelper || keys.length >= 4) && keys.length >= 4 && data.length >= 4) {
    const eventType = feltToDecimal(keys[2] ?? "");
    const eventTypeName = eventType ? TIMELINE_EVENT_TYPE_NAMES[eventType] : undefined;
    const fields: DecodedEventField[] = [
      { name: "event_selector", value: keys[0] ?? "", source: "selector" },
      { name: "channel_id", value: keys[1] ?? "", source: "key", type: "felt252" },
      { name: "event_type", value: keys[2] ?? "", source: "key", type: eventTypeName ?? "felt252" },
      { name: "event_id", value: keys[3] ?? "", source: "key", type: "felt252" },
      { name: "encrypted_payload", value: data[0] ?? "", source: "data", type: "felt252" },
      { name: "payload_hash", value: data[1] ?? "", source: "data", type: "felt252" },
      { name: "payload_chunk_count", value: data[2] ?? "", source: "data", type: "u64" },
      { name: "created_at", value: data[3] ?? "", source: "data", type: "u64" },
    ];

    const decoded: DecodedPrivacyPoolEvent = {
      name: "TimelineEventStored",
      category: "timeline",
      fields,
      raw: event,
      confidence: fromHelper ? "helper-shape" : "heuristic",
    };
    if (event.from_address) decoded.contractAddress = event.from_address;
    if (keys[0]) decoded.selector = keys[0];
    return decoded;
  }

  if ((fromHelper || keys.length >= 4) && keys.length >= 4 && data.length === 1) {
    const decoded: DecodedPrivacyPoolEvent = {
      name: "TimelinePayloadChunkStored",
      category: "timeline",
      fields: [
        { name: "event_selector", value: keys[0] ?? "", source: "selector" },
        { name: "channel_id", value: keys[1] ?? "", source: "key", type: "felt252" },
        { name: "event_id", value: keys[2] ?? "", source: "key", type: "felt252" },
        { name: "chunk_index", value: keys[3] ?? "", source: "key", type: "u64" },
        { name: "chunk", value: data[0] ?? "", source: "data", type: "felt252" },
      ],
      raw: event,
      confidence: fromHelper ? "helper-shape" : "heuristic",
    };
    if (event.from_address) decoded.contractAddress = event.from_address;
    if (keys[0]) decoded.selector = keys[0];
    return decoded;
  }

  return null;
}

export function decodePrivacyPoolEvent(
  event: RawStarknetEvent,
  options: DecodeEventOptions = {},
): DecodedPrivacyPoolEvent {
  const knownEvent =
    decodeInvokeExternalEvent(event, options) ??
    decodeChannelEvent(event, options) ??
    decodeNoteEvent(event, options) ??
    decodeEventByShape(event, options);
  if (knownEvent) {
    return knownEvent;
  }

  const keys = event.keys ?? [];
  const data = event.data ?? [];
  const decoded: DecodedPrivacyPoolEvent = {
    name: "UnknownEvent",
    category: "unknown",
    fields: [
      ...keys.map((value, index) => ({
        name: index === 0 ? "event_selector" : `key_${index}`,
        value,
        source: index === 0 ? ("selector" as const) : ("key" as const),
      })),
      ...data.map((value, index) => ({
        name: `data_${index}`,
        value,
        source: "data" as const,
      })),
    ],
    raw: event,
    confidence: "raw",
  };
  if (event.from_address) decoded.contractAddress = event.from_address;
  if (keys[0]) decoded.selector = keys[0];
  return decoded;
}

function decodeNamedEvent(
  event: RawStarknetEvent,
  nameHint: string,
  options: DecodeEventOptions,
): DecodedPrivacyPoolEvent | null {
  const abiEntry = findAbiEvent(event, options.abi ?? PRIVACY_POOL_EVENT_ABI, nameHint);
  if (!abiEntry) {
    return null;
  }

  const fields = decodeFieldsWithAbi(event, abiEntry);
  const decoded: DecodedPrivacyPoolEvent = {
    name: abiEntry.name ?? `${nameHint}_event`,
    category: categoryFromName(abiEntry.name ?? nameHint),
    fields,
    raw: event,
    confidence: "abi",
  };
  if (event.from_address) decoded.contractAddress = event.from_address;
  if (event.keys?.[0]) decoded.selector = event.keys[0];
  return decoded;
}

function decodeEventByShape(
  event: RawStarknetEvent,
  options: DecodeEventOptions,
): DecodedPrivacyPoolEvent | null {
  const abi = options.abi ?? PRIVACY_POOL_EVENT_ABI;
  const eventKeys = Math.max(0, (event.keys?.length ?? 0) - 1);
  const eventData = event.data?.length ?? 0;
  const candidates = abi.filter((entry) => {
    if (entry.type !== "event" || entry.kind !== "struct") {
      return false;
    }
    const members = entry.members ?? [];
    const keyCount = members.filter((member) => member.kind === "key").length;
    const dataCount = members.filter((member) => member.kind !== "key").length;
    return keyCount === eventKeys && dataCount === eventData;
  });

  if (candidates.length === 0) {
    return null;
  }

  const ranked = [...candidates].sort((left, right) => {
    const leftScore = scoreEventCandidate(left.name ?? "");
    const rightScore = scoreEventCandidate(right.name ?? "");
    return rightScore - leftScore;
  });
  const best = ranked[0];
  if (!best) {
    return null;
  }

  const decoded: DecodedPrivacyPoolEvent = {
    name: candidates.length === 1 ? (best.name ?? "PrivacyPoolEvent") : `Possible ${best.name ?? "PrivacyPoolEvent"}`,
    category: categoryFromName(best.name ?? "privacy_pool_event"),
    fields: decodeFieldsWithAbi(event, best),
    raw: event,
    confidence: "heuristic",
  };
  if (event.from_address) decoded.contractAddress = event.from_address;
  if (event.keys?.[0]) decoded.selector = event.keys[0];
  return decoded;
}

function findAbiEvent(
  event: RawStarknetEvent,
  abi: StarknetAbi | undefined,
  nameHint: string,
): StarknetAbiEntry | null {
  if (!abi) {
    return null;
  }

  const selector = event.keys?.[0];
  const entries = abi.filter((entry) => entry.type === "event" || entry.type === "struct");
  const bySelector = selector
    ? entries.find((entry) => entry.selector && sameFelt(entry.selector, selector))
    : undefined;
  if (bySelector) {
    return bySelector;
  }

  const normalizedHint = nameHint.toLowerCase();
  return entries.find((entry) => (entry.name ?? "").toLowerCase().includes(normalizedHint)) ?? null;
}

function decodeFieldsWithAbi(event: RawStarknetEvent, abiEntry: StarknetAbiEntry): DecodedEventField[] {
  const keys = [...(event.keys ?? [])];
  const data = [...(event.data ?? [])];
  const members = abiEntry.members ?? [];
  const fields: DecodedEventField[] = [];

  if (keys[0]) {
    fields.push({ name: "event_selector", value: keys.shift() ?? "", source: "selector" });
  }

  let keyIndex = 0;
  let dataIndex = 0;
  for (const member of members) {
    const source: DecodedEventField["source"] = member.kind === "key" ? "key" : "data";
    const value = source === "key" ? keys[keyIndex++] : data[dataIndex++];
    if (value === undefined) {
      continue;
    }
    const field: DecodedEventField = { name: member.name, value, source };
    if (member.type) field.type = member.type;
    fields.push(field);
  }

  keys.slice(keyIndex).forEach((value, index) => {
    fields.push({ name: `key_${index + keyIndex + 1}`, value, source: "key" });
  });
  data.slice(dataIndex).forEach((value, index) => {
    fields.push({ name: `data_${index + dataIndex}`, value, source: "data" });
  });

  return fields;
}

function categoryFromName(name: string): DecodedEventCategory {
  const normalized = name.toLowerCase();
  if (normalized.includes("channel")) return "channel";
  if (
    normalized.includes("note") ||
    normalized.includes("deposit") ||
    normalized.includes("withdrawal") ||
    normalized.includes("nullifier")
  ) {
    return "note";
  }
  if (normalized.includes("invoke") || normalized.includes("external")) return "invoke_external";
  if (normalized.includes("timeline")) return "timeline";
  return "unknown";
}

function scoreEventCandidate(name: string): number {
  const normalized = name.toLowerCase();
  if (normalized.includes("note") || normalized.includes("deposit") || normalized.includes("withdrawal")) return 10;
  if (normalized.includes("viewing")) return 8;
  if (normalized.includes("fee")) return 2;
  return 0;
}

function feltToDecimal(value: Felt): string | null {
  try {
    return BigInt(value).toString(10);
  } catch {
    return null;
  }
}

function normalizeFelt(value: Felt | undefined): string | null {
  if (!value) return null;
  try {
    return `0x${BigInt(value).toString(16)}`;
  } catch {
    return value.toLowerCase();
  }
}

function sameFelt(left: Felt | undefined, right: Felt | undefined): boolean {
  const normalizedLeft = normalizeFelt(left);
  const normalizedRight = normalizeFelt(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}
