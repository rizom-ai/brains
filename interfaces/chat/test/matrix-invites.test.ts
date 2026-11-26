import { describe, expect, it } from "bun:test";
import { matrixInviteDecision } from "../src/matrix-invites";

const trust = {
  getA2APeerTrust: async (
    domain: string,
  ): Promise<{ grantedLevel: "trusted" | "public" } | undefined> =>
    domain === "host.example" ? { grantedLevel: "trusted" } : undefined,
};

function decide(
  invite: { inviter: string | undefined; isDirect: boolean },
  options: { allowDMs?: boolean; withAuth?: boolean } = {},
): Promise<boolean> {
  return matrixInviteDecision({
    allowDMs: options.allowDMs ?? true,
    peerTrust: () => (options.withAuth === false ? undefined : trust),
  })({ roomID: "!r:host.example", ...invite });
}

describe("which Matrix invites the bot accepts", () => {
  it("accepts a direct invite from anyone while DMs are allowed", async () => {
    expect(
      await decide({ inviter: "@alice:other.example", isDirect: true }),
    ).toBe(true);
    expect(
      await decide(
        { inviter: "@alice:other.example", isDirect: true },
        { allowDMs: false },
      ),
    ).toBe(false);
  });

  it("accepts a room invite from a trusted peer's bot", async () => {
    expect(
      await decide({ inviter: "@_brain:host.example", isDirect: false }),
    ).toBe(true);
  });

  it("declines a room invite from a person on a trusted peer's server", async () => {
    expect(
      await decide({ inviter: "@alice:host.example", isDirect: false }),
    ).toBe(false);
  });

  it("declines a room invite from a bot on an untrusted server", async () => {
    expect(
      await decide({ inviter: "@_brain:stranger.example", isDirect: false }),
    ).toBe(false);
  });

  it("declines room invites when the brain runs no auth to ask", async () => {
    expect(
      await decide(
        { inviter: "@_brain:host.example", isDirect: false },
        { withAuth: false },
      ),
    ).toBe(false);
  });

  it("declines an invite with no inviter", async () => {
    expect(await decide({ inviter: undefined, isDirect: false })).toBe(false);
  });
});
