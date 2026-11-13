import { describe, expect, it } from "bun:test";
import { toolExecuteRequestSchema } from "../src";

const actor = { kind: "user", userId: "u1" } as const;

describe("a tool execution request", () => {
  it("carries the tool, its arguments, and who is calling from where", () => {
    const signal = new AbortController().signal;
    const parsed = toolExecuteRequestSchema.parse({
      toolName: "notes_list",
      args: { limit: 3 },
      interfaceType: "mcp",
      actor,
      conversationId: "c1",
      userPermissionLevel: "trusted",
      progressToken: 7,
      signal,
    });
    expect(parsed.toolName).toBe("notes_list");
    expect(parsed.userPermissionLevel).toBe("trusted");
    expect(parsed.progressToken).toBe(7);
    expect(parsed.signal).toBe(signal);
  });

  it("is refused without a caller", () => {
    expect(
      toolExecuteRequestSchema.safeParse({
        toolName: "notes_list",
        args: {},
        interfaceType: "mcp",
      }).success,
    ).toBe(false);
  });

  it("is refused with a progress reporter that is not a function", () => {
    expect(
      toolExecuteRequestSchema.safeParse({
        toolName: "notes_list",
        args: {},
        interfaceType: "mcp",
        actor,
        sendProgress: "soon",
      }).success,
    ).toBe(false);
  });
});
