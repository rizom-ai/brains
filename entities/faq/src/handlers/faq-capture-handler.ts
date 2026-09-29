import type {
  EntityPluginContext,
  IConversationsNamespace,
  Message,
} from "@brains/plugins";
import {
  BaseJobHandler,
  UserPermissionLevelSchema,
  internalFullScope,
  permissionToVisibilityScope,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import { faqAdapter, faqMetadata } from "../adapters/faq-adapter";
import type { FaqFrontmatter } from "../schemas/faq";
import { findSameFaq, mergeIntoFaq, type FaqStoreDeps } from "../lib/faq-store";

/** Messages before the reply searched for the question it answers. */
const QUESTION_LOOKBACK = 20;

/**
 * Messages after the recorded position still searched for the reply: another
 * message can land between the reply being stored and its position counted.
 */
const ARRIVAL_SLACK = 10;

export const faqCaptureJobSchema: z.ZodObject<{
  conversationId: z.ZodString;
  messageId: z.ZodString;
  userPermissionLevel: typeof UserPermissionLevelSchema;
  position: z.ZodNumber;
}> = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  userPermissionLevel: UserPermissionLevelSchema,
  /** The reply's 1-based position in its conversation when it was stored. */
  position: z.number().int().nonnegative(),
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

export interface FaqCaptureDeps extends FaqStoreDeps {
  entityService: Pick<
    EntityPluginContext["entityService"],
    "listEntities" | "getEntity" | "createEntity" | "updateEntity"
  >;
  conversations: Pick<IConversationsNamespace, "getMessages">;
  ai: Pick<EntityPluginContext["ai"], "generateObject">;
}

/** Longest question slug kept in an id, so ids stay readable. */
const ID_SLUG_LENGTH = 60;

/**
 * A readable, unique FAQ id: the question's slug, then the source reply's id.
 * The reply id keeps the same question at two visibilities apart; a question
 * with no latin letters falls back to "faq".
 */
export function faqEntityId(question: string, messageId: string): string {
  const slug = slugify(question).slice(0, ID_SLUG_LENGTH).replace(/-+$/, "");
  return `${slug || "faq"}-${slugify(messageId)}`;
}

function buildClassificationPrompt(question: string, answer: string): string {
  return [
    "Decide whether this chat exchange belongs in a FAQ.",
    "Accept only a question other people could plausibly ask, with an answer that stands on its own.",
    "Questions about this brain or its owner's public work (what do you write about, what do you offer, how do I reach you) are reusable: visitors ask them.",
    "Reject greetings, small talk, confirmations, requests to perform an action, and answers that only concern the asker's own private situation or this conversation.",
    "When accepting, rewrite the question and the answer so they read without the conversation. Do not add facts that are not in the answer.",
    "",
    "Question:",
    question,
    "",
    "Answer:",
    answer,
  ].join("\n");
}

/** One structured AI call: is the exchange reusable, and its standalone form. */
export async function classifyExchange(
  ai: Pick<EntityPluginContext["ai"], "generateObject">,
  question: string,
  answer: string,
): Promise<FaqClassification> {
  const { object } = await ai.generateObject(
    buildClassificationPrompt(question, answer),
    faqClassificationSchema,
  );
  return object;
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
      {
        range: {
          start: Math.max(1, data.position - QUESTION_LOOKBACK),
          end: data.position + ARRIVAL_SLACK,
        },
      },
    );
    const answerIndex = messages.findIndex(
      (message) => message.id === data.messageId,
    );
    const answer = messages[answerIndex];
    if (!answer) return { captured: false, reason: "answer-not-found" };

    const question = findQuestion(messages, answerIndex);
    if (!question) return { captured: false, reason: "no-question" };

    const classification = await classifyExchange(
      this.deps.ai,
      question.content,
      answer.content,
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

    const match = await findSameFaq(this.deps, { content, visibility });
    if (match && (await mergeIntoFaq(this.deps, match, [data.messageId]))) {
      return { captured: true, entityId: match.id, merged: true };
    }

    const entityId = faqEntityId(classification.question, data.messageId);
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
}
