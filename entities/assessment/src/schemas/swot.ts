import { z } from "@brains/utils/zod";
import { z as z4 } from "@brains/utils/zod-v4";
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

export const swotDerivationJobSchema = z4.object({
  reason: z4.string().default("entity-change"),
});

export type SwotDerivationJobData = z4.output<typeof swotDerivationJobSchema>;

export const swotDraftGenerationItemSchema = z4.object({
  theme: z4.string(),
  evidence: z4.string(),
  action: z4.string(),
});

export type SwotDraftGenerationItem = z4.output<
  typeof swotDraftGenerationItemSchema
>;

export const swotDraftGenerationSchema = z4.object({
  strengths: z4.array(swotDraftGenerationItemSchema),
  weaknesses: z4.array(swotDraftGenerationItemSchema),
  opportunities: z4.array(swotDraftGenerationItemSchema),
  threats: z4.array(swotDraftGenerationItemSchema),
});

export type SwotDraftGeneration = z4.output<typeof swotDraftGenerationSchema>;

export const swotGenerationItemSchema = z4.object({
  sourceTheme: z4.string(),
  title: z4.string(),
  detail: z4.string().nullable(),
});

export type SwotGenerationItem = z4.output<typeof swotGenerationItemSchema>;

export const swotGenerationSchema = z4.object({
  strengths: z4.array(swotGenerationItemSchema),
  weaknesses: z4.array(swotGenerationItemSchema),
  opportunities: z4.array(swotGenerationItemSchema),
  threats: z4.array(swotGenerationItemSchema),
});

export type SwotGeneration = z4.output<typeof swotGenerationSchema>;
