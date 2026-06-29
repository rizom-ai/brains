import { z } from "@brains/utils/zod-v4";
import { baseEntitySchema } from "@brains/plugins";

export const swotItemSchema = z.object({
  title: z.string(),
  detail: z.string().optional(),
});

export type SwotItem = z.infer<typeof swotItemSchema>;

export const swotFrontmatterSchema = z.object({
  strengths: z.array(swotItemSchema).default([]),
  weaknesses: z.array(swotItemSchema).default([]),
  opportunities: z.array(swotItemSchema).default([]),
  threats: z.array(swotItemSchema).default([]),
  derivedAt: z.string().datetime(),
});

export type SwotFrontmatter = z.infer<typeof swotFrontmatterSchema>;

export const swotMetadataSchema = swotFrontmatterSchema.pick({
  derivedAt: true,
});

export type SwotMetadata = z.infer<typeof swotMetadataSchema>;

export const swotEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("swot"),
  metadata: swotMetadataSchema,
});

export type SwotEntity = z.infer<typeof swotEntitySchema>;
