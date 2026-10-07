import { sdkErrorSchema, type EntityAccess } from "@brains/sdk/entities";
import { computeContentHash } from "@brains/utils/hash";
import { faq } from "../faq-entity";
import { faqSchema } from "../schemas/faq";
import { createFaqContent, parseFaqContent, faqMetadata } from "./faq-content";
export type WithdrawalEntities = Pick<
  EntityAccess,
  "listEntities" | "mutations"
>;
/** Receipt-backed review; each fresh edit carries the host's full canonical CAS. */
export async function reviewFaqsCiting(
  entities: WithdrawalEntities,
  sourceId: string,
  withdrawalId: string,
): Promise<string[]> {
  const completion = entities.mutations.once(
    faq,
    "source-review",
    computeContentHash(JSON.stringify([withdrawalId])),
  );
  if (await completion.get()) return [];
  const faqs = await entities.listEntities(
    {
      entityType: "faq",
      options: {
        limit: 1000,
        filter: { visibilityScope: "public", contentContains: sourceId },
      },
    },
    faqSchema,
  );
  const reviewed: string[] = [];
  for (const candidate of faqs) {
    const receipt = entities.mutations.once(
      faq,
      "source-review",
      computeContentHash(JSON.stringify([withdrawalId, candidate.id])),
    );
    if (await receipt.get()) continue;
    let settled = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const edit = await entities.mutations.read(faq, candidate.id, {
        visibilityScope: "public",
      });
      const entity = edit?.entity;
      const parsed = entity ? parseFaqContent(entity.content) : undefined;
      if (
        !edit ||
        entity?.visibility !== "public" ||
        entity.metadata.status !== "published" ||
        parsed?.frontmatter.status !== "published" ||
        parsed.frontmatter.review ||
        !parsed.frontmatter.sources?.some((source) => source.id === sourceId)
      ) {
        await receipt.complete({ operation: "none" });
        settled = true;
        break;
      }
      const fields = {
        ...parsed.frontmatter,
        review: "source-withdrawn" as const,
      };
      try {
        const result = await receipt.complete({
          operation: "update",
          edit,
          entity: {
            ...entity,
            content: createFaqContent(
              fields,
              parsed.answer,
              parsed.alternatives,
            ),
            metadata: faqMetadata(fields),
          },
        });
        if (result.operation === "update") reviewed.push(entity.id);
        settled = true;
        break;
      } catch (error) {
        if (sdkErrorSchema.safeParse(error).data?.code !== "conflict")
          throw error;
      }
    }
    if (!settled)
      throw new Error(`FAQ ${candidate.id} kept changing during source review`);
  }
  if (faqs.length === 1000)
    throw new Error(
      "FAQ source review reached its 1000-row scan limit; manual reconciliation required",
    );
  await completion.complete({ operation: "none" });
  return reviewed;
}
