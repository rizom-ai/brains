import type {
  AskedBeforeRequest,
  AskedBeforeResponse,
  SourceCitation,
} from "@brains/contracts";
import type { EntityAccess, IEntityAINamespace } from "@brains/sdk/entities";
import { faq } from "../faq-entity";
import { parseFaqContent } from "./faq-content";
import { isSameQuestion } from "./faq-question";
import type { FaqEntity, FaqSource } from "../schemas/faq";

function citationOf(source: FaqSource): SourceCitation {
  const separator = source.id.indexOf(":");
  const entityType = separator > 0 ? source.id.slice(0, separator) : "faq";
  const entityId = separator > 0 ? source.id.slice(separator + 1) : source.id;
  return { ...source, source: entityType, entityType, entityId };
}
export interface AskedBeforeDeps {
  readonly entities: Pick<EntityAccess, "nearest" | "mutations">;
  readonly ai: Pick<IEntityAINamespace, "generateObject">;
  readonly sameQuestionDistance: number;
}
function eligible(entity: Readonly<FaqEntity>): boolean {
  const { frontmatter } = parseFaqContent(entity.content);
  return (
    entity.visibility === "public" &&
    entity.metadata.status === "published" &&
    frontmatter.status === "published" &&
    !frontmatter.review
  );
}
/** Read-only admission: bounded candidates, then full canonical version recheck. */
export async function answerAskedBefore(
  deps: AskedBeforeDeps,
  request: AskedBeforeRequest,
): Promise<AskedBeforeResponse> {
  const candidates = await deps.entities.nearest(faq, request.question, {
    visibility: "public",
    maxDistance: deps.sameQuestionDistance,
    limit: 20,
  });
  for (const candidate of candidates) {
    const before = await deps.entities.mutations.read(
      faq,
      candidate.entity.id,
      { visibilityScope: "public" },
    );
    if (!before || !eligible(before.entity)) continue;
    if (
      !(await isSameQuestion(deps.ai, request.question, before.entity.content))
    )
      continue;
    const after = await deps.entities.mutations.read(faq, candidate.entity.id, {
      visibilityScope: "public",
    });
    if (after?.version !== before.version || !eligible(after.entity)) return {};
    const { frontmatter, answer } = parseFaqContent(after.entity.content);
    return {
      hit: {
        faqId: after.entity.id,
        faqQuestion: frontmatter.question,
        answer,
        sources: (frontmatter.sources ?? []).map(citationOf),
      },
    };
  }
  return {};
}
