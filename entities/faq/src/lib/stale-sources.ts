import type { EntityPluginContext } from "@brains/plugins";
import { faqAdapter, faqMetadata } from "../adapters/faq-adapter";
import { faqSchema, type FaqFrontmatter } from "../schemas/faq";

type StaleSourceEntityService = Pick<
  EntityPluginContext["entityService"],
  "listEntities" | "updateEntity"
>;

/**
 * A piece from another brain left the index: every published public FAQ
 * whose answer cited it is marked for the owner's review, keeping its answer
 * and status. A concurrent change leaves that FAQ for the next withdrawal;
 * drafts are already the owner's to review.
 */
export async function reviewFaqsCiting(
  entityService: StaleSourceEntityService,
  sourceId: string,
): Promise<string[]> {
  const faqs = await entityService.listEntities(
    {
      entityType: "faq",
      options: { limit: 1000, filter: { visibilityScope: "public" } },
    },
    faqSchema,
  );
  const reviewed: string[] = [];
  for (const faq of faqs) {
    if (faq.visibility !== "public") continue;
    const { frontmatter, answer, alternatives } = faqAdapter.parseFaqContent(
      faq.content,
    );
    if (frontmatter.status !== "published" || frontmatter.review) continue;
    if (!(frontmatter.sources ?? []).some((source) => source.id === sourceId))
      continue;
    const marked: FaqFrontmatter = {
      ...frontmatter,
      review: "source-withdrawn",
    };
    const result = await entityService.updateEntity({
      entity: {
        ...faq,
        content: faqAdapter.createFaqContent(marked, answer, alternatives),
        metadata: faqMetadata(marked),
      },
      options: { expectedContentHash: faq.contentHash },
    });
    if (!result.skipped) reviewed.push(faq.id);
  }
  return reviewed;
}
