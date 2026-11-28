import { describe, expect, it } from "bun:test";
import { createExecutionContextFrom } from "../../src/system/tool-helpers";

// What a plugin's create check, interceptor or upload saver learns about
// the caller of system_create.
describe("the create execution context", () => {
  it("names the conversation and channel the tool was called in", () => {
    expect(
      createExecutionContextFrom({
        interfaceType: "discord",
        actor: { kind: "user", userId: "usr_1" },
        userPermissionLevel: "trusted",
        conversationId: "discord-general",
        channelId: "discord:guild:general",
        channelName: "general",
      }),
    ).toEqual({
      interfaceType: "discord",
      actor: { kind: "user", userId: "usr_1" },
      userPermissionLevel: "trusted",
      conversationId: "discord-general",
      channelId: "discord:guild:general",
      channelName: "general",
    });
  });

  it("names neither when the tool was called outside a conversation", () => {
    expect(
      createExecutionContextFrom({
        interfaceType: "mcp",
        actor: { kind: "service", serviceId: "agent" },
      }),
    ).toEqual({
      interfaceType: "mcp",
      actor: { kind: "service", serviceId: "agent" },
      userPermissionLevel: "public",
    });
  });
});
