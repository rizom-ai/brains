import { describe, expect, it } from "bun:test";
import { createInboxChatPrefillState } from "./operator-launch";

describe("semantic operator launches", () => {
  it("creates only the destination-owned web-chat prefill state", () => {
    expect(
      createInboxChatPrefillState(
        "mail-items",
        "mail-1",
        "Time-sensitive request",
      ),
    ).toEqual({
      webChatPrefill: {
        version: 2,
        text: "Help me understand this Inbox item and decide what to do next.",
        context: {
          sourceId: "mail-items",
          itemId: "mail-1",
          label: "Time-sensitive request",
        },
      },
    });
  });
});
