import { z } from "@brains/utils";
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

export const swotDerivationJobSchema = z.object({
  reason: z.string().default("entity-change"),
});

export type SwotDerivationJobData = z.infer<typeof swotDerivationJobSchema>;

export const swotDraftGenerationItemSchema = z.object({
  theme: z.string(),
  evidence: z.string(),
  action: z.string(),
});

export type SwotDraftGenerationItem = z.infer<
  typeof swotDraftGenerationItemSchema
>;

export const swotDraftGenerationSchema = z.object({
  strengths: z.array(swotDraftGenerationItemSchema),
  weaknesses: z.array(swotDraftGenerationItemSchema),
  opportunities: z.array(swotDraftGenerationItemSchema),
  threats: z.array(swotDraftGenerationItemSchema),
});

export type SwotDraftGeneration = z.infer<typeof swotDraftGenerationSchema>;

export const swotGenerationItemSchema = z.object({
  sourceTheme: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
});

export type SwotGenerationItem = z.infer<typeof swotGenerationItemSchema>;

export const swotGenerationSchema = z.object({
  strengths: z.array(swotGenerationItemSchema),
  weaknesses: z.array(swotGenerationItemSchema),
  opportunities: z.array(swotGenerationItemSchema),
  threats: z.array(swotGenerationItemSchema),
});

export type SwotGeneration = z.infer<typeof swotGenerationSchema>;
