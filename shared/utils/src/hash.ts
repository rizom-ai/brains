import { createHash } from "node:crypto";

/** Stable SHA-256 encoding for persisted lookup keys and content hashes. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Stable URL-safe SHA-256 encoding for persisted token and secret hashes. */
export function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

/**
 * Compute SHA256 hash of content
 * Used for change detection in entities
 */
export function computeContentHash(content: string): string {
  return sha256Hex(content);
}
