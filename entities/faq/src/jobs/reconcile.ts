import { defineJob, z, type ServiceJobDefinition } from "@brains/sdk/services";
import { faq } from "../faq-entity";
import { findSameFaq } from "../lib/faq-matching";
import { reconcileFaq, type FaqReconcileResult } from "../lib/reconcile-faq";

export const faqReconcileJobSchema: z.ZodObject<{ entityId: z.ZodString }> =
  z.object({ entityId: z.string().min(1) });
export type FaqReconcileJobData = z.output<typeof faqReconcileJobSchema>;
const faqReconcileResultSchema: z.ZodType<FaqReconcileResult> = z.union([
  z.object({ outcome: z.literal("folded"), into: z.string() }),
  z.object({
    outcome: z.enum(["kept", "unique", "published", "gone", "changed"]),
  }),
]);
export const faqReconcileJob: ServiceJobDefinition<
  "faq-reconcile",
  typeof faqReconcileJobSchema,
  typeof faqReconcileResultSchema
> = defineJob({
  name: "faq-reconcile",
  input: faqReconcileJobSchema,
  output: faqReconcileResultSchema,
});

export function handleFaqReconcile(
  sameQuestionDistance: number,
): ReturnType<typeof faqReconcileJob.handle> {
  return faqReconcileJob.handle(async ({ input, entities, ai }) =>
    reconcileFaq(input.entityId, {
      read: (id, visibilityScope) =>
        entities.mutations.read(faq, id, { visibilityScope }),
      findSame: (request) =>
        findSameFaq(
          { nearest: entities.nearest, ai, sameQuestionDistance },
          request,
        ),
      fold: (source, target, entity) =>
        entities.mutations.fold(faq, source, target, entity),
    }),
  );
}
