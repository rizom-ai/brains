import { z } from "@brains/utils/zod";

/** Plugin-owned semantic classification, independent of access and projection policy. */
export const entityTypeClassificationSchema: z.ZodDefault<
  z.ZodEnum<{ content: "content"; system: "system" }>
> = z.enum(["content", "system"]).default("content");

export type EntityTypeClassification = z.output<
  typeof entityTypeClassificationSchema
>;
