/**
 * A Buffer over the same memory as `bytes`, for the Node APIs that need one.
 * Contracts carry `Uint8Array`, so crossing back to a Buffer copies nothing.
 */
export function bufferView(bytes: Uint8Array): Buffer {
  return Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** A `data:` URL carrying `bytes` base64-encoded. */
export function toDataUrl(mediaType: string, bytes: Uint8Array): string {
  return `data:${mediaType};base64,${bufferView(bytes).toString("base64")}`;
}
