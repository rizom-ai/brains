/**
 * How a credential reaches Git without becoming durable or readable.
 *
 * Git takes configuration from the environment as `GIT_CONFIG_COUNT` plus a
 * numbered key/value pair each, which applies to one process and its children
 * and is written nowhere. The alternatives all fail safety invariant 6:
 *
 * - a credential in the remote URL lands in `.git/config`, inside the checkout
 *   that then gets cloned, backed up, and synced;
 * - the same URL passed as an argument lands in argv, which any process on the
 *   host can read through `/proc/<pid>/cmdline`;
 * - a credential helper or askpass means shipping an executable, which the
 *   plan rules out as an ambient runtime dependency.
 *
 * Base64 here is Git's Basic-auth encoding, not secrecy. What it buys is that
 * the credential is supplied per invocation and disappears with the process.
 */

/**
 * A broker has no one to prompt. Without this a bad credential blocks on a
 * terminal that is not there, holding the checkout turn until the stall
 * deadline instead of failing outright.
 */
export const GIT_NON_INTERACTIVE_ENV: Readonly<Record<string, string>> = {
  GIT_TERMINAL_PROMPT: "0",
};

export function buildGitCredentialEnv(
  remoteUrl: string,
  token: string | undefined,
): Record<string, string> {
  const base = { ...GIT_NON_INTERACTIVE_ENV };
  // SSH and file:// authenticate outside Git's HTTP layer, so an HTTP header
  // would be both useless and one more place for a token to sit.
  if (!token || !remoteUrl.startsWith("https://")) return base;

  const authorization = Buffer.from(`x-access-token:${token}`).toString(
    "base64",
  );
  return {
    ...base,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: `http.${remoteUrl}.extraheader`,
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${authorization}`,
  };
}
