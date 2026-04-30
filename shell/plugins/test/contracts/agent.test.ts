import { describe, expect, it } from "bun:test";
import { AgentResponseSchema } from "../../src/contracts/agent";
import { toPublicAgentResponse } from "../../src/base/public-agent-service";

describe("public agent contracts", () => {
  it("maps runtime agent responses to the stable public contract", () => {
    const response = toPublicAgentResponse({
      text: "Done",
      toolResults: [
        {
          toolName: "search",
          args: { query: "rizom" },
          jobId: "job-1",
          data: { count: 2 },
        },
      ],
      pendingConfirmation: {
        toolName: "delete",
        description: "Delete item",
        args: { id: "item-1" },
      },
      usage: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
      },
    });

    expect(AgentResponseSchema.parse(response)).toEqual({
      text: "Done",
      toolResults: [
        {
          toolName: "search",
          args: { query: "rizom" },
          jobId: "job-1",
          data: { count: 2 },
        },
      ],
      pendingConfirmation: {
        toolName: "delete",
        description: "Delete item",
        args: { id: "item-1" },
      },
      usage: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
      },
    });
  });
});
