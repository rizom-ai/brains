import type {
  ContentVisibility,
  EntityPluginContext,
  IConversationsNamespace,
  Message,
} from "@brains/plugins";
import {
  BaseJobHandler,
  findNearestEntity,
  UserPermissionLevelSchema,
  internalFullScope,
  permissionToVisibilityScope,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { faqAdapter, faqMetadata } from "../adapters/faq-adapter";
import { faqSchema, type FaqEntity, type FaqFrontmatter } from "../schemas/faq";

/** How far back from the newest message a reply is looked up. */
const RECENT_MESSAGE_LIMIT = 50;

/**
 * Cosine distance between FAQ markdowns within which they ask the same
 * question. Stored FAQs are embedded as markdown, so the new FAQ is measured
 * in that form too. Measured paraphrases sit at 0.03–0.14, a different
 * question on the same subject at 0.43 and beyond.
 */
const SAME_QUESTION_DISTANCE = 0.2;

/** Writes a merge tries before failing the job so the queue retries it. */
const MERGE_ATTEMPTS = 3;

export const faqCaptureJobSchema: z.ZodObject<{
  conversationId: z.ZodString;
  messageId: z.ZodString;
  userPermissionLevel: typeof UserPermissionLevelSchema;
}> = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  userPermissionLevel: UserPermissionLevelSchema,
});

export type FaqCaptureJobData = z.output<typeof faqCaptureJobSchema>;

export const faqClassificationSchema: z.ZodObject<{
  reusable: z.ZodBoolean;
  question: z.ZodString;
  answer: z.ZodString;
}> = z.object({
  reusable: z
    .boolean()
    .describe(
      "True only when other people could plausibly ask this question and the answer stands on its own.",
    ),
  question: z
    .string()
    .describe(
      "The question rewritten to stand alone; empty when not reusable.",
    ),
  answer: z
    .string()
    .describe(
      "The answer rewritten as standalone markdown; empty when not reusable.",
    ),
});

export type FaqClassification = z.output<typeof faqClassificationSchema>;

export type FaqCaptureResult =
  | { captured: true; entityId: string; merged: boolean }
  | {
      captured: false;
      reason:
        | "answer-not-found"
        | "no-question"
        | "already-captured"
        | "not-reusable";
    };

export interface FaqCaptureDeps {
  entityService: Pick<
    EntityPluginContext["entityService"],
    "listEntities" | "getEntity" | "createEntity" | "updateEntity"
  >;
  searchWithDistances: EntityPluginContext["entityService"]["searchWithDistances"];
  conversations: Pick<IConversationsNamespace, "getMessages">;
  ai: Pick<EntityPluginContext["ai"], "generateObject">;
}

export function faqEntityId(messageId: string): string {
  return `faq-${messageId}`;
}

function buildClassificationPrompt(question: string, answer: string): string {
  return [
    "Decide whether this chat exchange belongs in a FAQ.",
    "Accept only a question other people could plausibly ask, with an answer that stands on its own.",
    "Reject greetings, small talk, confirmations, requests to perform an action, and answers about one person's private situation or this conversation only.",
    "When accepting, rewrite the question and the answer so they read without the conversation. Do not add facts that are not in the answer.",
    "",
    "Question:",
    question,
    "",
    "Answer:",
    answer,
  ].join("\n");
}

/** The user message the reply at `answerIndex` responds to. */
function findQuestion(
  messages: Message[],
  answerIndex: number,
): Message | undefined {
  return messages
    .slice(0, answerIndex)
    .reverse()
    .find((message) => message.role === "user");
}

/**
 * Turns one assistant reply into a draft FAQ when the exchange is reusable,
 * or counts it against an existing FAQ that asks the same question.
 * The FAQ takes the visibility of the turn that produced the answer, so it is
 * never readable more widely than the content the answer could draw on, and a
 * reply only merges into a FAQ of exactly that visibility.
 */
export class FaqCaptureHandler extends BaseJobHandler<
  "faq-capture",
  FaqCaptureJobData,
  FaqCaptureResult
> {
  private readonly deps: FaqCaptureDeps;

  constructor(logger: Logger, deps: FaqCaptureDeps) {
    super(logger, { schema: faqCaptureJobSchema, jobTypeName: "faq-capture" });
    this.deps = deps;
  }

  async process(
    data: FaqCaptureJobData,
    _jobId: string,
    _progressReporter: ProgressReporter,
  ): Promise<FaqCaptureResult> {
    if (await this.isCaptured(data.messageId)) {
      return { captured: false, reason: "already-captured" };
    }

    const messages = await this.deps.conversations.getMessages(
      data.conversationId,
      { limit: RECENT_MESSAGE_LIMIT },
    );
    const answerIndex = messages.findIndex(
      (message) => message.id === data.messageId,
    );
    const answer = messages[answerIndex];
    if (!answer) return { captured: false, reason: "answer-not-found" };

    const question = findQuestion(messages, answerIndex);
    if (!question) return { captured: false, reason: "no-question" };

    const { object: classification } = await this.deps.ai.generateObject(
      buildClassificationPrompt(question.content, answer.content),
      faqClassificationSchema,
    );
    if (!classification.reusable) {
      return { captured: false, reason: "not-reusable" };
    }

    const visibility = permissionToVisibilityScope(data.userPermissionLevel);
    const frontmatter: FaqFrontmatter = {
      question: classification.question,
      status: "draft",
      sourceConversationId: data.conversationId,
      sourceMessageId: data.messageId,
      mergedMessageIds: [],
    };
    const content = faqAdapter.createFaqContent(
      frontmatter,
      classification.answer,
    );

    const match = await this.findSameQuestion(content, visibility);
    if (match && (await this.merge(match, data.messageId))) {
      return { captured: true, entityId: match.id, merged: true };
    }

    const entityId = faqEntityId(data.messageId);
    await this.deps.entityService.createEntity({
      entity: {
        id: entityId,
        entityType: "faq",
        content,
        visibility,
        metadata: faqMetadata(frontmatter),
      },
    });
    return { captured: true, entityId, merged: false };
  }

  /** Whether a FAQ already records this reply as its source or a merge. */
  private async isCaptured(messageId: string): Promise<boolean> {
    const existing = await this.deps.entityService.listEntities({
      entityType: "faq",
      options: {
        limit: 1,
        filter: {
          contentContains: messageId,
          visibilityScope: internalFullScope("faq capture idempotency"),
        },
      },
    });
    return existing.length > 0;
  }

  /** A stored FAQ of exactly `visibility` that asks the question `content` asks. */
  private findSameQuestion(
    content: string,
    visibility: ContentVisibility,
  ): Promise<FaqEntity | undefined> {
    return findNearestEntity(
      {
        searchWithDistances: this.deps.searchWithDistances,
        getEntity: (request) =>
          this.deps.entityService.getEntity(request, faqSchema),
      },
      {
        query: content,
        entityType: "faq",
        maxDistance: SAME_QUESTION_DISTANCE,
        visibility,
      },
    );
  }

  /**
   * Records `messageId` on `faq`, writing only over the version that was read.
   * A concurrent merge makes the write stale; the FAQ is re-read and the merge
   * reapplied. False when the FAQ disappeared, so the caller creates one.
   */
  private async merge(
    faq: FaqEntity,
    messageId: string,
    attemptsLeft: number = MERGE_ATTEMPTS,
  ): Promise<boolean> {
    const { frontmatter, answer } = faqAdapter.parseFaqContent(faq.content);
    if (frontmatter.mergedMessageIds.includes(messageId)) return true;

    const merged: FaqFrontmatter = {
      ...frontmatter,
      mergedMessageIds: [...frontmatter.mergedMessageIds, messageId],
    };
    const result = await this.deps.entityService.updateEntity({
      entity: {
        ...faq,
        content: faqAdapter.createFaqContent(merged, answer),
        metadata: faqMetadata(merged),
      },
      options: { expectedContentHash: faq.contentHash },
    });
    if (result.skipReason !== "content-conflict") return true;
    if (attemptsLeft <= 1) {
      throw new Error(`FAQ ${faq.id} kept changing during merge`);
    }

    const current = await this.deps.entityService.getEntity(
      {
        entityType: "faq",
        id: faq.id,
        visibilityScope: internalFullScope("faq merge retry"),
      },
      faqSchema,
    );
    if (!current) return false;
    return this.merge(current, messageId, attemptsLeft - 1);
  }
}
