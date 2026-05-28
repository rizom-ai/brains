import type {
  IAgentService,
  ChatContext,
  AgentResponse,
} from "@brains/ai-service";
import type { UserPermissionLevel } from "@brains/templates";
import { randomUUID } from "crypto";

import type { ITestRunner, ILLMJudge, TestRunnerOptions } from "./types";
import type {
  AgentTestCase,
  EvaluationResult,
  TurnResult,
  FailureDetail,
} from "./schemas";
import { MetricCollector } from "./metric-collector";
import {
  evaluateCriteria,
  evaluateEfficiency,
  evaluateQualityThresholds,
} from "./criteria-evaluator";

/**
 * Runs individual test cases against an agent service
 */
export class TestRunner implements ITestRunner {
  private readonly agentService: IAgentService;
  private readonly llmJudge: ILLMJudge | null;

  constructor(agentService: IAgentService, llmJudge?: ILLMJudge) {
    this.agentService = agentService;
    this.llmJudge = llmJudge ?? null;
  }

  /**
   * Run a single test case (agent-based test cases only)
   */
  async runTest(
    testCase: AgentTestCase,
    options: TestRunnerOptions = {},
  ): Promise<EvaluationResult> {
    const conversationId = randomUUID();
    const collector = MetricCollector.createFresh();
    const turnResults: TurnResult[] = [];
    const failures: FailureDetail[] = [];

    const context = this.buildChatContext(testCase);
    let pendingApprovalIds: string[] = [];

    for (let i = 0; i < testCase.turns.length; i++) {
      const turn = testCase.turns[i];
      if (!turn) continue;

      collector.startTurn();
      const approvalId = this.resolveApprovalId(turn, pendingApprovalIds);
      const response =
        turn.confirmPendingAction !== undefined
          ? await this.agentService.confirmPendingAction(
              conversationId,
              turn.confirmPendingAction,
              approvalId,
            )
          : await this.agentService.chat(
              turn.userMessage,
              conversationId,
              context,
            );
      pendingApprovalIds = this.extractPendingApprovalIds(response);
      const metrics = collector.endTurn({
        usage: response.usage,
        toolResults:
          response.toolResults?.map((toolResult) => ({
            toolName: toolResult.toolName,
            args: toolResult.args ?? ({} as Record<string, unknown>),
            result: toolResult.data,
          })) ?? [],
      });

      const toolCalls = collector.getToolCallsForTurn(i);
      const turnCriteriaResults = turn.successCriteria
        ? evaluateCriteria(turn.successCriteria, response, toolCalls)
        : [];

      turnResults.push({
        turnIndex: i,
        userMessage: turn.userMessage,
        assistantResponse: response.text,
        toolCalls,
        metrics,
        criteriaResults: turnCriteriaResults.map((result) => ({
          criterion: result.criterion,
          passed: result.passed,
          details: result.message,
        })),
      });

      failures.push(...turnCriteriaResults.filter((result) => !result.passed));
    }

    const finalCriteriaFailures = evaluateCriteria(
      testCase.successCriteria,
      { text: turnResults.at(-1)?.assistantResponse ?? "" },
      collector.getAllToolCalls(),
    ).filter((result) => !result.passed);
    failures.push(...finalCriteriaFailures);

    const totalMetrics = collector.getTotalMetrics();
    const efficiencyFailures = evaluateEfficiency(testCase, totalMetrics);

    const qualityScores =
      this.llmJudge && !options.skipLLMJudge
        ? ((await this.llmJudge.scoreConversation(testCase, turnResults)) ??
          undefined)
        : undefined;

    if (qualityScores) {
      failures.push(
        ...evaluateQualityThresholds(testCase.successCriteria, qualityScores),
      );
    }

    const passed = failures.length === 0 && efficiencyFailures.length === 0;

    return {
      testCaseId: testCase.id,
      testCaseName: testCase.name,
      passed,
      timestamp: new Date().toISOString(),
      turnResults,
      totalMetrics,
      qualityScores,
      failures,
      efficiencyPassed: efficiencyFailures.length === 0,
      efficiencyFailures:
        efficiencyFailures.length > 0 ? efficiencyFailures : undefined,
    };
  }

  private resolveApprovalId(
    turn: AgentTestCase["turns"][number],
    pendingApprovalIds: string[],
  ): string | undefined {
    if (turn.approvalId) return turn.approvalId;
    if (pendingApprovalIds.length !== 1) return undefined;
    return pendingApprovalIds[0];
  }

  private extractPendingApprovalIds(response: AgentResponse): string[] {
    const approvalCards =
      response.cards?.filter((card) => card.state === "approval-requested") ??
      [];
    if (approvalCards.length > 0) {
      return approvalCards.map((card) => card.id);
    }
    if (
      response.pendingConfirmations &&
      response.pendingConfirmations.length > 0
    ) {
      return response.pendingConfirmations.map(
        (confirmation) => confirmation.id,
      );
    }
    return [];
  }

  private buildChatContext(testCase: AgentTestCase): ChatContext {
    const userPermissionLevel: UserPermissionLevel =
      testCase.setup?.permissionLevel ?? "public";

    return {
      userPermissionLevel,
      interfaceType: "evaluation",
    };
  }

  /**
   * Create a fresh test runner instance
   */
  static createFresh(
    agentService: IAgentService,
    llmJudge?: ILLMJudge,
  ): TestRunner {
    return new TestRunner(agentService, llmJudge);
  }
}
