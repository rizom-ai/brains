/**
 * Credential redaction for both broker boundaries.
 *
 * Safety invariant 5 of docs/plans/directory-sync-git-execution-broker.md: no
 * token or authenticated URL may reach the socket path, journal, runtime-state
 * rows, errors, metrics, or logs. Redaction is the last line of that defence —
 * arguments carrying credentials are rejected outright by the protocol — so it
 * is applied on every durable write and every error message rather than at the
 * call sites that happen to remember.
 */

export const REDACTED = "<redacted>";

/** `//user:token@host` — the shape `getAuthenticatedGitUrl` produces. */
const URL_USERINFO = /\/\/[^@/\s]+@/g;

/** `Authorization: Bearer …`, and the `http.extraHeader` form Git accepts. */
const AUTHORIZATION = /(authorization\s*[:=]\s*)(\S+)/gi;

export function redactSecrets(text: string): string {
  return text
    .replace(URL_USERINFO, `//${REDACTED}@`)
    .replace(AUTHORIZATION, `$1${REDACTED}`);
}

/** True when a value carries URL userinfo, which must never cross the socket. */
export function containsUrlCredentials(value: string): boolean {
  return /\/\/[^@/\s]+@/.test(value);
}
