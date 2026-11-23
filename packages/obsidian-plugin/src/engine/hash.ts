/**
 * SHA-256 of bytes, as lowercase hex, with the Web Crypto API: it is in
 * Obsidian's desktop and mobile apps, and in Bun for the tests.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function textOf(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function bytesOf(text: string): Uint8Array {
  return encoder.encode(text);
}

export function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index])
  );
}
