import { describe, expect, it } from "bun:test";
import { asSchema } from "ai";
import type {
  AIModelConfig,
  IAIService,
  ImageGenerationResult,
  JudgeInput,
} from "@brains/ai-service";
import { LLMJudge } from "../src/llm-judge";

interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface JudgeCall {
  instruction: string;
  material: string;
}

interface TestAIService extends IAIService {
  judgeCalls: JudgeCall[];
}

async function parseJudgeSchema<T>(
  input: JudgeInput<T>,
  value: unknown,
): Promise<T> {
  const validate = asSchema(input.schema).validate;
  if (!validate) {
    throw new Error("Test judge schema does not provide validation");
  }
  const result = await validate(value);
  if (!result.success) {
    throw result.error;
  }
  return result.value;
}

function createAIServiceWithJudge(): TestAIService {
  const judgeCalls: JudgeCall[] = [];
  const usage: Usage = { promptTokens: 1, completionTokens: 1, totalTokens: 2 };
  const verdict = {
    helpfulness: 4,
    accuracy: 5,
    instructionFollowing: 4,
    appropriateToolUse: 3,
    reasoning: "Good answer with acceptable tool use.",
  };

  return {
    judgeCalls,
    async generateText(): Promise<{ text: string; usage: Usage }> {
      throw new Error("generateText should not be called by LLMJudge");
    },
    async generateObject<T>(): Promise<{ object: T; usage: Usage }> {
      throw new Error("generateObject should not be called by LLMJudge");
    },
    async judge<T>(
      input: JudgeInput<T>,
    ): Promise<{ verdict: T; usage: Usage }> {
      judgeCalls.push({
        instruction: input.instruction,
        material: input.material,
      });
      return { verdict: await parseJudgeSchema(input, verdict), usage };
    },
    updateConfig(): void {},
    getConfig(): AIModelConfig {
      return {};
    },
    getModel(): never {
      throw new Error("getModel should not be called by LLMJudge");
    },
    async generateImage(): Promise<ImageGenerationResult> {
      return { base64: "", dataUrl: "" };
    },
    canGenerateImages(): boolean {
      return false;
    },
  };
}

describe("LLMJudge", () => {
  it("uses the generic judge capability for quality scoring", async () => {
    const aiService = createAIServiceWithJudge();
    const llmJudge = new LLMJudge(aiService);

    const scores = await llmJudge.scoreConversation(
      {
        id: "test",
        name: "Test conversation",
        type: "multi_turn",
        turns: [{ userMessage: "Help me" }],
        successCriteria: {},
      },
      [
        {
          turnIndex: 0,
          userMessage: "Help me",
          assistantResponse: "Sure.",
          toolCalls: [],
          metrics: {
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
            toolCallCount: 0,
            durationMs: 1,
          },
        },
      ],
    );

    expect(scores?.accuracy).toBe(5);
    expect(aiService.judgeCalls[0]).toEqual(
      expect.objectContaining({
        instruction: expect.stringContaining(
          "Score instruction following only against the user's instructions",
        ),
        material: expect.stringContaining("## Conversation"),
      }),
    );
  });

  it("explains pending confirmation and exact text-source semantics to the judge", async () => {
    const aiService = createAIServiceWithJudge();
    const llmJudge = new LLMJudge(aiService);

    await llmJudge.scoreConversation(
      {
        id: "direct-create",
        name: "Direct create",
        type: "tool_invocation",
        turns: [{ userMessage: "Save this exactly: final content" }],
        successCriteria: {
          expectedTools: [
            {
              toolName: "system_create",
              shouldBeCalled: true,
              argsContain: {
                entityType: "post",
                "source.kind": "text",
              },
              argsAbsent: ["prompt"],
            },
          ],
        },
      },
      [
        {
          turnIndex: 0,
          userMessage: "Save this exactly: final content",
          assistantResponse: "Confirmation required.",
          toolCalls: [
            {
              toolName: "system_create",
              args: {
                entityType: "post",
                source: { kind: "text", content: "final content" },
              },
              result: { needsConfirmation: true },
            },
          ],
          metrics: {
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
            toolCallCount: 1,
            durationMs: 1,
          },
        },
      ],
    );

    const call = aiService.judgeCalls[0];
    expect(call?.instruction).toContain(
      "needsConfirmation true means the tool correctly opened the pending confirmation flow",
    );
    expect(call?.instruction).toContain(
      "source.kind text stores the supplied content directly and exactly",
    );
    expect(call?.material).toContain('"kind":"text"');
    expect(call?.material).toContain('"needsConfirmation":true');
  });

  it("supplies deterministic criteria and complete ordinary tool content", async () => {
    const aiService = createAIServiceWithJudge();
    const llmJudge = new LLMJudge(aiService);
    const content = `${"front matter\n".repeat(50)}Core stays private, default adds a site, and full adds knowledge surfaces.`;

    await llmJudge.scoreConversation(
      {
        id: "grounded-summary",
        name: "Grounded summary",
        type: "tool_invocation",
        turns: [{ userMessage: "Summarize it" }],
        successCriteria: {
          responseContains: ["Core", "default", "full"],
        },
      },
      [
        {
          turnIndex: 0,
          userMessage: "Summarize it",
          assistantResponse:
            "Core stays private, default adds a site, and full adds knowledge surfaces.",
          toolCalls: [
            {
              toolName: "system_get",
              args: { entityType: "summary", id: "sync" },
              result: { entity: { content } },
            },
          ],
          metrics: {
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
            toolCallCount: 1,
            durationMs: 1,
          },
        },
      ],
    );

    const material = aiService.judgeCalls[0]?.material ?? "";
    expect(material).toContain("## Deterministic Criteria");
    expect(material).toContain('"responseContains"');
    expect(material).toContain(
      "Core stays private, default adds a site, and full adds knowledge surfaces.",
    );
  });

  it("retains both ends of unusually long tool-result strings", async () => {
    const aiService = createAIServiceWithJudge();
    const llmJudge = new LLMJudge(aiService);
    const content = `START-${"x".repeat(2500)}-DECISIVE-END`;

    await llmJudge.scoreConversation(
      {
        id: "long-result",
        name: "Long result",
        type: "tool_invocation",
        turns: [{ userMessage: "Read it" }],
        successCriteria: {},
      },
      [
        {
          turnIndex: 0,
          userMessage: "Read it",
          assistantResponse: "DECISIVE-END",
          toolCalls: [{ toolName: "system_get", result: { content } }],
          metrics: {
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
            toolCallCount: 1,
            durationMs: 1,
          },
        },
      ],
    );

    const material = aiService.judgeCalls[0]?.material ?? "";
    expect(material).toContain("START-");
    expect(material).toContain("chars omitted");
    expect(material).toContain("-DECISIVE-END");
  });
});
