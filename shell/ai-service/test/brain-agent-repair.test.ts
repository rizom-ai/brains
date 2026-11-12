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

const misplacedCall: ModelResponse = {
  content: [
    {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "system_create",
      input: JSON.stringify({ source: { kind: "upload", id: "upload-1" } }),
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
  JSON.stringify({
    source: { kind: "upload", upload: { kind: "upload", id: "upload-1" } },
  }),
);

/** A model that answers each call with the next response. */
function scriptedModel(
  modelId: string,
  responses: ModelResponse[],
): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    modelId,
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
      source: z
        .object({
          kind: z.literal("upload"),
          upload: z
            .object({ kind: z.literal("upload"), id: z.string() })
            .strict(),
        })
        .strict(),
    },
    visibility: "public",
    handler: mock(async () => ({ success: true as const, data: {} })),
  };
}

async function run(params: {
  modelId: string;
  model: MockLanguageModelV3;
  answerModel?: MockLanguageModelV3;
  tool: Tool;
}): Promise<void> {
  const agent = createBrainAgentFactory({
    model: params.model,
    answerModel: params.answerModel,
    modelId: params.modelId,
    messageBus: createMockMessageBus(),
  })({
    identity: { name: "Brain", role: "Keeper", purpose: "Help", values: [] },
    tools: [params.tool],
    getToolsForPermission: () => [params.tool],
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

describe("a local model's tool call that fails validation", () => {
  it("is repaired into the tool's input shape by the model that chose it, its output constrained", async () => {
    const tool = createTool();
    const model = scriptedModel("decider", [misplacedCall, repairedArguments]);
    const answerModel = scriptedModel("answer", [text("Saved.")]);

    await run({ modelId: "local:qwen3:30b-a3b", model, answerModel, tool });

    expect(tool.handler).toHaveBeenCalledTimes(1);
    expect(tool.handler).toHaveBeenCalledWith(
      {
        source: { kind: "upload", upload: { kind: "upload", id: "upload-1" } },
      },
      expect.anything(),
    );
    const [, repair] = model.doGenerateCalls;
    expect(repair?.responseFormat).toMatchObject({
      type: "json",
      schema: expect.objectContaining({ type: "object" }),
    });
    expect(answerModel.doGenerateCalls).toHaveLength(1);
  });

  it("is left to the model to retry when the repair fails", async () => {
    const tool = createTool();
    const model = scriptedModel("decider", [
      misplacedCall,
      text("not json"),
      text("I could not save it."),
    ]);

    await run({ modelId: "local:qwen3:30b-a3b", model, tool });

    expect(tool.handler).not.toHaveBeenCalled();
    expect(model.doGenerateCalls).toHaveLength(3);
  });

  it("is left to a cloud model to retry", async () => {
    const tool = createTool();
    const model = scriptedModel("decider", [
      misplacedCall,
      text("I could not save it."),
    ]);

    await run({ modelId: "openai:gpt-6-luna", model, tool });

    expect(tool.handler).not.toHaveBeenCalled();
    expect(model.doGenerateCalls).toHaveLength(2);
  });
});
