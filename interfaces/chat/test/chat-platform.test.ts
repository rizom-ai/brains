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

  it("returns undefined for unknown platforms or a null channel", () => {
    expect(parseChatPlatform("slack:team-1:channel-1")).toBeUndefined();
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

  it("leaves short messages and unknown-platform channels intact", () => {
    expect(chunkForChannel("discord:guild-1:channel-1", "hi")).toEqual(["hi"]);
    expect(chunkForChannel("slack:team-1:channel-1", "x".repeat(5000))).toEqual(
      ["x".repeat(5000)],
    );
    expect(chunkForChannel(null, "hi")).toEqual(["hi"]);
  });
});

describe("ownsChatPlatform", () => {
  it("owns Discord only when the Discord adapter is enabled", () => {
    expect(ownsChatPlatform("discord", true)).toBe(true);
    expect(ownsChatPlatform("discord", false)).toBe(false);
  });

  it("does not own other or missing platforms", () => {
    expect(ownsChatPlatform("slack", true)).toBe(false);
    expect(ownsChatPlatform(undefined, true)).toBe(false);
  });
});
