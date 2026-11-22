import {
  internalFullScope,
  type ServiceEntityReads,
  type ServiceEntityWrites,
} from "@brains/sdk/internal/service-runtime";
import { faqSchema } from "../schemas/faq";
import { faqRecord, readFaq } from "./faq-body";

const SCOPE = internalFullScope(
  "a renamed entry is cited by FAQs of every visibility",
);
/** The most FAQs one rename rewrites. */
const LIMIT = 500;

export interface SourceRenameDeps {
  entityService: Pick<ServiceEntityReads, "listEntities"> &
    Pick<ServiceEntityWrites, "updateEntity">;
}

/**
 * An entry a FAQ cites was renamed: each FAQ that cites it from this brain
 * cites it by its new id. A source cited from another brain is that brain's
 * entry, and stays as it is. Returns the FAQs rewritten.
 */
export async function followSourceRename(
  deps: SourceRenameDeps,
  renamed: { entityType: string; previousId: string; entityId: string },
): Promise<string[]> {
  const previous = `${renamed.entityType}:${renamed.previousId}`;
  const next = `${renamed.entityType}:${renamed.entityId}`;
  const citing = await deps.entityService.listEntities({
    entityType: "faq",
    options: {
      filter: { contentContains: previous, visibilityScope: SCOPE },
      limit: LIMIT,
    },
  });
  const updated: string[] = [];
  for (const entity of citing) {
    const faq = faqSchema.parse(entity);
    const { frontmatter, answer, alternatives, sources } = readFaq(faq);
    if (
      !sources.some(
        (source) => source.id === previous && source.brain === undefined,
      )
    )
      continue;
    const cited = sources.map((source) =>
      source.id === previous && source.brain === undefined
        ? { ...source, id: next }
        : source,
    );
    await deps.entityService.updateEntity({
      entity: {
        ...faq,
        ...faqRecord(frontmatter, answer, alternatives, cited),
      },
      options: { expectedContentHash: faq.contentHash },
    });
    updated.push(faq.id);
  }
  return updated;
}
