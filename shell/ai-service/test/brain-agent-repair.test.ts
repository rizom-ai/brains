import { describe, expect, it, mock } from "bun:test";
import type { Tool } from "@brains/mcp-service";
import { createMockMessageBus } from "@brains/messaging-service/test";
import { z } from "@brains/utils/zod";
import { MockLanguageModelV3 } from "ai/test";
import { createBrainAgentFactory } from "../src/brain-agent";

type ModelResponse = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;

const usage: ModelResponse["usage"] = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

/** A call in the old nested upload shape, which the tool rejects. */
const misplacedCall: ModelResponse = {
  content: [
    {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "system_create",
      input: JSON.stringify({
        source: { kind: "upload", upload: { kind: "upload", id: "upload-1" } },
      }),
    },
  ],
  finishReason: { unified: "tool-calls", raw: "tool_calls" },
  usage,
  warnings: [],
};

function text(value: string): ModelResponse {
  return {
    content: [{ type: "text", text: value }],
    finishReason: { unified: "stop", raw: "stop" },
    usage,
    warnings: [],
  };
}

/** The arguments in the tool's shape, as constrained output. */
const repairedArguments = text(
  JSON.stringify({ source: { kind: "upload", id: "upload-1" } }),
);

/** A model that answers each call with the next response. */
function scriptedModel(responses: ModelResponse[]): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async (): Promise<ModelResponse> => {
      const next = responses.shift();
      if (!next) throw new Error("No more responses");
      return next;
    },
  });
}

function createTool(): Tool {
  return {
    name: "system_create",
    description: "Create",
    inputSchema: {
      source: z.object({ kind: z.literal("upload"), id: z.string() }).strict(),
    },
    visibility: "public",
    handler: mock(async () => ({ success: true as const, data: {} })),
  };
}

async function run(model: MockLanguageModelV3, tool: Tool): Promise<void> {
  const agent = createBrainAgentFactory({
    model,
    modelId: "openai:gpt-6-luna",
    messageBus: createMockMessageBus(),
  })({
    identity: { name: "Brain", role: "Keeper", purpose: "Help", values: [] },
    tools: [tool],
    getToolsForPermission: () => [tool],
  });
  await agent.generate({
    messages: [{ role: "user", content: "Save the upload" }],
    options: {
      conversationId: "conv-1",
      interfaceType: "web-chat",
      userPermissionLevel: "admin",
      isAnchor: true,
    },
  });
}

describe("a tool call that fails validation", () => {
  it("is repaired into the tool's input shape by the model that made it, its output constrained", async () => {
    const tool = createTool();
    const model = scriptedModel([
      misplacedCall,
      repairedArguments,
      text("Saved."),
    ]);

    await run(model, tool);

    expect(tool.handler).toHaveBeenCalledTimes(1);
    expect(tool.handler).toHaveBeenCalledWith(
      { source: { kind: "upload", id: "upload-1" } },
      expect.anything(),
    );
    const [, repair] = model.doGenerateCalls;
    expect(repair?.responseFormat).toMatchObject({
      type: "json",
      schema: expect.objectContaining({ type: "object" }),
    });
    // OpenAI's strict structured outputs reject the tools' schemas, so the
    // repair asks for the schema without strict mode.
    expect(repair?.providerOptions).toMatchObject({
      openai: { strictJsonSchema: false },
    });
  });

  it("is left to the model to retry when the repair fails", async () => {
    const tool = createTool();
    const model = scriptedModel([
      misplacedCall,
      text("not json"),
      text("I could not save it."),
    ]);

    await run(model, tool);

    expect(tool.handler).not.toHaveBeenCalled();
    expect(model.doGenerateCalls).toHaveLength(3);
  });
});
