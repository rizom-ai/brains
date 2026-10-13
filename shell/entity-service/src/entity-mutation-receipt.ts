import { z } from "@brains/utils/zod";

/** Native-only durable mutation identity, scoped by the admitted caller. */
export interface EntityMutationReceiptKey {
  namespace: string;
  key: string;
}
export const entityMutationReceiptKeySchema: z.ZodType<EntityMutationReceiptKey> =
  z.strictObject({
    namespace: z.string().min(1).max(200),
    key: z.string().min(1).max(500),
  });

export type EntityMutationReceipt =
  | { operation: "none" }
  | { operation: "create" | "update"; entityType: string; entityId: string };
export const entityMutationReceiptSchema: z.ZodType<EntityMutationReceipt> =
  z.union([
    z.strictObject({ operation: z.literal("none") }),
    z.strictObject({
      operation: z.enum(["create", "update"]),
      entityType: z.string().min(1),
      entityId: z.string().min(1),
    }),
  ]);

/** Internal transaction escape: roll back before returning the prior result. */
export class EntityMutationAlreadyAppliedError extends Error {
  readonly receipt: EntityMutationReceipt;
  constructor(receipt: EntityMutationReceipt) {
    super("Entity mutation already applied");
    this.receipt = receipt;
    this.name = "EntityMutationAlreadyAppliedError";
  }
}
