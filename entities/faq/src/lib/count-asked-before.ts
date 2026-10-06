import { sdkErrorSchema, z, type Message } from "@brains/sdk/entities";
import { parseFaqContent } from "./faq-content";
import { prepareFaqMerge } from "./faq-merge";
import type { FaqCaptureWork, FaqCaptureOperation } from "./capture-work";
import type { FaqReconcileEdit } from "./reconcile-faq";
const markerSchema = z.object({
  askedBefore: z.object({ faqId: z.string().min(1) }),
  faqCapture: z.object({
    faqId: z.string().min(1),
    question: z.string().min(1),
  }),
});
/** Uses the original capture operation, never a second count identity. */
export async function countAskedBefore<TEdit extends FaqReconcileEdit>(
  deps: Pick<FaqCaptureWork<TEdit>, "read">,
  answer: Message,
  operation: FaqCaptureOperation<TEdit>,
): Promise<{ entityId: string; merged: boolean } | false | undefined> {
  if (answer.metadata["askedBefore"] === undefined) return undefined;
  const parsed = markerSchema.safeParse(answer.metadata);
  if (
    !parsed.success ||
    answer.role !== "assistant" ||
    parsed.data.askedBefore.faqId !== parsed.data.faqCapture.faqId
  )
    throw new Error(
      "FAQ answer count requires manual reconciliation: missing capture provenance",
    );
  const { faqId, question } = parsed.data.faqCapture;
  for (let attempt = 0; attempt < 3; attempt++) {
    const edit = await deps.read(faqId, "public");
    if (!edit) return false;
    const faq = edit.entity;
    const content = parseFaqContent(faq.content);
    if (
      faq.visibility !== "public" ||
      faq.metadata.status !== "published" ||
      content.frontmatter.status !== "published" ||
      content.frontmatter.review ||
      content.frontmatter.question !== question ||
      content.answer.trim() !== answer.content.trim()
    )
      return false;
    try {
      const committed = await operation.complete({
        operation: "update",
        edit,
        entity: prepareFaqMerge(faq, { asks: 1 }),
      });
      return committed.operation === "none"
        ? false
        : {
            entityId: committed.entityId,
            merged: committed.operation === "update",
          };
    } catch (error) {
      if (sdkErrorSchema.safeParse(error).data?.code !== "conflict")
        throw error;
    }
  }
  throw new Error(`FAQ ${faqId} kept changing during asked-before capture`);
}
