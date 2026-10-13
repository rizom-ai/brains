import { describe, expect, it } from "bun:test";
import {
  createStudioChatHandoffState,
  readStudioChatHandoffState,
} from "../../src/chat-handoff-contract";

describe("semantic operator launches", () => {
  it("creates and bounds native Studio Chat handoff state", () => {
    const state = createStudioChatHandoffState(
      "mail-items",
      "mail-1",
      "Time-sensitive request",
    );

    expect(readStudioChatHandoffState(state)).toEqual({
      sourceId: "mail-items",
      itemId: "mail-1",
      label: "Time-sensitive request",
      prompt: "Help me understand this Inbox item and decide what to do next.",
    });
    expect(
      readStudioChatHandoffState({
        studioChatHandoff: {
          ...state.studioChatHandoff,
          sourceId: "../../private",
        },
      }),
    ).toBeNull();
  });
});
