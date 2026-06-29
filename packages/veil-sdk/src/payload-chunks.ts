const CHUNK_BYTES = 31;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`;
  return Uint8Array.from(normalized.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

export function stringToFeltChunks(value: string): string[] {
  const bytes = textEncoder.encode(value);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
    const chunk = bytes.slice(offset, offset + CHUNK_BYTES);
    chunks.push(BigInt(`0x${bytesToHex(chunk)}`).toString());
  }
  return chunks;
}

export function feltChunksToString(chunks: readonly string[]): string {
  const bytes = chunks.flatMap((chunk) => [...hexToBytes(BigInt(chunk).toString(16))]);
  return textDecoder.decode(Uint8Array.from(bytes));
}
