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

/** A model that searches first, then answers from the result. */
function searchingModel(): MockLanguageModelV3 {
  const responses: ModelResponse[] = [
    {
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "system_search",
          input: JSON.stringify({ value: "institutions" }),
        },
      ],
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage,
      warnings: [],
    },
    {
      content: [{ type: "text", text: "Found it." }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    },
  ];
  return new MockLanguageModelV3({
    doGenerate: async (): Promise<ModelResponse> => {
      const next = responses.shift();
      if (!next) throw new Error("No more responses");
      return next;
    },
  });
}

const search: Tool = {
  name: "system_search",
  description: "Search",
  inputSchema: { value: z.string().optional() },
  visibility: "public",
  handler: mock(async () => ({ success: true as const, data: [] })),
};

async function stepOptions(modelId: string): Promise<unknown[]> {
  const model = searchingModel();
  const agent = createBrainAgentFactory({
    model,
    modelId,
    reasoningEffort: "low",
    messageBus: createMockMessageBus(),
  })({
    identity: {
      name: "Brain",
      role: "Researcher",
      purpose: "Help",
      values: [],
    },
    tools: [search],
    getToolsForPermission: () => [search],
  });
  await agent.generate({
    messages: [{ role: "user", content: "Find the white paper" }],
    options: {
      conversationId: "conv-1",
      interfaceType: "cli",
      userPermissionLevel: "admin",
      isAnchor: true,
    },
  });
  return model.doGenerateCalls.map((call) => call.providerOptions);
}

describe("reasoning across agent steps", () => {
  it("passes a local model's effort on every step, for its runtime to apply", async () => {
    expect(await stepOptions("local:qwen3:14b")).toEqual([
      expect.objectContaining({ local: { reasoningEffort: "low" } }),
      expect.objectContaining({ local: { reasoningEffort: "low" } }),
    ]);
  });

  it("keeps a cloud model's effort on every step", async () => {
    const [first, second] = await stepOptions("openai:gpt-6-luna");
    expect(first).toMatchObject({ openai: { reasoningEffort: "low" } });
    expect(second).toMatchObject({ openai: { reasoningEffort: "low" } });
  });
});

describe("the answer model", () => {
  it("answers a tool result in place of the model that chose the tool", async () => {
    const decider = searchingModel();
    const answerer = new MockLanguageModelV3({
      modelId: "answer",
      doGenerate: async (): Promise<ModelResponse> => ({
        content: [{ type: "text", text: "Found it." }],
        finishReason: { unified: "stop", raw: "stop" },
        usage,
        warnings: [],
      }),
    });
    const agent = createBrainAgentFactory({
      model: decider,
      answerModel: answerer,
      modelId: "local:qwen3:30b-a3b",
      messageBus: createMockMessageBus(),
    })({
      identity: {
        name: "Brain",
        role: "Researcher",
        purpose: "Help",
        values: [],
      },
      tools: [search],
      getToolsForPermission: () => [search],
    });

    const result = await agent.generate({
      messages: [{ role: "user", content: "Find the white paper" }],
      options: {
        conversationId: "conv-1",
        interfaceType: "cli",
        userPermissionLevel: "admin",
        isAnchor: true,
      },
    });

    expect(decider.doGenerateCalls).toHaveLength(1);
    expect(answerer.doGenerateCalls).toHaveLength(1);
    expect(result.text).toBe("Found it.");
  });
});

describe("a tool the answer model calls", () => {
  it("hands the next step back to the model that chooses tools", async () => {
    const decider = searchingModel();
    const answerer = new MockLanguageModelV3({
      modelId: "answer",
      doGenerate: async (): Promise<ModelResponse> => ({
        content: [
          {
            type: "tool-call",
            toolCallId: "call-2",
            toolName: "system_search",
            input: JSON.stringify({ value: "white paper" }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage,
        warnings: [],
      }),
    });
    const agent = createBrainAgentFactory({
      model: decider,
      answerModel: answerer,
      modelId: "local:qwen3:30b-a3b",
      messageBus: createMockMessageBus(),
    })({
      identity: {
        name: "Brain",
        role: "Researcher",
        purpose: "Help",
        values: [],
      },
      tools: [search],
      getToolsForPermission: () => [search],
    });

    const result = await agent.generate({
      messages: [{ role: "user", content: "Find the white paper" }],
      options: {
        conversationId: "conv-1",
        interfaceType: "cli",
        userPermissionLevel: "admin",
        isAnchor: true,
      },
    });

    // The model searches, the answer model searches again, and the model,
    // given that result, answers.
    expect(decider.doGenerateCalls).toHaveLength(2);
    expect(answerer.doGenerateCalls).toHaveLength(1);
    expect(result.text).toBe("Found it.");
  });
});
