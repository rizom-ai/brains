import { describe, expect, it } from "bun:test";
import {
  GIT_NON_INTERACTIVE_ENV,
  buildGitCredentialEnv,
} from "../../../src/lib/broker/git-credentials";

/**
 * Phase 4 of docs/plans/directory-sync-git-execution-broker.md.
 *
 * Safety invariant 6: a token never enters `.git/config`, argv, socket
 * messages, journals, errors, or logs. Git offers four places to put a
 * credential — the URL on the command line, the repository config, a helper
 * executable, or config supplied through the environment — and only the last
 * is neither durable, world-readable, nor an added runtime dependency.
 */

const TOKEN = "ghp_exampletoken0123456789";
const REMOTE = "https://github.com/rizom-ai/content.git";

describe("git credentials", () => {
  it("supplies an authorization header rather than a credential in a URL", () => {
    const env = buildGitCredentialEnv(REMOTE, TOKEN);

    expect(env["GIT_CONFIG_COUNT"]).toBe("1");
    expect(env["GIT_CONFIG_KEY_0"]).toBe(`http.${REMOTE}.extraheader`);
    expect(env["GIT_CONFIG_VALUE_0"]).toBe(
      `Authorization: Basic ${Buffer.from(`x-access-token:${TOKEN}`).toString("base64")}`,
    );
  });

  it("never puts the token itself in a variable", () => {
    // Base64 is not secrecy — the point is that no variable, argument, or
    // config entry holds a value a reader could lift verbatim.
    const env = buildGitCredentialEnv(REMOTE, TOKEN);

    expect(Object.values(env).join("\n")).not.toContain(TOKEN);
  });

  it("adds nothing when there is no token to supply", () => {
    expect(buildGitCredentialEnv(REMOTE, undefined)).toEqual(
      GIT_NON_INTERACTIVE_ENV,
    );
    expect(buildGitCredentialEnv(REMOTE, "")).toEqual(GIT_NON_INTERACTIVE_ENV);
  });

  it("adds nothing for transports that carry their own credentials", () => {
    // SSH and file:// authenticate outside Git's HTTP layer, so an HTTP header
    // would be both useless and a place for a token to sit.
    for (const remote of [
      "git@github.com:rizom-ai/content.git",
      "file:///srv/content.git",
      "ssh://git@github.com/rizom-ai/content.git",
    ]) {
      expect(buildGitCredentialEnv(remote, TOKEN)).toEqual(
        GIT_NON_INTERACTIVE_ENV,
      );
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
