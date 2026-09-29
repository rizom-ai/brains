import type { ContentVisibility, EntityPluginContext } from "@brains/plugins";
import { findNearestEntity, internalFullScope } from "@brains/plugins";
import { faqAdapter, faqMetadata } from "../adapters/faq-adapter";
import { faqSchema, type FaqEntity, type FaqFrontmatter } from "../schemas/faq";

/**
 * Cosine distance between FAQ markdowns within which they ask the same
 * question. Stored FAQs are embedded as markdown, so a FAQ is measured in
 * that form too. Measured paraphrases sit at 0.03–0.14, a different question
 * on the same subject at 0.43 and beyond.
 */
export const SAME_QUESTION_DISTANCE = 0.2;

/** Writes a merge tries before failing the job so the queue retries it. */
const MERGE_ATTEMPTS = 3;

export interface FaqStoreDeps {
  entityService: Pick<
    EntityPluginContext["entityService"],
    "getEntity" | "updateEntity"
  >;
  searchWithDistances: EntityPluginContext["entityService"]["searchWithDistances"];
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
      maxDistance: SAME_QUESTION_DISTANCE,
      visibility: request.visibility,
      ...(request.excludeIds ? { excludeIds: request.excludeIds } : {}),
    },
  );
}

/**
 * Records `messageIds` on `faq`, writing only over the version that was read.
 * A concurrent merge makes the write stale; the FAQ is re-read and the merge
 * reapplied. Ids the FAQ already records are not added again. False when the
 * FAQ disappeared, so the caller falls back.
 */
export async function mergeIntoFaq(
  deps: FaqStoreDeps,
  faq: FaqEntity,
  messageIds: string[],
  attemptsLeft: number = MERGE_ATTEMPTS,
): Promise<boolean> {
  const { frontmatter, answer } = faqAdapter.parseFaqContent(faq.content);
  const recorded = [
    frontmatter.sourceMessageId,
    ...frontmatter.mergedMessageIds,
  ];
  const added = messageIds.filter((id) => !recorded.includes(id));
  if (added.length === 0) return true;

  const merged: FaqFrontmatter = {
    ...frontmatter,
    mergedMessageIds: [...frontmatter.mergedMessageIds, ...added],
  };
  const result = await deps.entityService.updateEntity({
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

  const current = await deps.entityService.getEntity(
    {
      entityType: "faq",
      id: faq.id,
      visibilityScope: internalFullScope("faq merge retry"),
    },
    faqSchema,
  );
  if (!current) return false;
  return mergeIntoFaq(deps, current, messageIds, attemptsLeft - 1);
}
