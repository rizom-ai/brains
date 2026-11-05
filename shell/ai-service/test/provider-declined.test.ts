import { describe, expect, it, mock } from "bun:test";
import { APICallError } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import type { Tool } from "@brains/mcp-service";
import { z } from "@brains/utils/zod";
import { createMockMessageBus } from "@brains/messaging-service/test";
import { createBrainAgentFactory } from "../src/brain-agent";
import { AIProviderDeclinedError } from "../src/errors";
import { isContentPolicyRejection } from "../src/provider-declined";

type ModelResponse = Awaited<ReturnType<MockLanguageModelV3["doGenerate"]>>;

const usage: ModelResponse["usage"] = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function answer(text = "Hello."): ModelResponse {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage,
    warnings: [],
  };
}

function toolCall(): ModelResponse {
  return {
    content: [
      {
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "system_create",
        input: JSON.stringify({ value: "note" }),
      },
    ],
    finishReason: { unified: "tool-calls", raw: "tool_calls" },
    usage,
    warnings: [],
  };
}

function refusal(raw: string): ModelResponse {
  return {
    content: [],
    finishReason: { unified: "content-filter", raw },
    usage,
    warnings: [],
  };
}

function openAIError(code: string, statusCode = 400): APICallError {
  const message =
    code === "invalid_prompt"
      ? "Invalid prompt: your prompt was flagged as potentially violating our usage policy."
      : `Request failed: ${code}`;
  return new APICallError({
    message,
    url: "https://api.openai.com/v1/responses",
    requestBodyValues: {},
    statusCode,
    isRetryable: false,
    data: {
      error: { message, type: "invalid_request_error", param: null, code },
    },
  });
}

function createTool(): Tool & { handler: ReturnType<typeof mock> } {
  return {
    name: "system_create",
    description: "Create an entity",
    inputSchema: { value: z.string().optional() },
    visibility: "public",
    handler: mock(async () => ({ success: true as const })),
  };
}

function agentFor(
  doGenerate: () => Promise<ModelResponse>,
  tools: Tool[] = [],
): {
  model: MockLanguageModelV3;
  generate: () => ReturnType<
    ReturnType<ReturnType<typeof createBrainAgentFactory>>["generate"]
  >;
} {
  const model = new MockLanguageModelV3({ doGenerate });
  const agent = createBrainAgentFactory({
    model,
    messageBus: createMockMessageBus(),
  })({
    identity: {
      name: "Test Brain",
      role: "Researcher",
      purpose: "Answer questions",
      values: [],
    },
    tools,
    getToolsForPermission: () => tools,
  });
  return {
    model,
    generate: () =>
      agent.generate({
        messages: [{ role: "user", content: "Hi" }],
        options: {
          conversationId: "conv-1",
          interfaceType: "cli",
          userPermissionLevel: "admin",
          isAnchor: true,
        },
      }),
  };
}

function sequence(
  ...responses: Array<ModelResponse | Error>
): () => Promise<ModelResponse> {
  let call = 0;
  return async () => {
    const next = responses[Math.min(call++, responses.length - 1)];
    if (!next) throw new Error("no scripted response");
    if (next instanceof Error) throw next;
    return next;
  };
}

describe("isContentPolicyRejection", () => {
  it("recognizes OpenAI's usage-policy rejection by its error code", () => {
    expect(isContentPolicyRejection(openAIError("invalid_prompt"))).toBe(true);
  });

  it("does not treat other provider errors as policy rejections", () => {
    expect(
      isContentPolicyRejection(openAIError("context_length_exceeded")),
    ).toBe(false);
    expect(isContentPolicyRejection(openAIError("server_error", 500))).toBe(
      false,
    );
    expect(
      isContentPolicyRejection(
        new Error(
          "Invalid prompt: your prompt was flagged as potentially violating our usage policy.",
        ),
      ),
    ).toBe(false);
  });
});

describe("a turn the AI provider declines", () => {
  it("is retried once and answers when the retry is accepted", async () => {
    const { model, generate } = agentFor(
      sequence(openAIError("invalid_prompt"), answer("Retried answer.")),
    );

    const result = await generate();

    expect(result.text).toBe("Retried answer.");
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(model.doGenerateCalls[1]?.prompt).toEqual(
      model.doGenerateCalls[0]?.prompt,
    );
  });

  it("tells the user the provider declined when the retry is declined too", async () => {
    const { model, generate } = agentFor(
      sequence(openAIError("invalid_prompt"), openAIError("invalid_prompt")),
    );

    const failure = await generate().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AIProviderDeclinedError);
    expect(failure).toHaveProperty(
      "message",
      "The AI provider declined this request. Try rephrasing your message.",
    );
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("retries a refusal finish once (Anthropic and Google decline this way)", async () => {
    const { model, generate } = agentFor(
      sequence(refusal("refusal"), answer("Retried answer.")),
    );

    const result = await generate();

    expect(result.text).toBe("Retried answer.");
    expect(model.doGenerateCalls).toHaveLength(2);
    // The refused call was billed too.
    expect(result.usage.inputTokens).toBe(2);
  });

  it("tells the user the provider declined after a second refusal finish", async () => {
    const { model, generate } = agentFor(
      sequence(refusal("SAFETY"), refusal("SAFETY")),
    );

    const failure = await generate().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AIProviderDeclinedError);
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("leaves other provider errors as they were, without a retry", async () => {
    const rejection = openAIError("context_length_exceeded");
    const { model, generate } = agentFor(sequence(rejection, answer()));

    const failure = await generate().catch((error: unknown) => error);

    expect(failure).toBe(rejection);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("is not retried once a tool has run in the turn", async () => {
    const tool = createTool();
    const { model, generate } = agentFor(
      sequence(toolCall(), openAIError("invalid_prompt"), answer()),
      [tool],
    );

    const failure = await generate().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AIProviderDeclinedError);
    expect(tool.handler).toHaveBeenCalledTimes(1);
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it("keeps a turn's tool results when the provider refuses after a tool ran", async () => {
    const tool = createTool();
    const { model, generate } = agentFor(
      sequence(toolCall(), refusal("refusal"), answer()),
      [tool],
    );

    const result = await generate();

    expect(result.text).toBe(
      "The AI provider declined this request. Try rephrasing your message.",
    );
    expect(result.steps.flatMap((step) => step.toolCalls)).toHaveLength(1);
    expect(tool.handler).toHaveBeenCalledTimes(1);
    expect(model.doGenerateCalls).toHaveLength(2);
  });
});
