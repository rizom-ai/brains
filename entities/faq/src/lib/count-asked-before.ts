import {
  EntityWriteConflictError,
  type IEntityService,
  type Message,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { faqAdapter } from "../adapters/faq-adapter";
import { faqSchema } from "../schemas/faq";
import { prepareFaqMerge } from "./faq-store";

const markerSchema = z.object({
  askedBefore: z.object({ faqId: z.string().min(1) }),
  faqCapture: z.object({
    faqId: z.string().min(1),
    question: z.string().min(1),
  }),
});

/** Undefined means an ordinary reply; false means its answered FAQ is no longer eligible. */
export async function countAskedBefore(
  entities: Pick<
    IEntityService,
    "getEntityWriteSnapshot" | "applyEntityMutationOnce"
  >,
  answer: Message,
  receipt: Parameters<IEntityService["getEntityMutationReceipt"]>[0],
): Promise<{ entityId: string; merged: boolean } | false | undefined> {
  if (answer.metadata["askedBefore"] === undefined) return undefined;
  const parsed = markerSchema.safeParse(answer.metadata);
  // Old fast-path replies may already have incremented without a receipt.
  // Never guess or replay that ambiguous durable effect automatically.
  if (
    !parsed.success ||
    answer.role !== "assistant" ||
    parsed.data.askedBefore.faqId !== parsed.data.faqCapture.faqId
  ) {
    throw new Error(
      "FAQ answer count requires manual reconciliation: missing capture provenance",
    );
  }
  const { faqId, question } = parsed.data.faqCapture;
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await entities.getEntityWriteSnapshot({
      entityType: "faq",
      id: faqId,
      visibilityScope: "public",
      publishedOnly: true,
    });
    if (!snapshot) return false;
    const faq = faqSchema.parse(snapshot.entity);
    const content = faqAdapter.parseFaqContent(faq.content);
    if (
      faq.visibility !== "public" ||
      faq.metadata.status !== "published" ||
      content.frontmatter.status !== "published" ||
      content.frontmatter.question !== question ||
      content.answer.trim() !== answer.content.trim()
    )
      return false;
    try {
      const committed = await entities.applyEntityMutationOnce({
        receipt,
        operation: "update",
        request: {
          entity: prepareFaqMerge(faq, { asks: 1 }),
          options: {
            conditionalWrite: { expectedRevision: snapshot.revision },
          },
        },
      });
      return committed.operation === "none"
        ? false
        : {
            entityId: committed.entityId,
            merged: committed.operation === "update",
          };
    } catch (error) {
      if (!(error instanceof EntityWriteConflictError)) throw error;
    }
  }
  throw new Error(`FAQ ${faqId} kept changing during asked-before capture`);
}
