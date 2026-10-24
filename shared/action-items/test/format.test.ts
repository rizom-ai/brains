import { describe, expect, it } from "bun:test";
import { channelLabel, formatAge } from "../src";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();

describe("formatAge", () => {
  it("says now under a minute", () => {
    expect(formatAge(ago(20_000), NOW)).toBe("now");
  });

  it("counts minutes, hours, then days", () => {
    expect(formatAge(ago(5 * 60_000), NOW)).toBe("5m");
    expect(formatAge(ago(2 * 3_600_000), NOW)).toBe("2h");
    expect(formatAge(ago(3 * 86_400_000), NOW)).toBe("3d");
  });
});

describe("channelLabel", () => {
  const discord = "discord:1431946567438569534:1466324999475429386";

  it("names a channel by its name", () => {
    expect(channelLabel("executive-room", discord)).toBe("#executive-room");
  });

  it("never shows a chat app's composite channel id, naming the app instead", () => {
    expect(channelLabel(undefined, discord)).toBe("Discord");
    // Cards stored before channel names were resolved carry the id as name.
    expect(channelLabel(discord, discord)).toBe("Discord");
  });

  it("keeps a plain channel id when there is no name", () => {
    expect(channelLabel(undefined, "cli-terminal")).toBe("#cli-terminal");
  });
});
