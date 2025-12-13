import { z } from "@brains/utils";
import type { IAIService } from "@brains/ai-service";

import type { ILLMJudge, LLMJudgeOptions } from "./types";
import type { AgentTestCase, TurnResult, QualityScores } from "./schemas";

/**
 * Schema for LLM judge response
 */
const qualityEvaluationSchema = z.object({
  helpfulness: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "How helpful was the response in addressing the user's needs? 0=not helpful, 5=extremely helpful",
    ),
  accuracy: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "How accurate and factually correct was the response? 0=completely wrong, 5=fully accurate",
    ),
  instructionFollowing: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "How well did the agent follow the user's instructions? 0=ignored instructions, 5=followed perfectly",
    ),
  appropriateToolUse: z
    .number()
    .min(0)
    .max(5)
    .describe(
      "How appropriately did the agent use tools? 0=misused tools, 5=optimal tool usage",
    ),
  reasoning: z.string().describe("Brief explanation of the scores given"),
});

const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator assessing AI agent performance.
Your task is to score the agent's responses on multiple dimensions.

Scoring scale (0-5):
- 0: Complete failure
- 1: Major issues
- 2: Significant problems
- 3: Acceptable but could improve
- 4: Good performance
- 5: Excellent/optimal

Be objective and consistent. Consider:
- Whether the agent addressed the user's actual needs
- Accuracy of any facts or information provided
- How well instructions were followed
- Whether tools were used appropriately (not too many, not too few)

Provide brief but clear reasoning for your scores.`;

/**
 * LLM-as-judge for quality scoring
 */
export class LLMJudge implements ILLMJudge {
  private aiService: IAIService;
  private options: LLMJudgeOptions;

  constructor(aiService: IAIService, options: LLMJudgeOptions = {}) {
    this.aiService = aiService;
    this.options = options;
  }

  /**
   * Score a conversation for quality
   * Returns null if skipped due to sampling
   */
  async scoreConversation(
    testCase: AgentTestCase,
    turnResults: TurnResult[],
  ): Promise<QualityScores | null> {
    // Apply sample rate
    const sampleRate = this.options.sampleRate ?? 1.0;
    if (sampleRate < 1.0 && Math.random() > sampleRate) {
      return null;
    }

    // Format conversation for evaluation
    const conversationText = this.formatConversation(testCase, turnResults);

    const userPrompt = `Please evaluate the following agent conversation:

## Test Case
Name: ${testCase.name}
Description: ${testCase.description ?? "No description"}
Type: ${testCase.type}

## Conversation
${conversationText}

## Tools Called
${this.formatToolCalls(turnResults)}

Provide your evaluation scores and reasoning.`;

    try {
      const { object } = await this.aiService.generateObject(
        JUDGE_SYSTEM_PROMPT,
        userPrompt,
        qualityEvaluationSchema,
      );

      return {
        helpfulness: object.helpfulness,
        accuracy: object.accuracy,
        instructionFollowing: object.instructionFollowing,
        appropriateToolUse: object.appropriateToolUse,
        reasoning: object.reasoning,
      };
    } catch (error) {
      console.error("LLM Judge failed:", error);
      return null;
    }
  }

  /**
   * Format conversation turns for evaluation
   */
  private formatConversation(
    _testCase: AgentTestCase,
    turnResults: TurnResult[],
  ): string {
    const parts: string[] = [];

    for (const turn of turnResults) {
      parts.push(`User: ${turn.userMessage}`);
      parts.push(`Assistant: ${turn.assistantResponse}`);
      parts.push("");
    }

    return parts.join("\n");
  }

  /**
   * Format tool calls for evaluation
   */
  private formatToolCalls(turnResults: TurnResult[]): string {
    const allToolCalls = turnResults.flatMap((tr) => tr.toolCalls);

    if (allToolCalls.length === 0) {
      return "No tools were called.";
    }

    return allToolCalls
      .map(
        (tc, i) =>
          `${i + 1}. ${tc.toolName}${tc.args ? ` (args: ${JSON.stringify(tc.args)})` : ""}`,
      )
      .join("\n");
  }

  /**
   * Create a fresh LLM judge instance
   */
  static createFresh(
    aiService: IAIService,
    options?: LLMJudgeOptions,
  ): LLMJudge {
    return new LLMJudge(aiService, options);
  }
}
