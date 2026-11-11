import { describe, expect, it, mock } from "bun:test";
import type { Tool } from "@brains/mcp-service";
import { createMockMessageBus } from "@brains/messaging-service/test";
import { z } from "@brains/utils/zod";
import { MockLanguageModelV3 } from "ai/test";
import { createBrainAgentFactory } from "../src/brain-agent";

type ModelResponse = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;
type Call = MockLanguageModelV3["doGenerateCalls"][number];

const usage: ModelResponse["usage"] = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const reply = (text: string): ModelResponse => ({
  content: [{ type: "text", text }],
  finishReason: { unified: "stop", raw: "stop" },
  usage,
  warnings: [],
});

function tool(
  name: string,
  sideEffects: NonNullable<Tool["sideEffects"]>,
): Tool {
  return {
    name,
    description: name,
    inputSchema: { value: z.string().optional() },
    visibility: "public",
    sideEffects,
    handler: mock(async () => ({ success: true as const })),
  };
}

const tools = [tool("system_get", "none"), tool("system_create", "writes")];

/** A turn on a model, its intent read by the answer model. */
async function turn(
  modelId: string,
  intent: string | Error,
): Promise<{ model: MockLanguageModelV3; answer: MockLanguageModelV3 }> {
  const model = new MockLanguageModelV3({
    doGenerate: async (): Promise<ModelResponse> => reply("Hello."),
  });
  const answer = new MockLanguageModelV3({
    doGenerate: async (): Promise<ModelResponse> => {
      if (intent instanceof Error) throw intent;
      return reply(intent);
    },
  });
  await createBrainAgentFactory({
    model,
    answerModel: answer,
    modelId,
    messageBus: createMockMessageBus(),
  })({
    identity: { name: "Brain", role: "Keeper", purpose: "Help", values: [] },
    tools,
    getToolsForPermission: () => tools,
  }).generate({
    messages: [
      {
        role: "assistant",
        content: "I got harbor.png. What would you like me to do with it?",
      },
      { role: "user", content: "drunken" },
    ],
    options: {
      conversationId: "conv-1",
      interfaceType: "web-chat",
      userPermissionLevel: "admin",
      isAnchor: true,
    },
  });
  return { model, answer };
}

const offered = (call: Call | undefined): string[] =>
  (call?.tools ?? []).map((t) => t.name);

describe("a local model's turn", () => {
  it("gets no tool that writes when its message asks no change", async () => {
    const { model } = await turn(
      "local:qwen3:30b-a3b",
      '{"asksToRead":false,"asksToChange":false}',
    );

    expect(offered(model.doGenerateCalls[0])).toEqual(["system_get"]);
  });

  it("keeps every tool when its message asks a change", async () => {
    const { model } = await turn(
      "local:qwen3:30b-a3b",
      '{"asksToRead":false,"asksToChange":true}',
    );

    expect(offered(model.doGenerateCalls[0])).toEqual([
      "system_get",
      "system_create",
    ]);
  });

  it("is marked to read first when its message asks to read stored content", async () => {
    const { model } = await turn(
      "local:qwen3:30b-a3b",
      '{"asksToRead":true,"asksToChange":false}',
    );

    expect(model.doGenerateCalls[0]?.providerOptions).toMatchObject({
      local: { callRequired: true },
    });
  });

  it("keeps every tool, unmarked, when its intent cannot be read", async () => {
    const { model } = await turn("local:qwen3:30b-a3b", new Error("down"));

    expect(offered(model.doGenerateCalls[0])).toEqual([
      "system_get",
      "system_create",
    ]);
    expect(
      JSON.stringify(model.doGenerateCalls[0]?.providerOptions ?? {}),
    ).not.toContain("callRequired");
  });
});

describe("a cloud model's turn", () => {
  it("is not read for its intent", async () => {
    const { answer, model } = await turn(
      "openai:gpt-6-luna",
      '{"asksToRead":false,"asksToChange":false}',
    );

    expect(answer.doGenerateCalls).toHaveLength(0);
    expect(offered(model.doGenerateCalls[0])).toEqual([
      "system_get",
      "system_create",
    ]);
  });
});
