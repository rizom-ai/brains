import { describe, it, expect } from "bun:test";
import {
  chunkForChannel,
  ownsChatPlatform,
  parseChatPlatform,
} from "../src/chat-platform";

describe("parseChatPlatform", () => {
  it("reads the platform prefix from a channel id", () => {
    expect(parseChatPlatform("discord:guild-1:channel-1:thread-1")).toBe(
      "discord",
    );
  });

  it("recognizes Slack and rejects unknown or null channels", () => {
    expect(parseChatPlatform("slack:team-1:channel-1")).toBe("slack");
    expect(parseChatPlatform("other:team-1:channel-1")).toBeUndefined();
    expect(parseChatPlatform(null)).toBeUndefined();
  });
});

describe("chunkForChannel", () => {
  it("splits long Discord messages under the 2000-char limit", () => {
    const message = "x".repeat(5000);
    const chunks = chunkForChannel("discord:guild-1:channel-1", message);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
    expect(chunks.join("").length).toBe(5000);
  });

  it("uses Slack's 4000-char limit", () => {
    const chunks = chunkForChannel("slack:team-1:channel-1", "x".repeat(5000));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.length).toBe(4000);
    expect(chunks[1]?.length).toBe(1000);
  });

  it("leaves short messages and unknown-platform channels intact", () => {
    expect(chunkForChannel("discord:guild-1:channel-1", "hi")).toEqual(["hi"]);
    expect(chunkForChannel("other:team-1:channel-1", "x".repeat(5000))).toEqual(
      ["x".repeat(5000)],
    );
    expect(chunkForChannel(null, "hi")).toEqual(["hi"]);
  });
});

describe("ownsChatPlatform", () => {
  it("owns each configured chat platform", () => {
    const enabled = new Set(["discord", "slack"] as const);
    expect(ownsChatPlatform("discord", enabled)).toBe(true);
    expect(ownsChatPlatform("slack", enabled)).toBe(true);
  });

  it("does not own disabled, unknown, or missing platforms", () => {
    const discordOnly = new Set(["discord"] as const);
    expect(ownsChatPlatform("slack", discordOnly)).toBe(false);
    expect(ownsChatPlatform("other", discordOnly)).toBe(false);
    expect(ownsChatPlatform(undefined, discordOnly)).toBe(false);
  });
});
