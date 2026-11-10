import { z } from "@brains/utils/zod";

/** Native-only durable mutation identity, scoped by the admitted caller. */
export const entityMutationReceiptKeySchema: z.ZodObject<
  { namespace: z.ZodString; key: z.ZodString },
  z.core.$strict
> = z.strictObject({
  namespace: z.string().min(1).max(200),
  key: z.string().min(1).max(500),
});
export type EntityMutationReceiptKey = z.output<
  typeof entityMutationReceiptKeySchema
>;

export const entityMutationReceiptSchema: z.ZodUnion<
  [
    z.ZodObject<{ operation: z.ZodLiteral<"none"> }, z.core.$strict>,
    z.ZodObject<
      {
        operation: z.ZodEnum<{ create: "create"; update: "update" }>;
        entityType: z.ZodString;
        entityId: z.ZodString;
      },
      z.core.$strict
    >,
  ]
> = z.union([
  z.strictObject({ operation: z.literal("none") }),
  z.strictObject({
    operation: z.enum(["create", "update"]),
    entityType: z.string().min(1),
    entityId: z.string().min(1),
  }),
]);
export type EntityMutationReceipt = z.output<
  typeof entityMutationReceiptSchema
>;

/** Internal transaction escape: roll back before returning the prior result. */
export class EntityMutationAlreadyAppliedError extends Error {
  readonly receipt: EntityMutationReceipt;
  constructor(receipt: EntityMutationReceipt) {
    super("Entity mutation already applied");
    this.receipt = receipt;
    this.name = "EntityMutationAlreadyAppliedError";
  }
}
