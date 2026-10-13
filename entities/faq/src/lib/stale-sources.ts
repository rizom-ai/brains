import { EntityWriteConflictError, type IEntityService } from "@brains/plugins";
import { computeContentHash } from "@brains/utils/hash";
import { faqSchema } from "../schemas/faq";
import { faqAdapter, faqMetadata } from "../adapters/faq-adapter";

export type WithdrawalEntities = Pick<
  IEntityService,
  | "listEntities"
  | "getEntityWriteSnapshot"
  | "getEntityMutationReceipt"
  | "applyEntityMutationOnce"
>;

/**
 * Review work belongs to a durable job, not a one-shot deletion notification.
 * Each FAQ decision has a receipt so replay cannot undo a later owner decision.
 */
export async function reviewFaqsCiting(
  entityService: WithdrawalEntities,
  sourceId: string,
  withdrawalId: string,
): Promise<string[]> {
  const completion = {
    namespace: "faq.source-review",
    key: computeContentHash(JSON.stringify([withdrawalId])),
  };
  if (await entityService.getEntityMutationReceipt(completion)) return [];
  const faqs = await entityService.listEntities(
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
    const receipt = {
      namespace: "faq.source-review",
      key: computeContentHash(JSON.stringify([withdrawalId, candidate.id])),
    };
    if (await entityService.getEntityMutationReceipt(receipt)) continue;
    let settled = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await entityService.getEntityWriteSnapshot({
        entityType: "faq",
        id: candidate.id,
        visibilityScope: "public",
        publishedOnly: true,
      });
      const faq = snapshot ? faqSchema.parse(snapshot.entity) : undefined;
      const parsed = faq ? faqAdapter.parseFaqContent(faq.content) : undefined;
      if (
        !snapshot ||
        faq?.visibility !== "public" ||
        faq.metadata.status !== "published" ||
        parsed?.frontmatter.status !== "published" ||
        parsed.frontmatter.review ||
        !parsed.frontmatter.sources?.some((source) => source.id === sourceId)
      ) {
        await entityService.applyEntityMutationOnce({
          receipt,
          operation: "none",
        });
        settled = true;
        break;
      }
      const fields = {
        ...parsed.frontmatter,
        review: "source-withdrawn" as const,
      };
      try {
        const result = await entityService.applyEntityMutationOnce({
          receipt,
          operation: "update",
          request: {
            entity: {
              ...faq,
              content: faqAdapter.createFaqContent(
                fields,
                parsed.answer,
                parsed.alternatives,
              ),
              metadata: faqMetadata(fields),
            },
            options: {
              conditionalWrite: { expectedRevision: snapshot.revision },
            },
          },
        });
        if (result.operation === "update") reviewed.push(faq.id);
        settled = true;
        break;
      } catch (error) {
        if (!(error instanceof EntityWriteConflictError)) throw error;
      }
    }
    // Keep the job retriable/visible instead of acknowledging a lost marker.
    if (!settled)
      throw new Error(`FAQ ${candidate.id} kept changing during source review`);
  }
  // A full page does not prove there are no further citations. Retain durable
  // failed work for manual reconciliation rather than silently accepting the cap.
  if (faqs.length === 1000)
    throw new Error(
      "FAQ source review reached its 1000-row scan limit; manual reconciliation required",
    );
  await entityService.applyEntityMutationOnce({
    receipt: completion,
    operation: "none",
  });
  return reviewed;
}
