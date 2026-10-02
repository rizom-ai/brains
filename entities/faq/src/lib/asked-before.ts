import type {
  AskedBeforeRequest,
  AskedBeforeResponse,
  SourceCitation,
} from "@brains/contracts";
import { findNearestEntity } from "@brains/plugins";
import { faqAdapter } from "../adapters/faq-adapter";
import { faqSchema, type FaqSource } from "../schemas/faq";
import { isSameQuestion, mergeIntoFaq, type FaqStoreDeps } from "./faq-store";

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
 * sources it kept, and counts as one more asking. Drafts never answer, nor
 * does a FAQ awaiting the owner's review: the model answers meanwhile.
 */
export async function answerAskedBefore(
  deps: FaqStoreDeps,
  request: AskedBeforeRequest,
): Promise<AskedBeforeResponse> {
  const faq = await findNearestEntity(
    {
      searchWithDistances: deps.searchWithDistances,
      getEntity: (getRequest) =>
        deps.entityService.getEntity(getRequest, faqSchema),
    },
    {
      query: request.question,
      entityType: "faq",
      maxDistance: deps.sameQuestionDistance,
      visibility: "public",
      confirm: async (candidate) =>
        candidate.metadata.status === "published" &&
        !faqAdapter.parseFaqContent(candidate.content).frontmatter.review &&
        (await isSameQuestion(deps.ai, request.question, candidate.content)),
    },
  );
  if (!faq) return {};
  const { frontmatter, answer } = faqAdapter.parseFaqContent(faq.content);
  await mergeIntoFaq(deps, faq, { asks: 1 });
  return {
    hit: {
      faqId: faq.id,
      answer,
      sources: (frontmatter.sources ?? []).map(citationOf),
    },
  };
}
