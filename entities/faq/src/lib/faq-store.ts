import type { ContentVisibility, EntityPluginContext } from "@brains/plugins";
import { findNearestEntity } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { faqAdapter, faqMetadata } from "../adapters/faq-adapter";
import {
  faqSchema,
  type FaqAlternative,
  type FaqEntity,
  type FaqFrontmatter,
} from "../schemas/faq";

/**
 * Default cosine distance between FAQ markdowns within which they may ask the
 * same question. Stored FAQs are embedded as markdown, so a FAQ is measured in
 * that form too. Measured paraphrases sit at 0.03–0.14 and a different question
 * on the same subject at 0.40+, but opposites ("publish" vs "unpublish") sit at
 * 0.195: distance only shortlists, and the same-question check decides.
 */
export const SAME_QUESTION_DISTANCE = 0.25;

/** Opening line of the same-question check prompt. */
export const SAME_QUESTION_CHECK =
  "Do these two FAQ entries ask the same question?";

const sameQuestionVerdictSchema = z.object({
  same: z
    .boolean()
    .describe(
      "True only when one answer serves anyone asking either question.",
    ),
});

/** One short AI call: would one answer serve both FAQ entries? */
export async function isSameQuestion(
  ai: Pick<EntityPluginContext["ai"], "generateObject">,
  incoming: string,
  stored: string,
): Promise<boolean> {
  const { object } = await ai.generateObject(
    [
      SAME_QUESTION_CHECK,
      "Answer yes only when a single answer serves anyone asking either one.",
      "Questions about opposite or different actions are different questions, even when worded almost alike: publish vs unpublish, enable vs disable, add vs remove.",
      "",
      "New entry:",
      incoming,
      "",
      "Existing entry:",
      stored,
    ].join("\n"),
    sameQuestionVerdictSchema,
  );
  return object.same;
}

/** Writes a merge tries before failing the job so the queue retries it. */
const MERGE_ATTEMPTS = 3;

export interface FaqStoreDeps {
  entityService: Pick<
    EntityPluginContext["entityService"],
    "getEntity" | "updateEntity"
  >;
  searchWithDistances: EntityPluginContext["entityService"]["searchWithDistances"];
  /** Largest distance at which two FAQs may ask the same question. */
  sameQuestionDistance: number;
  ai: Pick<EntityPluginContext["ai"], "generateObject">;
}

/** A stored FAQ of exactly `visibility` that asks the question `content` asks. */
export function findSameFaq(
  deps: FaqStoreDeps,
  request: {
    content: string;
    visibility: ContentVisibility;
    excludeIds?: string[];
  },
): Promise<FaqEntity | undefined> {
  return findNearestEntity(
    {
      searchWithDistances: deps.searchWithDistances,
      getEntity: (getRequest) =>
        deps.entityService.getEntity(getRequest, faqSchema),
    },
    {
      query: request.content,
      entityType: "faq",
      maxDistance: deps.sameQuestionDistance,
      visibility: request.visibility,
      ...(request.excludeIds ? { excludeIds: request.excludeIds } : {}),
      confirm: (candidate) =>
        isSameQuestion(deps.ai, request.content, candidate.content),
    },
  );
}

/**
 * Counts `merge.asks` more askings on `faq`, writing only over the version
 * that was read. A concurrent merge makes the write stale; the FAQ is re-read
 * and the merge reapplied. The FAQ keeps its answer; merged answers that
 * differ from it and from its alternatives join the alternatives in the body.
 * False when the FAQ disappeared or its visibility/question no longer matches
 * the snapshot that admitted this merge. A fresh hash grants no wider scope.
 */
export async function mergeIntoFaq(
  deps: FaqStoreDeps,
  faq: FaqEntity,
  merge: { asks: number; alternatives?: FaqAlternative[] },
  attemptsLeft: number = MERGE_ATTEMPTS,
): Promise<boolean> {
  const { frontmatter } = faqAdapter.parseFaqContent(faq.content);
  const visibility = faq.visibility;
  const result = await deps.entityService.updateEntity({
    entity: prepareFaqMerge(faq, merge),
    options: { expectedContentHash: faq.contentHash },
  });
  if (result.skipReason !== "content-conflict") return true;
  if (attemptsLeft <= 1) {
    throw new Error(`FAQ ${faq.id} kept changing during merge`);
  }

  const current = await deps.entityService.getEntity(
    { entityType: "faq", id: faq.id, visibilityScope: visibility },
    faqSchema,
  );
  if (
    current?.visibility !== visibility ||
    faqAdapter.parseFaqContent(current.content).frontmatter.question !==
      frontmatter.question
  )
    return false;
  return mergeIntoFaq(deps, current, merge, attemptsLeft - 1);
}

/** Prepare once; the caller chooses a single-entity CAS or atomic pair write. */
export function prepareFaqMerge(
  faq: FaqEntity,
  merge: { asks: number; alternatives?: FaqAlternative[] },
): FaqEntity {
  const { frontmatter, answer, alternatives } = faqAdapter.parseFaqContent(
    faq.content,
  );
  const known = [
    answer,
    ...alternatives.map((alternative) => alternative.answer),
  ];
  const newAlternatives = (merge.alternatives ?? []).filter(
    (alternative) =>
      !known.some((text) => text.trim() === alternative.answer.trim()),
  );
  const merged: FaqFrontmatter = {
    ...frontmatter,
    asked: frontmatter.asked + merge.asks,
  };
  return {
    ...faq,
    content: faqAdapter.createFaqContent(merged, answer, [
      ...alternatives,
      ...newAlternatives,
    ]),
    metadata: faqMetadata(merged),
  };
}
