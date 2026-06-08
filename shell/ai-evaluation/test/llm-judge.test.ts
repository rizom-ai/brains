import { describe, expect, it } from "bun:test";
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
      return { verdict: input.schema.parse(verdict), usage };
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
        instruction: expect.stringContaining("expert evaluator"),
        material: expect.stringContaining("## Conversation"),
      }),
    );
  });
});
