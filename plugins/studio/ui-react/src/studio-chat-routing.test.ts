import { describe, expect, it } from "bun:test";
import { studioChatWorkspacePath } from "../../src/chat-workspace";
import { studioChatSessionId } from "./App";

describe("Studio Chat browser routing", () => {
  it("round-trips one bounded conversation id through canonical query state", () => {
    const href = studioChatWorkspacePath("/studio", "conversation/one");
    const search = new URL(href, "https://brains.invalid").search;

    expect(href).toBe(
      "/studio/workspaces/web-chat%3Achat?session=conversation%2Fone",
    );
    expect(studioChatSessionId(search)).toBe("conversation/one");
  });

  it("rejects empty and oversized session routing state", () => {
    expect(studioChatSessionId("?session=%20")).toBeNull();
    expect(studioChatSessionId(`?session=${"x".repeat(257)}`)).toBeNull();
  });
});
