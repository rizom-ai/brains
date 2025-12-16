import { z } from "@brains/utils";
import type { IAIService } from "@brains/ai-service";

import type { LLMJudgeOptions } from "./types";
import type { PluginTestCase, QualityScores } from "./schemas";

/**
 * Schema for plugin output quality evaluation
 */
const pluginQualityEvaluationSchema = z.object({
  relevance: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "How relevant are the outputs to the input content? 0=completely irrelevant, 5=highly relevant",
    ),
  accuracy: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "How accurate and factually correct are the outputs? 0=completely wrong, 5=fully accurate",
    ),
  coverage: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "How well do the outputs cover the main themes/topics of the input? 0=missed everything, 5=comprehensive coverage",
    ),
  quality: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "How well-formed and high-quality are the outputs (formatting, clarity, specificity)? 0=poor quality, 5=excellent quality",
    ),
  reasoning: z.string().describe("Brief explanation of the scores given"),
});

const PLUGIN_JUDGE_SYSTEM_PROMPT = `You are an expert evaluator assessing AI plugin output quality.
Your task is to score the plugin's outputs on multiple dimensions.

Scoring scale (0-5):
- 0: Complete failure
- 1: Major issues
- 2: Significant problems
- 3: Acceptable but could improve
- 4: Good performance
- 5: Excellent/optimal

Be objective and consistent. Consider:
- Whether the outputs are relevant to the input content
- Accuracy and factual correctness of extracted information
- Coverage of main themes and topics in the input
- Quality of formatting, clarity, and specificity of outputs

Provide brief but clear reasoning for your scores.`;

/**
 * Interface for plugin LLM judge
 */
export interface IPluginLLMJudge {
  scorePluginOutput(
    testCase: PluginTestCase,
    output: unknown,
  ): Promise<QualityScores | null>;
}

/**
 * LLM-as-judge for plugin output quality scoring
 */
export class PluginLLMJudge implements IPluginLLMJudge {
  private aiService: IAIService;
  private options: LLMJudgeOptions;

  constructor(aiService: IAIService, options: LLMJudgeOptions = {}) {
    this.aiService = aiService;
    this.options = options;
  }

  /**
   * Score plugin output for quality
   * Returns null if skipped due to sampling
   */
  async scorePluginOutput(
    testCase: PluginTestCase,
    output: unknown,
  ): Promise<QualityScores | null> {
    // Apply sample rate
    const sampleRate = this.options.sampleRate ?? 1.0;
    if (sampleRate < 1.0 && Math.random() > sampleRate) {
      return null;
    }

    // Format output for evaluation
    const inputText = this.formatInput(testCase.input);
    const outputText = this.formatOutput(output);

    const userPrompt = `Please evaluate the following plugin output:

## Plugin Test Case
Name: ${testCase.name}
Description: ${testCase.description ?? "No description"}
Plugin: ${testCase.plugin}
Handler: ${testCase.handler}

## Input
${inputText}

## Output
${outputText}

Provide your evaluation scores and reasoning.`;

    try {
      const { object } = await this.aiService.generateObject(
        PLUGIN_JUDGE_SYSTEM_PROMPT,
        userPrompt,
        pluginQualityEvaluationSchema,
      );

      // Map plugin quality scores to standard QualityScores format
      return {
        helpfulness: object.coverage, // Coverage maps to helpfulness
        accuracy: object.accuracy,
        instructionFollowing: object.relevance, // Relevance maps to instruction following
        appropriateToolUse: object.quality, // Quality maps to tool use (output quality)
        reasoning: object.reasoning,
      };
    } catch (error) {
      console.error("Plugin LLM Judge failed:", error);
      return null;
    }
  }

  /**
   * Format input for evaluation
   */
  private formatInput(input: Record<string, unknown>): string {
    // Special handling for common input patterns
    const content = input["content"];
    if (content && typeof content === "string") {
      const entityType = input["entityType"] ?? "unknown";
      return `Entity Type: ${String(entityType)}\n\nContent:\n${content}`;
    }

    return JSON.stringify(input, null, 2);
  }

  /**
   * Format output for evaluation
   */
  private formatOutput(output: unknown): string {
    if (Array.isArray(output)) {
      if (output.length === 0) {
        return "No items returned";
      }

      // Format array items nicely
      return output
        .map((item, i) => {
          if (typeof item === "object" && item !== null) {
            const parts: string[] = [`Item ${i + 1}:`];
            for (const [key, value] of Object.entries(item)) {
              parts.push(`  ${key}: ${JSON.stringify(value)}`);
            }
            return parts.join("\n");
          }
          return `Item ${i + 1}: ${JSON.stringify(item)}`;
        })
        .join("\n\n");
    }

    if (typeof output === "object" && output !== null) {
      return JSON.stringify(output, null, 2);
    }

    return String(output);
  }

  /**
   * Create a fresh PluginLLMJudge instance
   */
  static createFresh(
    aiService: IAIService,
    options?: LLMJudgeOptions,
  ): PluginLLMJudge {
    return new PluginLLMJudge(aiService, options);
  }
}
