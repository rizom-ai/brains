import { createHash } from "crypto";

/**
 * Compute SHA256 hash of content
 * Used for change detection in entities
 */
export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
