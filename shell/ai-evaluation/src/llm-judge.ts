import { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
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

const MAX_TOOL_RESULT_STRING_LENGTH = 2000;
const MAX_TOOL_RESULT_LENGTH = 6000;

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

The deterministic criteria are supplied as the expected contract and evaluated separately. Score instruction following only against the user's instructions and that contract; stylistic helpfulness belongs in the helpfulness score, not instruction following. Do not invent stricter requirements. Do not assume an answer is inaccurate merely because injected runtime context is unavailable to you; use the expected response terms and observed evidence. When a tool result is unavailable, assess whether the assistant reports uncertainty honestly instead of inventing the missing result.

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

    const material = `## Test Case
Name: ${testCase.name}
Description: ${testCase.description ?? "No description"}
Type: ${testCase.type}
Setup: ${JSON.stringify(testCase.setup ?? {})}

## Deterministic Criteria
${this.formatDeterministicCriteria(testCase)}

## Conversation
${conversationText}

## Tools Called
${this.formatToolCalls(turnResults)}`;

    try {
      const { verdict } = await this.aiService.judge({
        instruction: `${JUDGE_SYSTEM_PROMPT}\n\nEvaluate the supplied agent conversation and provide quality scores and reasoning.`,
        material,
        schema: qualityEvaluationSchema,
      });

      return {
        helpfulness: verdict.helpfulness,
        accuracy: verdict.accuracy,
        instructionFollowing: verdict.instructionFollowing,
        appropriateToolUse: verdict.appropriateToolUse,
        reasoning: verdict.reasoning,
      };
    } catch (error) {
      Logger.getInstance().error("LLM Judge failed:", error);
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

  private formatDeterministicCriteria(testCase: AgentTestCase): string {
    return JSON.stringify(
      {
        overall: testCase.successCriteria,
        turns: testCase.turns.map((turn, turnIndex) => ({
          turnIndex,
          criteria: turn.successCriteria ?? {},
        })),
      },
      null,
      2,
    );
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
      .map((tc, i) => {
        const args = tc.args ? ` (args: ${JSON.stringify(tc.args)})` : "";
        const result =
          tc.result !== undefined
            ? `\n   Result summary: ${this.summarizeToolResult(tc.result)}`
            : "";
        return `${i + 1}. ${tc.toolName}${args}${result}`;
      })
      .join("\n");
  }

  private summarizeToolResult(result: unknown): string {
    const serialized = JSON.stringify(result, (_key, value: unknown) => {
      if (
        typeof value !== "string" ||
        value.length <= MAX_TOOL_RESULT_STRING_LENGTH
      ) {
        return value;
      }

      const edgeLength = MAX_TOOL_RESULT_STRING_LENGTH / 2;
      const omittedLength = value.length - MAX_TOOL_RESULT_STRING_LENGTH;
      return `${value.slice(0, edgeLength)}…[${omittedLength} chars omitted]…${value.slice(-edgeLength)}`;
    });

    if (serialized.length <= MAX_TOOL_RESULT_LENGTH) return serialized;

    const edgeLength = MAX_TOOL_RESULT_LENGTH / 2;
    const omittedLength = serialized.length - MAX_TOOL_RESULT_LENGTH;
    return `${serialized.slice(0, edgeLength)}…[${omittedLength} chars omitted]…${serialized.slice(-edgeLength)}`;
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
