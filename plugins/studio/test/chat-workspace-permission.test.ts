import { describe, expect, it } from "bun:test";
import { listBuiltInStudioChatWorkspaces } from "../src/chat-workspace";

/**
 * Who may open Chat inside Studio.
 *
 * Public, not trusted. Studio's own door already requires an active session,
 * so "public" here means every signed-in visitor rather than everyone on the
 * internet — and Chat is the surface a visitor has least reason to be shut
 * out of. The trusted gate predated that and gated twice.
 */

describe("the built-in Studio Chat workspace", () => {
  it("is offered to every permission level", () => {
    for (const level of ["public", "trusted", "admin"] as const) {
      const [workspace] = listBuiltInStudioChatWorkspaces(level, "/api/chat");
      expect(workspace?.id, level).toBe("web-chat:chat");
      expect(workspace?.permission, level).toBe("public");
    }
  });

  it("is absent when no chat API is configured", () => {
    // Nothing to open: the workspace renders against a chat endpoint, and
    // offering a door onto one that is not mounted is worse than no door.
    expect(listBuiltInStudioChatWorkspaces("admin", undefined)).toEqual([]);
  });
});
