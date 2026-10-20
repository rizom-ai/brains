import type {
  AskedBeforeRequest,
  AskedBeforeResponse,
  SourceCitation,
} from "@brains/contracts";
import { findNearestEntity, type IEntityService } from "@brains/plugins";
import { faqAdapter } from "../adapters/faq-adapter";
import { faqSchema, type FaqEntity, type FaqSource } from "../schemas/faq";
import { isSameQuestion, type FaqStoreDeps } from "./faq-store";

type AskedBeforeDeps = Pick<
  FaqStoreDeps,
  "ai" | "sameQuestionDistance" | "searchWithDistances"
> & {
  entityService: Pick<IEntityService, "getEntityWriteSnapshot">;
};

/** A kept source as the answer cites it: its key names its type and entity. */
function citationOf(source: FaqSource): SourceCitation {
  const separator = source.id.indexOf(":");
  const entityType = separator > 0 ? source.id.slice(0, separator) : "faq";
  const entityId = separator > 0 ? source.id.slice(separator + 1) : source.id;
  return {
    id: source.id,
    source: entityType,
    entityType,
    entityId,
    title: source.title,
    ...(source.url ? { url: source.url } : {}),
    ...(source.excerpt ? { excerpt: source.excerpt } : {}),
    ...(source.brain ? { brain: source.brain } : {}),
  };
}

/**
 * A visitor's question a published public FAQ already answers. The nearest
 * published FAQ within the same-question distance is confirmed with the one
 * check the capture uses; a hit answers with the FAQ's own answer and the
 * sources it kept. Only the persisted reply's capture job counts the asking.
 * Drafts never answer. Confirmation grants no authority over a changed row.
 */
export async function answerAskedBefore(
  deps: AskedBeforeDeps,
  request: AskedBeforeRequest,
): Promise<AskedBeforeResponse> {
  const revisions = new WeakMap<FaqEntity, string>();
  const faq = await findNearestEntity(
    {
      searchWithDistances: deps.searchWithDistances,
      getEntity: async (getRequest) => {
        const snapshot = await deps.entityService.getEntityWriteSnapshot({
          ...getRequest,
          publishedOnly: true,
        });
        if (!snapshot) return null;
        const entity = faqSchema.parse(snapshot.entity);
        revisions.set(entity, snapshot.revision);
        return entity;
      },
    },
    {
      query: request.question,
      entityType: "faq",
      maxDistance: deps.sameQuestionDistance,
      visibility: "public",
      confirm: async (candidate) =>
        candidate.metadata.status === "published" &&
        (await isSameQuestion(deps.ai, request.question, candidate.content)),
    },
  );
  if (!faq) return {};
  // The confirmation awaited a provider. Re-read at the public publication
  // floor and retain exactly the canonical revision that was confirmed.
  const snapshot = await deps.entityService.getEntityWriteSnapshot({
    entityType: "faq",
    id: faq.id,
    visibilityScope: "public",
    publishedOnly: true,
  });
  if (!snapshot || snapshot.revision !== revisions.get(faq)) return {};
  const current = faqSchema.parse(snapshot.entity);
  if (
    current.visibility !== "public" ||
    current.metadata.status !== "published"
  )
    return {};
  const { frontmatter, answer } = faqAdapter.parseFaqContent(current.content);
  if (frontmatter.status !== "published") return {};
  return {
    hit: {
      faqId: faq.id,
      faqQuestion: frontmatter.question,
      answer,
      sources: (frontmatter.sources ?? []).map(citationOf),
    },
  };
}
