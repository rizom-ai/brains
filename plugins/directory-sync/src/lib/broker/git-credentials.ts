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

/**
 * Configuration every managed Git process runs under.
 *
 * Hooks are arbitrary code the broker did not sanction, running inside the
 * checkout turn and inside the process group the supervisor may be about
 * to prove empty: a hook can hold the turn indefinitely, or detach and
 * outlive the group. Automatic maintenance can do the same by forking work
 * that outlasts the command that triggered it. Neither can escape what
 * never runs.
 */
export const MANAGED_GIT_CONFIG: ReadonlyArray<readonly [string, string]> = [
  ["core.hooksPath", "/dev/null"],
  ["maintenance.auto", "false"],
];

/**
 * The same rules as `-c` arguments, for `simple-git`.
 *
 * `simple-git` refuses `core.hooksPath` unless `allowUnsafeHooksPath` is set.
 * That guard is aimed at callers *pointing* hooks somewhere attacker-owned;
 * this points them at nothing, which is the direction the guard exists to
 * protect. Passing them as env config instead is not an option there: a
 * replaced child environment trips a separate guard on inherited variables.
 */
export const MANAGED_GIT_CONFIG_ARGS: string[] = MANAGED_GIT_CONFIG.map(
  ([key, value]) => `${key}=${value}`,
);

export function buildGitCredentialEnv(
  remoteUrl: string,
  token: string | undefined,
): Record<string, string> {
  // Always reset the helper chain. An ambient helper — a user keychain, a
  // cached store — could answer for the broker from somewhere this process
  // never chose, which is a credential nobody here can account for.
  const config: Array<[string, string]> = [
    ["credential.helper", ""],
    ...MANAGED_GIT_CONFIG.map(([key, value]): [string, string] => [key, value]),
  ];

  // SSH and file:// authenticate outside Git's HTTP layer, so an HTTP header
  // would be both useless and one more place for a token to sit.
  if (token && remoteUrl.startsWith("https://")) {
    const authorization = Buffer.from(`x-access-token:${token}`).toString(
      "base64",
    );
    config.push([
      `http.${remoteUrl}.extraheader`,
      `Authorization: Basic ${authorization}`,
    ]);
  }

  return {
    ...GIT_NON_INTERACTIVE_ENV,
    GIT_CONFIG_COUNT: String(config.length),
    ...Object.fromEntries(
      config.flatMap(([key, value], index) => [
        [`GIT_CONFIG_KEY_${index}`, key],
        [`GIT_CONFIG_VALUE_${index}`, value],
      ]),
    ),
  };
}
