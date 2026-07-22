import {
  buildConfirmationResponseParts,
  buildResponsePlan,
  formatArtifactDisplay,
  formatConfirmationResult,
  formatPendingConfirmationHelp,
  getConfirmationResultTitle,
  PendingApprovalTracker,
  parseConfirmationIntent,
  routeConfirmationResponse,
  type AgentResponse,
  type InterfacePluginContext,
  type JobProgressEvent,
  type MessageInterfaceOutput,
  type ResponsePlan,
  type StructuredChatCard,
  type UserPermissionLevel,
} from "@brains/plugins";
import type { FileUpload, SentMessage } from "chat";
import { ApprovalCardTracker } from "./approval-card-tracker";
import { ArtifactDeliveryResolver } from "./artifact-delivery";
import { ChatCardBuilder } from "./chat-cards";
import { chunkForChannel } from "./chat-platform";
import {
  formatChatNoticePayload,
  toChatCardOutput,
  toPlatformPostOutput,
} from "./chat-output";
import type { ThreadRegistry } from "./thread-registry";
import type { ChatThread } from "./types";

const GENERIC_APPROVAL_TEXT =
  /^(?:(?:confirmation|approval) required|please confirm(?: this action)?)\.?$/i;

interface PendingJobArtifactDelivery {
  card: Extract<StructuredChatCard, { kind: "attachment" }>;
  channelId: string;
  userPermissionLevel: UserPermissionLevel;
}

interface ChatResponseCoordinatorDeps {
  getContext: () => InterfacePluginContext | undefined;
  getDisplayBaseUrl: () => string | undefined;
  registerPromptAction: (
    threadId: string,
    action: { label: string; prompt: string },
  ) => string;
  clearMessageComponents: (
    threadId: string,
    messageId: string,
  ) => Promise<void>;
  sendMessageWithId: (input: {
    channelId: string | null;
    message: MessageInterfaceOutput;
  }) => Promise<string | undefined>;
  handleAgentResponseToolStatuses: (
    response: Pick<AgentResponse, "cards" | "pendingConfirmations">,
    conversationId: string,
  ) => Promise<void>;
  trackAgentResponseForJob: (
    jobId: string,
    messageId: string,
    channelId: string,
  ) => void;
  threadRegistry: ThreadRegistry;
  logger: {
    debug: (message: string, context?: Record<string, unknown>) => void;
    error: (message: string, context?: Record<string, unknown>) => void;
  };
}

/**
 * Coordinates response planning and presentation after an agent turn, including
 * approval resolution and deferred native artifact delivery. Transport-specific
 * presentation remains limited to the existing Discord cards and Slack compact
 * output policy.
 */
export class ChatResponseCoordinator {
  private readonly deps: ChatResponseCoordinatorDeps;
  private readonly pendingApprovals: PendingApprovalTracker;
  private readonly pendingJobArtifacts = new Map<
    string,
    PendingJobArtifactDelivery[]
  >();
  private readonly activeSlackConfirmationConversations = new Set<string>();
  private readonly cardBuilder: ChatCardBuilder;
  private readonly artifactDelivery: ArtifactDeliveryResolver;
  private readonly approvalCards: ApprovalCardTracker;

  constructor(deps: ChatResponseCoordinatorDeps) {
    this.deps = deps;
    this.cardBuilder = new ChatCardBuilder({
      getDisplayBaseUrl: deps.getDisplayBaseUrl,
      registerPromptAction: deps.registerPromptAction,
    });
    this.artifactDelivery = new ArtifactDeliveryResolver({
      getContext: deps.getContext,
      getDisplayBaseUrl: deps.getDisplayBaseUrl,
      logger: deps.logger,
    });
    this.approvalCards = new ApprovalCardTracker({
      cardBuilder: this.cardBuilder,
      clearMessageComponents: deps.clearMessageComponents,
    });
    this.pendingApprovals = new PendingApprovalTracker({
      loadMessages: async (conversationId): Promise<readonly unknown[]> => {
        return (
          (await deps
            .getContext()
            ?.conversations.getMessages(conversationId, { limit: 50 })) ?? []
        );
      },
      onRestoreError: (error, conversationId): void => {
        deps.logger.debug("Failed to load pending chat approvals", {
          error,
          conversationId,
        });
      },
    });
  }

  clear(): void {
    this.pendingJobArtifacts.clear();
  }

  isActiveSlackConfirmation(conversationId: string): boolean {
    return this.activeSlackConfirmationConversations.has(conversationId);
  }

  async getPendingApprovalIds(conversationId: string): Promise<Set<string>> {
    return this.pendingApprovals.getApprovalIds(conversationId);
  }

  async handleConfirmationResponse(input: {
    message: string;
    conversationId: string;
    thread: ChatThread;
    approvalIds: Set<string>;
    userPermissionLevel: UserPermissionLevel;
    isAnchor: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<boolean> {
    if (!parseConfirmationIntent(input.message, input.approvalIds))
      return false;

    const routed = routeConfirmationResponse({
      message: input.message,
      approvalIds: input.approvalIds,
    });
    if (routed.kind === "not-confirmation") {
      this.pendingApprovals.deleteConversation(input.conversationId);
      const notice = formatChatNoticePayload("No pending approval to resolve.");
      await input.thread.post(
        toPlatformPostOutput(input.thread.id, notice) ??
          notice.fallbackText ??
          "No pending approval to resolve.",
      );
      return true;
    }

    if (routed.kind === "notice") {
      const notice = formatChatNoticePayload(routed.message);
      await input.thread.post(
        toPlatformPostOutput(input.thread.id, notice) ??
          notice.fallbackText ??
          routed.message,
      );
      return true;
    }

    await this.confirmApproval({
      thread: input.thread,
      conversationId: input.conversationId,
      approvalId: routed.approvalId,
      confirmed: routed.confirmed,
      userPermissionLevel: input.userPermissionLevel,
      isAnchor: input.isAnchor,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
    return true;
  }

  async confirmApproval(input: {
    thread: ChatThread;
    conversationId: string;
    approvalId: string;
    confirmed: boolean;
    userPermissionLevel: UserPermissionLevel;
    isAnchor: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const platform = input.thread.adapter.name;
    const compactSlackConfirmation = platform === "slack";
    if (compactSlackConfirmation) {
      this.activeSlackConfirmationConversations.add(input.conversationId);
    }
    try {
      const response = await this.deps
        .getContext()
        ?.agent.confirmPendingAction(
          input.conversationId,
          input.confirmed,
          input.approvalId,
          {
            userPermissionLevel: input.userPermissionLevel,
            isAnchor: input.isAnchor,
            interfaceType: platform,
            channelId: input.thread.id,
            channelName: input.thread.isDM ? "DM" : input.thread.channelId,
            ...input.metadata,
          },
        );
      this.pendingApprovals.removeApproval(
        input.conversationId,
        input.approvalId,
      );
      if (!response) return;

      await this.renderAgentResponse({
        thread: input.thread,
        channelId: input.thread.id,
        conversationId: input.conversationId,
        response,
        userPermissionLevel: input.userPermissionLevel,
        confirmation: {
          approvalId: input.approvalId,
          confirmed: input.confirmed,
        },
      });
    } finally {
      if (compactSlackConfirmation) {
        this.activeSlackConfirmationConversations.delete(input.conversationId);
      }
    }
  }

  async renderAgentResponse(input: {
    thread: ChatThread;
    channelId: string;
    conversationId: string;
    response: AgentResponse;
    userPermissionLevel: UserPermissionLevel;
    confirmation?: { approvalId: string; confirmed: boolean };
  }): Promise<void> {
    if (input.confirmation) {
      this.pendingApprovals.syncFromResponse(
        input.conversationId,
        input.response,
        input.confirmation.approvalId,
      );
    } else {
      this.pendingApprovals.rememberFromResponse(
        input.conversationId,
        input.response,
      );
    }
    await this.deps.handleAgentResponseToolStatuses(
      input.response,
      input.conversationId,
    );
    const artifactDelivery = await this.artifactDelivery.resolve(
      input.response.cards,
      input.userPermissionLevel,
    );
    const plan = buildResponsePlan(input.response, {
      deniedCardIds: artifactDelivery.deniedCardIds,
    });
    this.rememberPendingJobArtifacts(
      plan,
      input.channelId,
      input.userPermissionLevel,
      artifactDelivery.deliveredCardIds,
      artifactDelivery.deniedCardIds,
    );
    let resolvedNativeApproval = false;
    if (input.confirmation) {
      const display = formatConfirmationResult(
        input.response,
        input.confirmation.confirmed ? "approved" : "declined",
      );
      resolvedNativeApproval = await this.approvalCards.resolve(
        input.conversationId,
        input.confirmation.approvalId,
        {
          title: getConfirmationResultTitle(display.variant),
          detail: display.label,
        },
      );
    }
    const approvals = plan.directives.find(
      (directive) => directive.kind === "approvals",
    );
    const confirmations = approvals?.confirmations;
    const isSlack = input.thread.adapter.name === "slack";
    const hasArtifact = plan.directives.some(
      (directive) => directive.kind === "artifact",
    );
    const hasQueuedArtifact = plan.directives.some(
      (directive) =>
        directive.kind === "artifact" && Boolean(directive.card.jobId),
    );
    const hasDeniedArtifact = plan.directives.some(
      (directive) => directive.kind === "denied-artifact",
    );
    const suppressGenericConfirmation =
      isSlack &&
      !input.confirmation &&
      Boolean(confirmations?.length) &&
      GENERIC_APPROVAL_TEXT.test(input.response.text.trim());
    const suppressQueuedConfirmationResult =
      isSlack &&
      Boolean(input.confirmation) &&
      hasQueuedArtifact &&
      artifactDelivery.files.length === 0;
    const suppressResolvedNativeConfirmation =
      isSlack &&
      resolvedNativeApproval &&
      !confirmations?.length &&
      !hasArtifact &&
      !hasDeniedArtifact &&
      artifactDelivery.files.length === 0;
    const suppressConfirmationResult =
      suppressQueuedConfirmationResult || suppressResolvedNativeConfirmation;
    const suppressPrimaryMessage =
      suppressGenericConfirmation || suppressConfirmationResult;

    const message = input.confirmation
      ? this.formatConfirmationResponsePayload(
          input.response,
          input.confirmation.confirmed,
          this.pendingApprovals.formatRemainingApprovalHelp(
            input.conversationId,
            input.response,
          ),
          artifactDelivery.deniedCardIds,
        )
      : this.formatAgentResponseText(plan, artifactDelivery.deniedCardIds);
    const messageId = suppressPrimaryMessage
      ? undefined
      : await this.sendAgentResponseWithFiles({
          thread: input.thread,
          channelId: input.channelId,
          message,
          files: artifactDelivery.files,
        });
    const artifactMessageId = await this.sendArtifactCards(
      input.thread,
      plan,
      isSlack ? artifactDelivery.deliveredCardIds : undefined,
    );
    await this.sendSupplementalCards(
      input.thread,
      plan,
      suppressConfirmationResult,
    );
    if (isSlack && confirmations && confirmations.length > 1) {
      const approvalHelp = formatPendingConfirmationHelp(confirmations);
      if (approvalHelp) await input.thread.post(approvalHelp);
    } else {
      await this.approvalCards.trackPendingConfirmations(
        input.thread,
        input.conversationId,
        confirmations,
      );
    }

    const progressMessageId = artifactMessageId ?? messageId;
    if (progressMessageId) {
      for (const jobId of plan.jobIds) {
        this.deps.trackAgentResponseForJob(
          jobId,
          progressMessageId,
          input.channelId,
        );
      }
    }
  }

  async deliverCompletedJobArtifacts(
    event: Pick<JobProgressEvent, "id" | "status">,
  ): Promise<void> {
    if (event.status === "failed") {
      this.pendingJobArtifacts.delete(event.id);
      return;
    }
    if (event.status !== "completed") return;

    const pending = this.pendingJobArtifacts.get(event.id);
    if (!pending) return;
    this.pendingJobArtifacts.delete(event.id);

    for (const delivery of pending) {
      const thread = this.deps.threadRegistry.get(delivery.channelId);
      if (!thread) continue;
      try {
        const resolved = await this.artifactDelivery.resolve(
          [delivery.card],
          delivery.userPermissionLevel,
        );
        if (resolved.files.length === 0) continue;
        const sent = await thread.post(
          thread.adapter.name === "slack"
            ? { raw: "", files: resolved.files }
            : {
                markdown: `Generated artifact ready: ${resolved.files.map((file) => file.filename).join(", ")}`,
                files: resolved.files,
              },
        );
        this.deps.threadRegistry.trackMessage(delivery.channelId, sent);
      } catch (error: unknown) {
        this.deps.logger.error("Failed to deliver completed chat artifact", {
          error,
          jobId: event.id,
          cardId: delivery.card.id,
        });
      }
    }
  }

  private rememberPendingJobArtifacts(
    plan: ResponsePlan,
    channelId: string,
    userPermissionLevel: UserPermissionLevel,
    deliveredCardIds: ReadonlySet<string>,
    deniedCardIds: ReadonlySet<string>,
  ): void {
    for (const directive of plan.directives) {
      if (directive.kind !== "artifact" || !directive.card.jobId) continue;
      if (
        deliveredCardIds.has(directive.card.id) ||
        deniedCardIds.has(directive.card.id)
      ) {
        continue;
      }
      const pending = this.pendingJobArtifacts.get(directive.card.jobId) ?? [];
      this.pendingJobArtifacts.set(directive.card.jobId, [
        ...pending.filter((entry) => entry.card.id !== directive.card.id),
        { card: directive.card, channelId, userPermissionLevel },
      ]);
    }
  }

  private formatAgentResponseText(
    plan: ResponsePlan,
    deniedCardIds?: Set<string>,
  ): string {
    return plan.directives
      .flatMap((directive): string[] => {
        if (directive.kind === "text") return [directive.text];
        if (directive.kind === "denied-artifact") {
          return [
            this.cardBuilder.formatStructuredCard(
              directive.card,
              deniedCardIds,
            ),
          ];
        }
        return [];
      })
      .filter((part) => part.trim().length > 0)
      .join("\n\n");
  }

  private formatConfirmationResponsePayload(
    response: AgentResponse,
    confirmed: boolean,
    remainingApprovalHelp?: string,
    deniedCardIds?: Set<string>,
  ): MessageInterfaceOutput {
    const result = buildConfirmationResponseParts({
      response,
      confirmed,
      remainingApprovalHelp,
      deniedCardIds,
      formatCard: (card): string =>
        this.cardBuilder.formatStructuredCard(card, deniedCardIds),
      formatPendingConfirmationHelp,
    });

    return {
      card: {
        type: "card",
        title: getConfirmationResultTitle(result.variant),
        children: result.parts.map((content) => ({ type: "text", content })),
      },
      fallbackText: result.parts.join("\n\n"),
    };
  }

  private async sendAgentResponseWithFiles(input: {
    thread: ChatThread;
    channelId: string;
    message: MessageInterfaceOutput;
    files: FileUpload[];
  }): Promise<string | undefined> {
    if (input.files.length === 0) {
      return this.deps.sendMessageWithId({
        channelId: input.channelId,
        message: input.message,
      });
    }

    const cardOutput = toChatCardOutput(input.message);
    if (cardOutput) {
      const sent = await input.thread.post({
        ...cardOutput,
        files: input.files,
      });
      this.deps.threadRegistry.trackMessage(input.channelId, sent);
      return sent.id;
    }

    const text =
      typeof input.message === "string"
        ? input.message
        : "Generated artifacts attached.";
    const chunks = chunkForChannel(input.channelId, text);
    let lastSent: SentMessage | undefined;
    for (const [index, chunk] of chunks.entries()) {
      const isLastChunk = index === chunks.length - 1;
      lastSent = await input.thread.post(
        isLastChunk
          ? {
              markdown: chunk || "Generated artifacts attached.",
              files: input.files,
            }
          : chunk,
      );
      this.deps.threadRegistry.trackMessage(input.channelId, lastSent);
    }
    return lastSent?.id;
  }

  private async sendArtifactCards(
    thread: ChatThread,
    plan: ResponsePlan,
    skipCardIds?: ReadonlySet<string>,
  ): Promise<string | undefined> {
    let lastMessageId: string | undefined;
    for (const directive of plan.directives) {
      if (directive.kind !== "artifact") continue;
      if (skipCardIds?.has(directive.card.id)) continue;
      const display = formatArtifactDisplay(directive.card);
      if (!display) continue;
      const fallbackText = this.cardBuilder.formatArtifactFallback(display);
      const sent = await thread.post(
        thread.adapter.name === "slack"
          ? fallbackText
          : {
              card: this.cardBuilder.buildArtifactCard(display),
              fallbackText,
            },
      );
      this.deps.threadRegistry.trackMessage(thread.id, sent);
      lastMessageId = sent.id;
    }
    return lastMessageId;
  }

  private async sendSupplementalCards(
    thread: ChatThread,
    plan: ResponsePlan,
    suppressToolApproval = false,
  ): Promise<void> {
    for (const directive of plan.directives) {
      if (directive.kind !== "supplemental") continue;
      if (suppressToolApproval && directive.card.kind === "tool-approval") {
        continue;
      }
      const built = this.cardBuilder.buildSupplementalCard(
        thread.id,
        directive.card,
      );
      if (!built) continue;
      const fallbackText = this.cardBuilder.formatStructuredCard(
        directive.card,
      );
      const isSlack = thread.adapter.name === "slack";
      const sent = await thread.post(
        isSlack && directive.card.kind !== "actions"
          ? fallbackText
          : { card: built, fallbackText },
      );
      this.deps.threadRegistry.trackMessage(thread.id, sent);
    }
  }
}
