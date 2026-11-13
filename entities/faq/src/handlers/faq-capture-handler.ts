import { EntityWriteConflictError } from "@brains/sdk/internal/entity-runtime";
import { permissionToVisibilityScope } from "@brains/sdk/internal/interface-runtime";
import {
  UserPermissionLevelSchema,
  firstPartyJobHandler,
  internalFullScope,
  type FirstPartyJobHandler,
  type Message,
  type ServiceAI,
  type ServiceConversations,
  type ServiceEntityMutations,
  type ServiceEntityReads,
} from "@brains/sdk/internal/service-runtime";
import { slugify, truncateSlug } from "@brains/utils/string-utils";
import { getGuestSourceCards } from "@brains/contracts/chat";
import { z } from "@brains/utils/zod";
import { faqDocument, faqRecord } from "../lib/faq-body";
import type { FaqFrontmatter, FaqSource } from "../schemas/faq";
import { findSameFaq, mergeIntoFaq, type FaqStoreDeps } from "../lib/faq-store";
import type { CapturedReplyStore } from "../lib/captured-replies";
import { countAskedBefore } from "../lib/count-asked-before";

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
  replies: CapturedReplyStore;
  entityService: Pick<ServiceEntityReads, "getEntity"> &
    FaqStoreDeps["entityService"] &
    Pick<
      ServiceEntityMutations,
      | "getEntityMutationReceipt"
      | "getEntityWriteSnapshot"
      | "applyEntityMutationOnce"
    >;
  conversations: Pick<ServiceConversations, "getMessages">;
  ai: Pick<ServiceAI, "generateObject">;
}

/** Longest question slug kept in an id, so ids stay readable. */
const ID_SLUG_LENGTH = 60;

/**
 * A FAQ's readable id: the question's slug, or "faq" for a question with no
 * letters or digits. A taken slug gets a -2, -3, … suffix when the FAQ is created.
 */
export function faqSlug(question: string): string {
  const slug = truncateSlug(slugify(question), ID_SLUG_LENGTH);
  return slug || "faq";
}

function buildClassificationPrompt(question: string, answer: string): string {
  return [
    "Decide whether this chat exchange belongs in a FAQ.",
    "Accept only a question other people could plausibly ask, with an answer that stands on its own.",
    "Questions about this brain or its owner's public work (what do you write about, what do you offer, how do I reach you) are reusable: visitors ask them.",
    "Reject greetings, small talk, confirmations, requests to perform an action, and answers that only concern the asker's own private situation or this conversation.",
    "Reject answers that do not answer: the assistant could not find the information, had no data, was not ready, hit an error, or asked for clarification. The question may be reusable; such an answer is not.",
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
  ai: Pick<ServiceAI, "generateObject">,
  question: string,
  answer: string,
  signal?: AbortSignal,
): Promise<FaqClassification> {
  const { object } = await ai.generateObject(
    buildClassificationPrompt(question, answer),
    faqClassificationSchema,
    signal,
  );
  return object;
}

/** The sources the reply's own cards name, in the form a page may show. */
export function replySources(reply: Message): FaqSource[] {
  return getGuestSourceCards(reply.metadata["cards"]).flatMap((card) =>
    card.sources.map((source) => ({
      id: source.id,
      // A vetted card always titles its sources; the key stands in otherwise.
      title: source.title ?? source.id,
      ...(source.url ? { url: source.url } : {}),
      ...(source.brain ? { brain: source.brain } : {}),
    })),
  );
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
export function faqCaptureJob(deps: FaqCaptureDeps): FirstPartyJobHandler {
  return firstPartyJobHandler<FaqCaptureJobData>({
    type: "faq-capture",
    input: faqCaptureJobSchema,
    process: ({ input, signal }) => captureReply(deps, input, signal),
  });
}

/** One reply captured once, under its message's durable receipt. */
export async function captureReply(
  deps: FaqCaptureDeps,
  data: FaqCaptureJobData,
  signal?: AbortSignal,
): Promise<FaqCaptureResult> {
  // Legacy claims cannot distinguish completed captures from interrupted ones.
  // Preserve them: automatic replay could double-count an existing FAQ.
  const receipt = { namespace: "faq.capture", key: data.messageId };
  if (
    (await deps.replies.has(data.messageId)) ||
    (await deps.entityService.getEntityMutationReceipt(receipt))
  ) {
    return { captured: false, reason: "already-captured" };
  }
  // Classification is retryable work, not a durable completion claim.
  // Only a terminal decision or the FAQ write consumes the identity.
  const result = await capture(deps, data, receipt, signal);
  const committed = result.captured
    ? await deps.entityService.getEntityMutationReceipt(receipt)
    : await deps.entityService.applyEntityMutationOnce({
        receipt,
        operation: "none",
      });
  if (!committed)
    throw new Error("FAQ capture finished without a mutation receipt");
  if (committed.operation === "none")
    return result.captured
      ? { captured: false, reason: "already-captured" }
      : result;
  return {
    captured: true,
    entityId: committed.entityId,
    merged: committed.operation === "update",
  };
}

async function capture(
  deps: FaqCaptureDeps,
  data: FaqCaptureJobData,
  receipt: Parameters<ServiceEntityMutations["getEntityMutationReceipt"]>[0],
  signal?: AbortSignal,
): Promise<FaqCaptureResult> {
  const messages = await deps.conversations.getMessages(data.conversationId, {
    range: {
      start: Math.max(1, data.position - QUESTION_LOOKBACK),
      end: data.position + ARRIVAL_SLACK,
    },
  });
  const answerIndex = messages.findIndex(
    (message) => message.id === data.messageId,
  );
  const answer = messages[answerIndex];
  if (!answer) return { captured: false, reason: "answer-not-found" };

  const question = findQuestion(messages, answerIndex);
  if (!question) return { captured: false, reason: "no-question" };

  if (
    answer.metadata["askedBefore"] !== undefined &&
    data.userPermissionLevel !== "public"
  )
    return { captured: false, reason: "not-reusable" };
  const counted = await countAskedBefore(deps.entityService, answer, receipt);
  if (counted !== undefined)
    return counted
      ? { captured: true, ...counted }
      : { captured: false, reason: "not-reusable" };

  const classification = await classifyExchange(
    deps.ai,
    question.content,
    answer.content,
    signal,
  );
  if (!classification.reusable) {
    return { captured: false, reason: "not-reusable" };
  }

  const visibility = permissionToVisibilityScope(data.userPermissionLevel);
  const sources = replySources(answer);
  const frontmatter: FaqFrontmatter = {
    question: classification.question,
    status: "draft",
    asked: 1,
  };
  // Searched and checked as the document it would be stored as.
  const content = faqDocument(frontmatter, classification.answer, [], sources);

  const match = await findSameFaq(deps, {
    content,
    visibility,
    signal,
  });
  signal?.throwIfAborted();
  const mergeDeps: FaqStoreDeps = {
    ...deps,
    entityService: {
      getEntity: (request) => deps.entityService.getEntity(request),
      updateEntity: async (request) => {
        try {
          const committed = await deps.entityService.applyEntityMutationOnce({
            receipt,
            operation: "update",
            request,
          });
          return {
            entityId:
              committed.operation === "none"
                ? request.entity.id
                : committed.entityId,
            jobId: "",
            skipped: false,
          };
        } catch (error) {
          if (error instanceof EntityWriteConflictError)
            return {
              entityId: request.entity.id,
              jobId: "",
              skipped: true,
              skipReason: "content-conflict",
            };
          throw error;
        }
      },
    },
  };
  const merged =
    match &&
    (await mergeIntoFaq(mergeDeps, match, {
      asks: 1,
      alternatives: [{ answer: classification.answer }],
    }));
  if (match && merged) {
    return { captured: true, entityId: match.id, merged: true };
  }

  const entityId = await freeId(deps, faqSlug(classification.question));
  await deps.entityService.applyEntityMutationOnce({
    receipt,
    operation: "create",
    request: {
      entity: {
        id: entityId,
        entityType: "faq",
        ...faqRecord(frontmatter, classification.answer, [], sources),
        visibility,
      },
    },
  });
  return { captured: true, entityId, merged: false };
}

/** `slug`, or `slug-2`, `slug-3`, … when a FAQ of any visibility has it. */
async function freeId(
  deps: FaqCaptureDeps,
  slug: string,
  suffix = 1,
): Promise<string> {
  const id = suffix === 1 ? slug : `${slug}-${suffix}`;
  const taken = await deps.entityService.getEntity({
    entityType: "faq",
    id,
    visibilityScope: internalFullScope("faq id allocation"),
  });
  return taken ? freeId(deps, slug, suffix + 1) : id;
}
