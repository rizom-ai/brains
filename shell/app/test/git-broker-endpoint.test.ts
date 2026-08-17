import { describe, expect, it } from "bun:test";
import { resolveGitBrokerSocket } from "../src/standard-paths";

/**
 * The broker endpoint is a runtime handoff, not a preference. It derives from
 * the Brain instance rather than being configured, because two roles pointed
 * at different sockets means either two owners or none — the one failure the
 * broker exists to remove. So it is resolved here, where environment policy
 * lives, and passed down as explicit config; it is deliberately absent from
 * `brain.yaml`.
 */

describe("git broker endpoint", () => {
  it("is absent when no supervisor assigned one", () => {
    // A Brain without Git starts no broker, so there is nothing to point at
    // and nothing to invent.
    expect(resolveGitBrokerSocket({})).toBeUndefined();
    expect(
      resolveGitBrokerSocket({ BRAIN_GIT_BROKER_SOCKET: "" }),
    ).toBeUndefined();
  });

  it("takes the endpoint its supervisor assigned", () => {
    expect(
      resolveGitBrokerSocket({
        BRAIN_GIT_BROKER_SOCKET: "/opt/brain/.brain-runtime/git-broker.sock",
      }),
    ).toBe("/opt/brain/.brain-runtime/git-broker.sock");
  });

  it("refuses a path a unix socket cannot hold", () => {
    // Silently truncating would leave roles bound to different paths, which is
    // precisely two owners. Failing at boot is the safe direction.
    expect(() =>
      resolveGitBrokerSocket({
        BRAIN_GIT_BROKER_SOCKET: `/${"deeply-nested".repeat(12)}/git-broker.sock`,
      }),
    ).toThrow(/too long/);
  });
});
