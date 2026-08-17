import { describe, expect, it } from "bun:test";
import {
  GIT_NON_INTERACTIVE_ENV,
  buildGitCredentialEnv,
} from "../../../src/lib/broker/git-credentials";

/**
 * Safety invariant 6: a token never enters `.git/config`, argv, socket
 * messages, journals, errors, or logs. Git offers four places to put a
 * credential — the URL on the command line, the repository config, a helper
 * executable, or config supplied through the environment — and only the last
 * is neither durable, world-readable, nor an added runtime dependency.
 */

const TOKEN = "ghp_exampletoken0123456789";
const REMOTE = "https://github.com/rizom-ai/content.git";

/** The Git configuration these variables actually carry. */
function configPairs(env: Record<string, string>): Map<string, string> {
  const count = Number(env["GIT_CONFIG_COUNT"] ?? "0");
  return new Map(
    Array.from({ length: count }, (_, index) => [
      env[`GIT_CONFIG_KEY_${index}`] ?? "",
      env[`GIT_CONFIG_VALUE_${index}`] ?? "",
    ]),
  );
}

describe("git credentials", () => {
  it("supplies an authorization header rather than a credential in a URL", () => {
    const pairs = configPairs(buildGitCredentialEnv(REMOTE, TOKEN));

    expect(pairs.get(`http.${REMOTE}.extraheader`)).toBe(
      `Authorization: Basic ${Buffer.from(`x-access-token:${TOKEN}`).toString("base64")}`,
    );
  });

  it("never puts the token itself in a variable", () => {
    // Base64 is not secrecy — the point is that no variable, argument, or
    // config entry holds a value a reader could lift verbatim.
    const env = buildGitCredentialEnv(REMOTE, TOKEN);

    expect(Object.values(env).join("\n")).not.toContain(TOKEN);
  });

  it("carries no authorization when there is no token to supply", () => {
    // The helper reset still applies: having no token of our own is not a
    // reason to let an ambient one answer instead.
    for (const token of [undefined, ""]) {
      const pairs = configPairs(buildGitCredentialEnv(REMOTE, token));
      expect([...pairs.keys()]).not.toContain(`http.${REMOTE}.extraheader`);
      expect(pairs.get("credential.helper")).toBe("");
    }
  });

  it("adds no authorization for transports that carry their own", () => {
    // SSH and file:// authenticate outside Git's HTTP layer, so an HTTP header
    // would be both useless and a place for a token to sit.
    for (const remote of [
      "git@github.com:rizom-ai/content.git",
      "file:///srv/content.git",
      "ssh://git@github.com/rizom-ai/content.git",
    ]) {
      const pairs = configPairs(buildGitCredentialEnv(remote, TOKEN));
      expect([...pairs.keys()].join(" ")).not.toContain("extraheader");
      expect(pairs.get("credential.helper")).toBe("");
    }
  });

  it("refuses to wait on a terminal that is not there", () => {
    // A broker has no one to prompt. Without this a bad credential hangs the
    // checkout turn until the stall deadline instead of failing outright.
    expect(GIT_NON_INTERACTIVE_ENV["GIT_TERMINAL_PROMPT"]).toBe("0");
    expect(buildGitCredentialEnv(REMOTE, TOKEN)["GIT_TERMINAL_PROMPT"]).toBe(
      "0",
    );
  });
});
