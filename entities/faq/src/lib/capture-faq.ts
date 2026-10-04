import {
  permissionToVisibilityScope,
  sdkErrorSchema,
  type ContentVisibility,
  type EntityInput,
  type Message,
  type OwnedMutationReceipt,
} from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import type { FaqEntity, FaqFrontmatter } from "../schemas/faq";
import type {
  FaqCaptureJobData,
  FaqCaptureResult,
  FaqClassification,
} from "../schemas/capture";
import type { FaqReconcileEdit } from "./reconcile-faq";
import { createFaqContent, faqMetadata, parseFaqContent } from "./faq-content";
import { prepareFaqMerge } from "./faq-merge";

export interface FaqCaptureOperation<TEdit extends FaqReconcileEdit> {
  get(): Promise<OwnedMutationReceipt | null>;
  complete(
    proposal:
      | { operation: "none" }
      | { operation: "create"; entity: EntityInput<FaqEntity> }
      | { operation: "update"; edit: TEdit; entity: FaqEntity },
  ): Promise<OwnedMutationReceipt>;
}

/** Capture operates on admitted edits/receipts; it cannot select a native namespace. */
export interface FaqCaptureWork<TEdit extends FaqReconcileEdit> {
  wasClaimed(replyId: string): Promise<boolean>;
  operation(replyId: string): FaqCaptureOperation<TEdit>;
  messages(
    conversationId: string,
    range: { start: number; end: number },
  ): Promise<Message[]>;
  classify(question: string, answer: string): Promise<FaqClassification>;
  findSame(request: {
    content: string;
    visibility: ContentVisibility;
  }): Promise<FaqEntity | undefined>;
  read(id: string, visibility: ContentVisibility): Promise<TEdit | null>;
  idTaken(id: string): Promise<boolean>;
}

/** Readable question slug, with the same fallback and length as native captures. */
export function faqSlug(question: string): string {
  return slugify(question).slice(0, 60).replace(/-+$/, "") || "faq";
}

async function freeId(
  deps: Pick<FaqCaptureWork<FaqReconcileEdit>, "idTaken">,
  slug: string,
  suffix = 1,
): Promise<string> {
  const id = suffix === 1 ? slug : `${slug}-${suffix}`;
  return (await deps.idTaken(id)) ? freeId(deps, slug, suffix + 1) : id;
}

async function merge<TEdit extends FaqReconcileEdit>(
  deps: FaqCaptureWork<TEdit>,
  operation: FaqCaptureOperation<TEdit>,
  match: FaqEntity,
  answer: string,
  visibility: ContentVisibility,
): Promise<boolean> {
  if (match.visibility !== visibility) return false;
  const question = parseFaqContent(match.content).frontmatter.question;
  for (let attempt = 0; attempt < 3; attempt++) {
    const edit = await deps.read(match.id, visibility);
    if (
      !edit ||
      edit.entity.visibility !== visibility ||
      parseFaqContent(edit.entity.content).frontmatter.question !== question
    )
      return false;
    try {
      await operation.complete({
        operation: "update",
        edit,
        entity: prepareFaqMerge(edit.entity, {
          asks: 1,
          alternatives: [{ answer }],
        }),
      });
      return true;
    } catch (error) {
      if (sdkErrorSchema.safeParse(error).data?.code !== "conflict")
        throw error;
      if (attempt === 2)
        throw new Error(`FAQ ${match.id} kept changing during merge`, {
          cause: error,
        });
    }
  }
  return false;
}

async function capture<TEdit extends FaqReconcileEdit>(
  data: FaqCaptureJobData,
  deps: FaqCaptureWork<TEdit>,
  operation: FaqCaptureOperation<TEdit>,
): Promise<FaqCaptureResult> {
  // Twenty prior messages for the question; ten after the position for arrival races.
  const messages = await deps.messages(data.conversationId, {
    start: Math.max(1, data.position - 20),
    end: data.position + 10,
  });
  const answerIndex = messages.findIndex(
    (message) => message.id === data.messageId,
  );
  const answer = messages[answerIndex];
  if (!answer) return { captured: false, reason: "answer-not-found" };
  const question = messages
    .slice(0, answerIndex)
    .reverse()
    .find((message) => message.role === "user");
  if (!question) return { captured: false, reason: "no-question" };
  const classification = await deps.classify(question.content, answer.content);
  if (!classification.reusable)
    return { captured: false, reason: "not-reusable" };
  const visibility = permissionToVisibilityScope(data.userPermissionLevel);
  const frontmatter: FaqFrontmatter = {
    question: classification.question,
    status: "draft",
    asked: 1,
  };
  const content = createFaqContent(frontmatter, classification.answer);
  const match = await deps.findSame({ content, visibility });
  if (
    match &&
    (await merge(deps, operation, match, classification.answer, visibility))
  )
    return { captured: true, entityId: match.id, merged: true };
  const entityId = await freeId(deps, faqSlug(classification.question));
  await operation.complete({
    operation: "create",
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

/** First terminal commit wins; classification itself is never a completion claim. */
export async function captureFaq<TEdit extends FaqReconcileEdit>(
  data: FaqCaptureJobData,
  deps: FaqCaptureWork<TEdit>,
): Promise<FaqCaptureResult> {
  // Legacy timestamp claims cannot distinguish completion from interruption.
  // Keep them intact; replay or age-based removal could count an answer twice.
  if (await deps.wasClaimed(data.messageId))
    return { captured: false, reason: "already-captured" };
  const operation = deps.operation(data.messageId);
  if (await operation.get())
    return { captured: false, reason: "already-captured" };
  const result = await capture(data, deps, operation);
  const committed = result.captured
    ? await operation.get()
    : await operation.complete({ operation: "none" });
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
