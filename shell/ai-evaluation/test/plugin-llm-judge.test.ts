import { describe, expect, it } from "bun:test";
import type {
  AIModelConfig,
  IAIService,
  ImageGenerationResult,
  JudgeInput,
} from "@brains/ai-service";
import { PluginLLMJudge } from "../src/plugin-llm-judge";

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
    relevance: 4,
    accuracy: 5,
    coverage: 3,
    quality: 4,
    reasoning: "The output is relevant and accurate.",
  };

  return {
    judgeCalls,
    async generateText(): Promise<{ text: string; usage: Usage }> {
      throw new Error("generateText should not be called by PluginLLMJudge");
    },
    async generateObject<T>(): Promise<{ object: T; usage: Usage }> {
      throw new Error("generateObject should not be called by PluginLLMJudge");
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
      throw new Error("getModel should not be called by PluginLLMJudge");
    },
    async generateImage(): Promise<ImageGenerationResult> {
      return { base64: "", dataUrl: "" };
    },
    canGenerateImages(): boolean {
      return false;
    },
  };
}

describe("PluginLLMJudge", () => {
  it("uses the generic judge capability for plugin scoring", async () => {
    const aiService = createAIServiceWithJudge();
    const llmJudge = new PluginLLMJudge(aiService);

    const scores = await llmJudge.scorePluginOutput(
      {
        id: "plugin-test",
        name: "Plugin test",
        type: "plugin",
        plugin: "topics",
        handler: "derive",
        input: { content: "A note about product strategy." },
        expectedOutput: { qualityCriteria: {} },
      },
      [{ topic: "Product strategy" }],
    );

    expect(scores?.accuracy).toBe(5);
    expect(aiService.judgeCalls[0]).toEqual(
      expect.objectContaining({
        instruction: expect.stringContaining("expert evaluator"),
        material: expect.stringContaining("## Output"),
      }),
    );
  });
});
