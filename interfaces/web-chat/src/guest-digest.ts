import { sha256Hex } from "@brains/utils/hash";

/** One key for several parts, which no choice of parts can make collide. */
export function digest(...parts: string[]): string {
  return sha256Hex(JSON.stringify(parts));
}
