import { describe, expect, it, mock } from "bun:test";
import type { Tool } from "@brains/mcp-service";
import { createMockMessageBus } from "@brains/messaging-service/test";
import { MockLanguageModelV3 } from "ai/test";
import { createBrainAgentFactory } from "../src/brain-agent";

type ModelResponse = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;

/** A reply, or the empty turn a thinking model ends with after reasoning. */
function reply(text: string): ModelResponse {
  return {
    content: text
      ? [{ type: "text", text }]
      : [{ type: "reasoning", text: "So the tool call should be..." }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 5, text: 5, reasoning: 0 },
    },
    warnings: [],
  };
}

function scripted(
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

const saveTool: Tool = {
  name: "system_create",
  description: "Create",
  inputSchema: {},
  visibility: "public",
  handler: mock(async () => ({ success: true as const, data: {} })),
};

function call(toolName: string): ModelResponse {
  return {
    content: [
      { type: "tool-call", toolCallId: "call-1", toolName, input: "{}" },
    ],
    finishReason: { unified: "tool-calls", raw: "tool_calls" },
    usage: reply("x").usage,
    warnings: [],
  };
}

async function requiredRetryTurn(
  model: MockLanguageModelV3,
): Promise<{ text: string }> {
  return createBrainAgentFactory({
    model,
    modelId: "local:qwen3:30b-a3b",
    messageBus: createMockMessageBus(),
  })({
    identity: { name: "Brain", role: "Keeper", purpose: "Help", values: [] },
    tools: [saveTool],
    getToolsForPermission: () => [saveTool],
  }).generate({
    messages: [{ role: "user", content: "Keep these files." }],
    options: {
      conversationId: "conv-1",
      interfaceType: "web-chat",
      userPermissionLevel: "admin",
      isAnchor: true,
    },
  });
}

async function turn(
  modelId: string,
  responses: ModelResponse[],
  answerModel?: MockLanguageModelV3,
): Promise<{ text: string; calls: number; inputTokens: number | undefined }> {
  const model = scripted("decider", responses);
  const agent = createBrainAgentFactory({
    model,
    answerModel,
    modelId,
    messageBus: createMockMessageBus(),
  })({
    identity: { name: "Brain", role: "Keeper", purpose: "Help", values: [] },
    tools: [],
    getToolsForPermission: () => [],
  });
  const result = await agent.generate({
    messages: [{ role: "user", content: "Keep these files." }],
    options: {
      conversationId: "conv-1",
      interfaceType: "web-chat",
      userPermissionLevel: "admin",
      isAnchor: true,
    },
  });
  return {
    text: result.text,
    calls: model.doGenerateCalls.length,
    inputTokens: result.usage.inputTokens,
  };
}

describe("a turn that ends with no reply and no tool call", () => {
  it("is run once more for a local model, counting both attempts", async () => {
    const outcome = await turn("local:qwen3:30b-a3b", [
      reply(""),
      reply("Saved."),
    ]);

    expect(outcome).toEqual({ text: "Saved.", calls: 2, inputTokens: 20 });
  });

  it("is run again by the model that chose nothing, now required to call a tool", async () => {
    const model = scripted("decider", [
      reply(""),
      call("system_create"),
      reply("Saved."),
    ]);
    const result = await requiredRetryTurn(model);

    expect(result.text).toBe("Saved.");
    expect(saveTool.handler).toHaveBeenCalled();
    const [first, retry, answer] = model.doGenerateCalls;
    expect(first?.toolChoice).toEqual({ type: "auto" });
    expect(retry?.toolChoice).toEqual({ type: "required" });
    expect(answer?.toolChoice).toEqual({ type: "auto" });
  });

  it("keeps the empty turn when the retry still makes no call", async () => {
    const model = scripted("decider", [reply(""), reply("")]);
    const result = await requiredRetryTurn(model);

    expect(result.text).toBe("");
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("is left as it is for a cloud model", async () => {
    const outcome = await turn("openai:gpt-6-luna", [reply("")]);

    expect(outcome).toMatchObject({ text: "", calls: 1 });
  });
});
