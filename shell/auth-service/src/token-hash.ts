import { sha256Base64Url } from "@brains/utils/hash";

/**
 * The stored form of a bearer secret the runtime database keeps only as a
 * hash: session and refresh tokens, authorization codes, client secrets and
 * WebAuthn challenges.
 */
export function hashToken(token: string): string {
  return sha256Base64Url(token);
}
