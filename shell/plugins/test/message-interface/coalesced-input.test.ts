import { describe, expect, it } from "bun:test";
import { buildCoalescedInput } from "../../src/message-interface/coalesced-input";

describe("buildCoalescedInput", () => {
  it("returns the original message when no messages were skipped", () => {
    expect(
      buildCoalescedInput({
        message: "latest request",
        skippedMessages: [],
      }),
    ).toEqual({ message: "latest request" });
  });

  it("formats skipped messages as context for the latest message", () => {
    expect(
      buildCoalescedInput({
        message: "actually, save the latest version",
        skippedMessages: [
          { id: "msg-1", text: "save the first draft", authorName: "Mira" },
          { id: "msg-2", text: "wait, use the second", authorName: "Mira" },
        ],
      }),
    ).toEqual({
      message:
        "Messages received while the previous response was still running (oldest first, for context only):\n" +
        "- Mira: save the first draft\n" +
        "- Mira: wait, use the second\n" +
        "\n" +
        "Latest message to answer:\n" +
        "actually, save the latest version",
      metadata: {
        supersededMessageCount: 2,
        supersededMessageIds: ["msg-1", "msg-2"],
      },
    });
  });

  it("keeps count even when skipped message ids are unavailable", () => {
    expect(
      buildCoalescedInput({
        message: "latest",
        skippedMessages: [{ text: "first" }, { id: "msg-2", text: "second" }],
      }).metadata,
    ).toEqual({
      supersededMessageCount: 2,
      supersededMessageIds: ["msg-2"],
    });
  });
});
