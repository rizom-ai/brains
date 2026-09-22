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
import { isRecord } from "@brains/utils/is-record";

type ChatAttachment = NonNullable<ChatContext["attachments"]>[number];
type AgentResponseCard = NonNullable<AgentResponse["cards"]>[number];
type ToolApprovalCard = Extract<AgentResponseCard, { kind: "tool-approval" }>;

function isToolApprovalCard(card: AgentResponseCard): card is ToolApprovalCard {
  return card.kind === "tool-approval";
}

function sanitizeEvalToolArgs(
  toolName: string,
  args: unknown,
): Record<string, unknown> {
  if (!isRecord(args)) return {};

  const { confirmationToken: _confirmationToken, ...argsWithoutToken } = args;
  if (!toolName.startsWith("system_")) return argsWithoutToken;

  const { confirmed: _confirmed, ...rest } = argsWithoutToken;
  return rest;
}

function getApprovalSignature(input: {
  toolName: string;
  args?: unknown;
  input?: unknown;
}): string {
  const args = input.args ?? input.input;
  return JSON.stringify({
    toolName: input.toolName,
    args: sanitizeEvalToolArgs(input.toolName, args),
  });
}

function dedupeApprovalIds(
  approvals: Array<{
    id: string;
    toolName: string;
    args?: unknown;
    input?: unknown;
  }>,
): string[] {
  const bySignature = new Map<string, string>();
  for (const approval of approvals) {
    const signature = getApprovalSignature(approval);
    if (!bySignature.has(signature)) {
      bySignature.set(signature, approval.id);
    }
  }
  return [...bySignature.values()];
}

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
      const fixtures = await this.seedRuntimeUploads(turn.attachments ?? []);
      const attachments = this.buildTurnAttachments(
        { ...turn, attachments: fixtures },
        previousAttachments,
      );
      if (turn.attachments !== undefined) previousAttachments = attachments;

      collector.startTurn();
      let response: AgentResponse;
      const pendingApprovalIdsBeforeTurn = pendingApprovalIds;
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
            this.buildTurnChatContext(baseContext, turn, attachments),
          );
        }
      } else {
        response = await this.agentService.chat(
          turn.userMessage,
          conversationId,
          this.buildTurnChatContext(baseContext, turn, attachments),
        );
      }
      pendingApprovalIds = this.nextPendingApprovalIds(
        pendingApprovalIds,
        turn,
        response,
      );
      const metrics = collector.endTurn({
        usage: response.usage,
        toolResults: this.collectToolCallsForMetrics(
          response,
          turn.confirmPendingAction !== undefined
            ? pendingApprovalIdsBeforeTurn
            : [],
        ),
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

  private collectToolCallsForMetrics(
    response: AgentResponse,
    existingPendingApprovalIds: string[] = [],
  ): Array<{
    toolName: string;
    args?: Record<string, unknown>;
    result?: unknown;
  }> {
    const existingPendingApprovalIdSet = new Set(existingPendingApprovalIds);
    const newPendingConfirmations =
      response.pendingConfirmations?.filter(
        (confirmation) => !existingPendingApprovalIdSet.has(confirmation.id),
      ) ?? [];

    return [
      ...(response.toolResults?.map((toolResult) => ({
        toolName: toolResult.toolName,
        args: sanitizeEvalToolArgs(toolResult.toolName, toolResult.args),
        result:
          toolResult.error !== undefined
            ? {
                success: false,
                error: toolResult.error.message,
                ...(toolResult.error.code !== undefined
                  ? { code: toolResult.error.code }
                  : {}),
              }
            : toolResult.data,
      })) ?? []),
      ...newPendingConfirmations.map((confirmation) => ({
        toolName: confirmation.toolName,
        args: sanitizeEvalToolArgs(confirmation.toolName, confirmation.args),
        result: { needsConfirmation: true },
      })),
    ];
  }

  private resolveApprovalId(
    turn: AgentTestCase["turns"][number],
    pendingApprovalIds: string[],
  ): string | undefined {
    if (turn.approvalId) return turn.approvalId;
    if (pendingApprovalIds.length !== 1) return undefined;
    return pendingApprovalIds[0];
  }

  private nextPendingApprovalIds(
    _currentIds: string[],
    _turn: AgentTestCase["turns"][number],
    response: AgentResponse,
  ): string[] {
    return this.extractPendingApprovalIds(response);
  }

  private extractPendingApprovalIds(response: AgentResponse): string[] {
    const approvalCards =
      response.cards?.filter(
        (card): card is ToolApprovalCard =>
          isToolApprovalCard(card) && card.state === "approval-requested",
      ) ?? [];
    if (approvalCards.length > 0) {
      return dedupeApprovalIds(
        approvalCards.map((card) => ({
          id: card.id,
          toolName: card.toolName,
          input: card.input,
        })),
      );
    }
    if (
      response.pendingConfirmations &&
      response.pendingConfirmations.length > 0
    ) {
      return dedupeApprovalIds(response.pendingConfirmations);
    }
    return [];
  }

  private buildChatContext(testCase: AgentTestCase): ChatContext {
    const userPermissionLevel: UserPermissionLevel =
      testCase.setup?.permissionLevel ?? "admin";

    return {
      userPermissionLevel,
      ...(testCase.setup?.isAnchor !== undefined
        ? { isAnchor: testCase.setup.isAnchor }
        : {}),
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

    if (!attachment.source)
      throw new Error("File evaluation fixture was not retained");
    return {
      kind: "file",
      filename: attachment.filename,
      mediaType: attachment.mediaType,
      ...(attachment.sizeBytes !== undefined
        ? { sizeBytes: attachment.sizeBytes }
        : {}),
      source: attachment.source,
    };
  }

  /** Evaluation fixture generation only, never an ingress or model-byte fallback.
   * Synthetic base64 fixtures are retained before invoking the reference-only agent. */
  private async seedRuntimeUploads(
    attachments: EvalAttachment[],
  ): Promise<EvalAttachment[]> {
    const seeded: EvalAttachment[] = [];
    for (const attachment of attachments) {
      if (!this.runtimeUploads) {
        if (attachment.kind === "file")
          throw new Error(
            "File evaluation fixtures require runtime upload storage",
          );
        seeded.push(attachment);
        continue;
      }
      const source = attachment.source;
      const namespace = source
        ? getRuntimeUploadNamespace(source.kind)
        : attachment.kind === "file"
          ? "upload"
          : undefined;
      if (!namespace) {
        if (attachment.kind === "file")
          throw new Error("Unsupported evaluation upload namespace");
        seeded.push(attachment);
        continue;
      }
      const record = await this.runtimeUploads
        .scoped({
          namespace,
          refKind: source?.kind ?? "upload",
          routePath: "",
          ...(source ? { createId: (): string => source.id } : {}),
        })
        .save({
          filename: attachment.filename,
          mediaType: attachment.mediaType,
          content: toAttachmentContent(attachment),
        });
      seeded.push(
        attachment.kind === "file"
          ? { ...attachment, source: record.ref, sizeBytes: record.sizeBytes }
          : attachment,
      );
    }
    return seeded;
  }

  private buildTurnChatContext(
    baseContext: ChatContext,
    turn: AgentTestCase["turns"][number],
    attachments: ChatAttachment[],
  ): ChatContext {
    const context: ChatContext = { ...baseContext };
    const turnContext = turn.context;

    if (turnContext) {
      if (turnContext.userPermissionLevel !== undefined) {
        context.userPermissionLevel = turnContext.userPermissionLevel;
      }
      if (turnContext.isAnchor !== undefined) {
        context.isAnchor = turnContext.isAnchor;
      }
      if (turnContext.interfaceType !== undefined) {
        context.interfaceType = turnContext.interfaceType;
      }
      if (turnContext.channelId !== undefined) {
        context.channelId = turnContext.channelId;
      }
      if (turnContext.channelName !== undefined) {
        context.channelName = turnContext.channelName;
      }
      if (turnContext.actor !== undefined) {
        context.actor = turnContext.actor;
      }
      if (turnContext.source !== undefined) {
        context.source = turnContext.source;
      }
    }

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
