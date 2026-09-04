import { z } from "@brains/utils/zod";

export const swotDerivationJobSchema: z.ZodObject<{
  reason: z.ZodDefault<z.ZodString>;
}> = z.object({
  reason: z.string().default("entity-change"),
});

export type SwotDerivationJobData = z.output<typeof swotDerivationJobSchema>;
export type SwotDerivationJobDataInput = z.input<
  typeof swotDerivationJobSchema
>;

export const swotDraftGenerationItemSchema: z.ZodObject<{
  theme: z.ZodString;
  evidence: z.ZodString;
  action: z.ZodString;
}> = z.object({
  theme: z.string(),
  evidence: z.string(),
  action: z.string(),
});

export type SwotDraftGenerationItem = z.output<
  typeof swotDraftGenerationItemSchema
>;

export const swotDraftGenerationSchema: z.ZodObject<{
  strengths: z.ZodArray<typeof swotDraftGenerationItemSchema>;
  weaknesses: z.ZodArray<typeof swotDraftGenerationItemSchema>;
  opportunities: z.ZodArray<typeof swotDraftGenerationItemSchema>;
  threats: z.ZodArray<typeof swotDraftGenerationItemSchema>;
}> = z.object({
  strengths: z.array(swotDraftGenerationItemSchema),
  weaknesses: z.array(swotDraftGenerationItemSchema),
  opportunities: z.array(swotDraftGenerationItemSchema),
  threats: z.array(swotDraftGenerationItemSchema),
});

export type SwotDraftGeneration = z.output<typeof swotDraftGenerationSchema>;

export const swotGenerationItemSchema: z.ZodObject<{
  sourceTheme: z.ZodString;
  title: z.ZodString;
  detail: z.ZodNullable<z.ZodString>;
}> = z.object({
  sourceTheme: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
});

export type SwotGenerationItem = z.output<typeof swotGenerationItemSchema>;

export const swotGenerationSchema: z.ZodObject<{
  strengths: z.ZodArray<typeof swotGenerationItemSchema>;
  weaknesses: z.ZodArray<typeof swotGenerationItemSchema>;
  opportunities: z.ZodArray<typeof swotGenerationItemSchema>;
  threats: z.ZodArray<typeof swotGenerationItemSchema>;
}> = z.object({
  strengths: z.array(swotGenerationItemSchema),
  weaknesses: z.array(swotGenerationItemSchema),
  opportunities: z.array(swotGenerationItemSchema),
  threats: z.array(swotGenerationItemSchema),
});

export type SwotGeneration = z.output<typeof swotGenerationSchema>;
