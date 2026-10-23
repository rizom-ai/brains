import { describe, expect, it } from "bun:test";
import { spaceNoticeRequestSchema } from "../src";

function notice(cards: number, value = "card"): unknown {
  return {
    channelId: "discord:guild-1:1466",
    interfaceType: "discord",
    title: "Added to the board",
    lines: Array.from({ length: cards }, (_, index) => `Card ${index + 1}`),
    actions: Array.from({ length: cards }, (_, index) => ({
      label: `Undo: Card ${index + 1}`,
      value: `${value}-${index + 1}`,
    })),
    actionChannel: "conversation-memory:channel-notice-action",
    reactions: [],
  };
}

describe("space notice requests", () => {
  it("accepts a note of up to ten lines and buttons", () => {
    expect(spaceNoticeRequestSchema.safeParse(notice(10)).success).toBe(true);
  });

  it("refuses more than Discord can show in one message", () => {
    expect(spaceNoticeRequestSchema.safeParse(notice(11)).success).toBe(false);
  });

  it("refuses a button value Discord cannot carry", () => {
    // Discord's custom_id holds the action id, a newline and the value: 100.
    expect(
      spaceNoticeRequestSchema.safeParse(notice(1, "x".repeat(80))).success,
    ).toBe(true);
    expect(
      spaceNoticeRequestSchema.safeParse(notice(1, "x".repeat(81))).success,
    ).toBe(false);
  });
});
