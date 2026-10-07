import {
  buildConfirmationResponseParts,
  formatArtifactDisplay,
  formatConfirmationResult,
  formatPendingConfirmationHelp,
  getConfirmationResultTitle,
  type AgentResponse,
  type JobProgressEvent,
  type MessageOutput,
  type PendingConfirmation,
  type PresentedConfirmation,
  type PresentedMessage,
  type ResponseRenderDirective,
  type StructuredChatCard,
  type ToolStatusUpdate,
  type UserPermissionLevel,
} from "@brains/sdk/interfaces";
import type { Logger } from "@brains/utils/logger";
import type { FileUpload, SentMessage } from "chat";
import { ApprovalCardTracker } from "./approval-card-tracker";
import type { ArtifactDeliveryResolver } from "./artifact-delivery";
import { buildProgressCard, ChatCardBuilder } from "./chat-cards";
import { getChatConversationId } from "./chat-metadata";
import {
  toChatCardOutput,
  toPlatformPostOutput,
  type ChatCardOutput,
} from "./chat-output";
import { chunkForChannel } from "./chat-platform";
import type { PromptActionStore } from "./prompt-action-store";
import type { ThreadRegistry } from "./thread-registry";
import { ToolStatusMessenger } from "./tool-status-messenger";
import type { ChatPlatform, ChatThread } from "./types";

const GENERIC_APPROVAL_TEXT =
  /^(?:(?:confirmation|approval) required|please confirm(?: this action)?)\.?$/i;

type AttachmentCard = Extract<StructuredChatCard, { kind: "attachment" }>;
type ToolApprovalCard = Extract<StructuredChatCard, { kind: "tool-approval" }>;

interface PendingJobArtifactDelivery {
  card: AttachmentCard;
  channelId: string;
  userPermissionLevel: UserPermissionLevel;
}

/**
 * The answer, read back off the directives the runtime built.
 *
 * The runtime decides what an answer is made of; the presentation helpers
 * this channel shares with the others were written over the response. Both
 * are views of the same thing, and this is the one that puts them together.
 */
interface Answer {
  text: string;
  cards: StructuredChatCard[];
  pendingConfirmations: PendingConfirmation[];
  toolResults: NonNullable<AgentResponse["toolResults"]>;
  deniedCardIds: Set<string>;
  artifactCards: AttachmentCard[];
  supplementalCards: Exclude<StructuredChatCard, { kind: "attachment" }>[];
}

function readAnswer(directives: readonly ResponseRenderDirective[]): Answer {
  const answer: Answer = {
    text: "",
    cards: [],
    pendingConfirmations: [],
    toolResults: [],
    deniedCardIds: new Set(),
    artifactCards: [],
    supplementalCards: [],
  };
  const texts: string[] = [];
  for (const directive of directives) {
    switch (directive.kind) {
      case "text":
        texts.push(directive.text);
        break;
      case "tool-result":
        answer.toolResults.push(directive.result);
        break;
      case "denied-artifact":
        answer.deniedCardIds.add(directive.card.id);
        answer.cards.push(directive.card);
        break;
      case "artifact":
        answer.artifactCards.push(directive.card);
        answer.cards.push(directive.card);
        break;
      case "supplemental":
        answer.supplementalCards.push(directive.card);
        answer.cards.push(directive.card);
        break;
      case "approvals":
        answer.pendingConfirmations.push(...directive.confirmations);
        answer.cards.push(...directive.cards);
        break;
    }
  }
  answer.text = texts.join("\n\n");
  return answer;
}

interface ChatPresenterDeps {
  platform: ChatPlatform;
  threads: ThreadRegistry;
  promptActions: PromptActionStore;
  displayBaseUrl: string | undefined;
  artifacts: ArtifactDeliveryResolver;
  clearMessageComponents: (
    threadId: string,
    messageId: string,
  ) => Promise<void>;
  logger: Logger;
}

/**
 * How an answer, a progress update and a tool's status read on this platform.
 *
 * Discord gets cards with buttons and the artifact's bytes attached; Slack
 * gets compact text and native files, with the chatter around an approval
 * folded into the card that resolves it. The runtime hands over what to
 * show; this decides what it looks like and posts it, and hands back the id
 * of the message the runtime should edit when the jobs in it finish.
 */
export class ChatPresenter {
  private readonly deps: ChatPresenterDeps;
  private readonly cards: ChatCardBuilder;
  private readonly approvalCards: ApprovalCardTracker;
  private readonly toolStatuses: ToolStatusMessenger;
  private readonly pendingJobArtifacts = new Map<
    string,
    PendingJobArtifactDelivery[]
  >();
  /** Conversations a native approval button is being resolved in right now. */
  private readonly activeConfirmations = new Set<string>();
  /** Per conversation, the tools whose approval Slack shows as a card, not a status. */
  private readonly approvalTools = new Map<string, Set<string>>();

  constructor(deps: ChatPresenterDeps) {
    this.deps = deps;
    this.cards = new ChatCardBuilder({
      getDisplayBaseUrl: (): string | undefined => deps.displayBaseUrl,
      registerPromptAction: (threadId, action): string =>
        deps.promptActions.register(threadId, action),
    });
    this.approvalCards = new ApprovalCardTracker({
      cardBuilder: this.cards,
      clearMessageComponents: deps.clearMessageComponents,
    });
    this.toolStatuses = new ToolStatusMessenger(deps.threads);
  }

  clear(): void {
    this.pendingJobArtifacts.clear();
    this.activeConfirmations.clear();
    this.approvalTools.clear();
    this.toolStatuses.clear();
  }

  beginConfirmation(conversationId: string): void {
    if (this.deps.platform === "slack")
      this.activeConfirmations.add(conversationId);
  }

  endConfirmation(conversationId: string): void {
    this.activeConfirmations.delete(conversationId);
  }

  async present(input: {
    channelId: string;
    directives: readonly ResponseRenderDirective[];
    permissionLevel: UserPermissionLevel;
    confirmation: PresentedConfirmation | undefined;
  }): Promise<PresentedMessage | undefined> {
    const thread = this.deps.threads.get(input.channelId);
    if (!thread) return undefined;
    const isSlack = this.deps.platform === "slack";
    const conversationId = getChatConversationId(
      this.deps.platform,
      input.channelId,
    );
    const answer = readAnswer(input.directives);
    this.rememberApprovalTools(conversationId, answer);

    const delivery = await this.deps.artifacts.resolve(
      answer.cards,
      input.permissionLevel,
    );
    const deniedCardIds = new Set([
      ...answer.deniedCardIds,
      ...delivery.deniedCardIds,
    ]);
    this.rememberPendingJobArtifacts(
      answer.artifactCards,
      input.channelId,
      input.permissionLevel,
      delivery.deliveredCardIds,
      deniedCardIds,
    );

    let resolvedNativeApproval = false;
    if (input.confirmation) {
      const display = formatConfirmationResult(
        answer,
        input.confirmation.approved ? "approved" : "declined",
      );
      resolvedNativeApproval = await this.approvalCards.resolve(
        conversationId,
        input.confirmation.approvalId,
        {
          title: getConfirmationResultTitle(display.variant),
          detail: display.label,
        },
      );
    }

    const confirmations = answer.pendingConfirmations;
    const hasArtifact = answer.artifactCards.length > 0;
    const hasQueuedArtifact = answer.artifactCards.some((card) =>
      Boolean(card.jobId),
    );
    const hasDeniedArtifact = deniedCardIds.size > 0;
    const suppressGenericConfirmation =
      isSlack &&
      !input.confirmation &&
      confirmations.length > 0 &&
      GENERIC_APPROVAL_TEXT.test(answer.text.trim());
    const suppressQueuedConfirmationResult =
      isSlack &&
      Boolean(input.confirmation) &&
      hasQueuedArtifact &&
      delivery.files.length === 0;
    const suppressResolvedNativeConfirmation =
      isSlack &&
      resolvedNativeApproval &&
      confirmations.length === 0 &&
      !hasArtifact &&
      !hasDeniedArtifact &&
      delivery.files.length === 0;
    const suppressConfirmationResult =
      suppressQueuedConfirmationResult || suppressResolvedNativeConfirmation;
    const suppressPrimaryMessage =
      suppressGenericConfirmation || suppressConfirmationResult;

    const message = input.confirmation
      ? this.confirmationPayload(answer, input.confirmation, deniedCardIds)
      : this.answerText(answer, deniedCardIds);
    const messageId = suppressPrimaryMessage
      ? undefined
      : await this.postWithFiles(thread, message, delivery.files);
    const artifactMessageId = await this.postArtifactCards(
      thread,
      answer.artifactCards,
      isSlack ? delivery.deliveredCardIds : undefined,
    );
    await this.postSupplementalCards(
      thread,
      answer.supplementalCards,
      suppressConfirmationResult,
    );
    if (isSlack && confirmations.length > 1) {
      const approvalHelp = formatPendingConfirmationHelp(confirmations);
      if (approvalHelp) await thread.post(approvalHelp);
    } else {
      await this.approvalCards.trackPendingConfirmations(
        thread,
        conversationId,
        confirmations,
      );
    }

    const tracked = artifactMessageId ?? messageId;
    return tracked ? { messageId: tracked } : undefined;
  }

  /**
   * A message the runtime sends outside an answer: a job's progress, drawn as
   * a card when there is an event to draw it from, or plain text otherwise.
   */
  async send(
    channelId: string,
    message: MessageOutput,
    event: JobProgressEvent | undefined,
  ): Promise<string | undefined> {
    const thread = this.deps.threads.get(channelId);
    if (!thread) return undefined;
    const output = event ? buildProgressCard(event) : message.text;
    const postOutput = toPlatformPostOutput(channelId, output);
    let lastSent: SentMessage | undefined;
    if (postOutput !== undefined) {
      lastSent = await thread.post(postOutput);
      this.deps.threads.trackMessage(thread.id, lastSent);
    } else {
      const text = typeof output === "string" ? output : output.fallbackText;
      for (const chunk of chunkForChannel(channelId, text)) {
        lastSent = await thread.post(chunk);
        this.deps.threads.trackMessage(thread.id, lastSent);
      }
    }
    if (event) await this.deliverCompletedJobArtifacts(event);
    return lastSent?.id;
  }

  async edit(
    channelId: string,
    messageId: string,
    message: MessageOutput,
    event: JobProgressEvent | undefined,
  ): Promise<void> {
    const sent = this.deps.threads.getMessage(channelId, messageId);
    if (sent) {
      const output = event ? buildProgressCard(event) : message.text;
      try {
        const edited = await sent.edit(
          toPlatformPostOutput(channelId, output) ??
            (typeof output === "string" ? output : output.fallbackText),
        );
        this.deps.threads.trackMessage(channelId, edited);
      } catch (error: unknown) {
        // The platform rejected the edit. A stale progress card is cosmetic;
        // the job's outcome still reaches the thread through its artifacts.
        this.deps.logger.debug("Failed to edit chat message", {
          error,
          channelId,
          messageId,
        });
      }
    }
    if (event) await this.deliverCompletedJobArtifacts(event);
  }

  async toolStatus(update: ToolStatusUpdate): Promise<void> {
    if (!update.channelId) return;
    const isSlack = this.deps.platform === "slack";
    const compacted =
      isSlack &&
      (this.activeConfirmations.has(update.conversationId) ||
        (this.approvalTools.get(update.conversationId)?.has(update.toolName) ??
          false) ||
        update.state === "completed");
    if (compacted) {
      await this.toolStatuses.dismiss(update);
      return;
    }
    await this.toolStatuses.handle(update);
  }

  /**
   * Slack folds an approval into the card that asks for it, so the tool's
   * running status would only repeat the card. Remembered per conversation
   * from what the answer carried, replaced on the next answer.
   */
  private rememberApprovalTools(conversationId: string, answer: Answer): void {
    if (this.deps.platform !== "slack") return;
    const tools = new Set<string>([
      ...answer.pendingConfirmations.map(
        (confirmation) => confirmation.toolName,
      ),
      ...answer.cards
        .filter(
          (card): card is ToolApprovalCard => card.kind === "tool-approval",
        )
        .map((card) => card.toolName),
    ]);
    this.approvalTools.set(conversationId, tools);
  }

  private async deliverCompletedJobArtifacts(
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
      const thread = this.deps.threads.get(delivery.channelId);
      if (!thread) continue;
      try {
        const resolved = await this.deps.artifacts.resolve(
          [delivery.card],
          delivery.userPermissionLevel,
        );
        if (resolved.files.length === 0) continue;
        const sent = await thread.post(
          this.deps.platform === "slack"
            ? { raw: "", files: resolved.files }
            : {
                markdown: `Generated artifact ready: ${resolved.files.map((file) => file.filename).join(", ")}`,
                files: resolved.files,
              },
        );
        this.deps.threads.trackMessage(delivery.channelId, sent);
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
    cards: readonly AttachmentCard[],
    channelId: string,
    userPermissionLevel: UserPermissionLevel,
    deliveredCardIds: ReadonlySet<string>,
    deniedCardIds: ReadonlySet<string>,
  ): void {
    for (const card of cards) {
      if (!card.jobId) continue;
      if (deliveredCardIds.has(card.id) || deniedCardIds.has(card.id)) continue;
      const pending = this.pendingJobArtifacts.get(card.jobId) ?? [];
      this.pendingJobArtifacts.set(card.jobId, [
        ...pending.filter((entry) => entry.card.id !== card.id),
        { card, channelId, userPermissionLevel },
      ]);
    }
  }

  private answerText(answer: Answer, deniedCardIds: Set<string>): string {
    const denied = answer.cards
      .filter(
        (card): card is AttachmentCard =>
          card.kind === "attachment" && deniedCardIds.has(card.id),
      )
      .map((card) => this.cards.formatStructuredCard(card, deniedCardIds));
    return [answer.text, ...denied]
      .filter((part) => part.trim().length > 0)
      .join("\n\n");
  }

  private confirmationPayload(
    answer: Answer,
    confirmation: PresentedConfirmation,
    deniedCardIds: Set<string>,
  ): ChatCardOutput {
    // An answer that restates what is pending speaks for itself; one that
    // says nothing leaves the runtime's count of what remains to be shown.
    const remainingApprovalHelp =
      answer.pendingConfirmations.length === 0 &&
      confirmation.remaining.length > 0
        ? `Remaining pending approval ids: ${confirmation.remaining
            .map((approvalId) => `\`${approvalId}\``)
            .join(", ")}.`
        : undefined;
    const result = buildConfirmationResponseParts({
      response: answer,
      confirmed: confirmation.approved,
      remainingApprovalHelp,
      deniedCardIds,
      formatCard: (card): string =>
        this.cards.formatStructuredCard(card, deniedCardIds),
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

  private async postWithFiles(
    thread: ChatThread,
    message: ChatCardOutput | string,
    files: FileUpload[],
  ): Promise<string | undefined> {
    const channelId = thread.id;
    if (files.length === 0) {
      const postOutput = toPlatformPostOutput(channelId, message);
      if (postOutput !== undefined) {
        const sent = await thread.post(postOutput);
        this.deps.threads.trackMessage(channelId, sent);
        return sent.id;
      }
      if (typeof message !== "string") return undefined;
      let lastSent: SentMessage | undefined;
      for (const chunk of chunkForChannel(channelId, message)) {
        lastSent = await thread.post(chunk);
        this.deps.threads.trackMessage(channelId, lastSent);
      }
      return lastSent?.id;
    }

    const cardOutput = toChatCardOutput(message);
    if (cardOutput) {
      const sent = await thread.post({ ...cardOutput, files });
      this.deps.threads.trackMessage(channelId, sent);
      return sent.id;
    }
    const text =
      typeof message === "string" ? message : "Generated artifacts attached.";
    const chunks = chunkForChannel(channelId, text);
    let lastSent: SentMessage | undefined;
    for (const [index, chunk] of chunks.entries()) {
      const isLastChunk = index === chunks.length - 1;
      lastSent = await thread.post(
        isLastChunk
          ? { markdown: chunk || "Generated artifacts attached.", files }
          : chunk,
      );
      this.deps.threads.trackMessage(channelId, lastSent);
    }
    return lastSent?.id;
  }

  private async postArtifactCards(
    thread: ChatThread,
    cards: readonly AttachmentCard[],
    skipCardIds?: ReadonlySet<string>,
  ): Promise<string | undefined> {
    let lastMessageId: string | undefined;
    for (const card of cards) {
      if (skipCardIds?.has(card.id)) continue;
      const display = formatArtifactDisplay(card);
      if (!display) continue;
      const fallbackText = this.cards.formatArtifactFallback(display);
      const sent = await thread.post(
        this.deps.platform === "slack"
          ? fallbackText
          : { card: this.cards.buildArtifactCard(display), fallbackText },
      );
      this.deps.threads.trackMessage(thread.id, sent);
      lastMessageId = sent.id;
    }
    return lastMessageId;
  }

  private async postSupplementalCards(
    thread: ChatThread,
    cards: readonly Exclude<StructuredChatCard, { kind: "attachment" }>[],
    suppressToolApproval: boolean,
  ): Promise<void> {
    const isSlack = this.deps.platform === "slack";
    for (const card of cards) {
      if (suppressToolApproval && card.kind === "tool-approval") continue;
      const built = this.cards.buildSupplementalCard(thread.id, card);
      if (!built) continue;
      const fallbackText = this.cards.formatStructuredCard(card);
      const sent = await thread.post(
        isSlack && card.kind !== "actions"
          ? fallbackText
          : { card: built, fallbackText },
      );
      this.deps.threads.trackMessage(thread.id, sent);
    }
  }
}
