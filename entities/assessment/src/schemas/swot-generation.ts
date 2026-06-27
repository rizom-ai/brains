import { z } from "@brains/utils/zod-v4";

export const swotDerivationJobSchema = z.object({
  reason: z.string().default("entity-change"),
});

export type SwotDerivationJobData = z.output<typeof swotDerivationJobSchema>;

export const swotDraftGenerationItemSchema = z.object({
  theme: z.string(),
  evidence: z.string(),
  action: z.string(),
});

export type SwotDraftGenerationItem = z.output<
  typeof swotDraftGenerationItemSchema
>;

export const swotDraftGenerationSchema = z.object({
  strengths: z.array(swotDraftGenerationItemSchema),
  weaknesses: z.array(swotDraftGenerationItemSchema),
  opportunities: z.array(swotDraftGenerationItemSchema),
  threats: z.array(swotDraftGenerationItemSchema),
});

export type SwotDraftGeneration = z.output<typeof swotDraftGenerationSchema>;

export const swotGenerationItemSchema = z.object({
  sourceTheme: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
});

export type SwotGenerationItem = z.output<typeof swotGenerationItemSchema>;

export const swotGenerationSchema = z.object({
  strengths: z.array(swotGenerationItemSchema),
  weaknesses: z.array(swotGenerationItemSchema),
  opportunities: z.array(swotGenerationItemSchema),
  threats: z.array(swotGenerationItemSchema),
});

export type SwotGeneration = z.output<typeof swotGenerationSchema>;
