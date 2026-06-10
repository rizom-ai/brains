import type {
  IAgentService,
  ChatContext,
  AgentResponse,
} from "@brains/ai-service";
import type { IRuntimeUploadsNamespace } from "@brains/plugins";
import type { UserPermissionLevel } from "@brains/templates";
import { randomUUID } from "crypto";

import type { ITestRunner, ILLMJudge, TestRunnerOptions } from "./types";
import type {
  AgentTestCase,
  EvaluationResult,
  TurnResult,
  FailureDetail,
  EvalAttachment,
} from "./schemas";
import { MetricCollector } from "./metric-collector";
import {
  evaluateCriteria,
  evaluateEfficiency,
  evaluateQualityThresholds,
} from "./criteria-evaluator";

type ChatAttachment = NonNullable<ChatContext["attachments"]>[number];

function getRuntimeUploadNamespace(refKind: string): string | null {
  return refKind === "upload" ? "upload" : null;
}

function toAttachmentContent(attachment: EvalAttachment): Buffer {
  return attachment.kind === "text"
    ? Buffer.from(attachment.content, "utf8")
    : Buffer.from(attachment.dataBase64, "base64");
}

/**
 * Runs individual test cases against an agent service
 */
export class TestRunner implements ITestRunner {
  private readonly agentService: IAgentService;
  private readonly llmJudge: ILLMJudge | null;
  private readonly runtimeUploads: IRuntimeUploadsNamespace | null;

  constructor(
    agentService: IAgentService,
    llmJudge?: ILLMJudge,
    runtimeUploads?: IRuntimeUploadsNamespace,
  ) {
    this.agentService = agentService;
    this.llmJudge = llmJudge ?? null;
    this.runtimeUploads = runtimeUploads ?? null;
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

    const baseContext = this.buildChatContext(testCase);
    let pendingApprovalIds: string[] = [];
    let previousAttachments: ChatAttachment[] = [];

    for (let i = 0; i < testCase.turns.length; i++) {
      const turn = testCase.turns[i];
      if (!turn) continue;
      const attachments = this.buildTurnAttachments(turn, previousAttachments);
      if (turn.attachments !== undefined) {
        await this.seedRuntimeUploads(turn.attachments);
        previousAttachments = attachments;
      }

      collector.startTurn();
      let response: AgentResponse;
      if (turn.confirmPendingAction !== undefined) {
        const approvalId = this.resolveApprovalId(turn, pendingApprovalIds);
        if (!approvalId) {
          const message =
            `Turn ${i}: cannot resolve approvalId for confirmPendingAction. ` +
            `Provide turn.approvalId explicitly when 0 or multiple confirmations are pending ` +
            `(pending=${pendingApprovalIds.length}).`;
          failures.push({
            criterion: "confirmPendingAction",
            expected:
              "Exactly one pending approval id or an explicit approvalId",
            actual: pendingApprovalIds,
            message,
          });
          response = {
            text: message,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            toolResults: [],
          };
        } else {
          response = await this.agentService.confirmPendingAction(
            conversationId,
            turn.confirmPendingAction,
            approvalId,
          );
        }
      } else {
        response = await this.agentService.chat(
          turn.userMessage,
          conversationId,
          this.withTurnAttachments(baseContext, attachments),
        );
      }
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
      response.cards?.filter(
        (card) =>
          card.kind === "tool-approval" && card.state === "approval-requested",
      ) ?? [];
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
      interfaceType: testCase.setup?.interfaceType ?? "evaluation",
      ...(testCase.setup?.channelId
        ? { channelId: testCase.setup.channelId }
        : {}),
      ...(testCase.setup?.channelName
        ? { channelName: testCase.setup.channelName }
        : {}),
    };
  }

  private buildTurnAttachments(
    turn: AgentTestCase["turns"][number],
    previousAttachments: ChatAttachment[],
  ): ChatAttachment[] {
    const explicitAttachments = (turn.attachments ?? []).map((attachment) =>
      this.toChatAttachment(attachment),
    );
    return [
      ...(turn.reusePreviousAttachments ? previousAttachments : []),
      ...explicitAttachments,
    ];
  }

  private toChatAttachment(attachment: EvalAttachment): ChatAttachment {
    if (attachment.kind === "text") {
      return {
        kind: "text",
        filename: attachment.filename,
        mediaType: attachment.mediaType,
        content: attachment.content,
        ...(attachment.sizeBytes !== undefined
          ? { sizeBytes: attachment.sizeBytes }
          : {}),
        ...(attachment.source !== undefined
          ? { source: attachment.source }
          : {}),
      };
    }

    const data = new Uint8Array(Buffer.from(attachment.dataBase64, "base64"));
    return {
      kind: "file",
      filename: attachment.filename,
      mediaType: attachment.mediaType,
      data,
      sizeBytes: attachment.sizeBytes ?? data.byteLength,
      ...(attachment.source !== undefined ? { source: attachment.source } : {}),
    };
  }

  private async seedRuntimeUploads(
    attachments: EvalAttachment[],
  ): Promise<void> {
    if (!this.runtimeUploads) return;

    for (const attachment of attachments) {
      const source = attachment.source;
      if (!source) continue;
      const namespace = getRuntimeUploadNamespace(source.kind);
      if (!namespace) continue;

      await this.runtimeUploads
        .scoped({
          namespace,
          refKind: source.kind,
          routePath: "",
          createId: () => source.id,
        })
        .save({
          filename: attachment.filename,
          mediaType: attachment.mediaType,
          content: toAttachmentContent(attachment),
        });
    }
  }

  private withTurnAttachments(
    context: ChatContext,
    attachments: ChatAttachment[],
  ): ChatContext {
    return attachments.length > 0 ? { ...context, attachments } : context;
  }

  /**
   * Create a fresh test runner instance
   */
  static createFresh(
    agentService: IAgentService,
    llmJudge?: ILLMJudge,
    runtimeUploads?: IRuntimeUploadsNamespace,
  ): TestRunner {
    return new TestRunner(agentService, llmJudge, runtimeUploads);
  }
}
