import { z } from "@brains/utils/zod";

export const GenerateOptionsSchema: z.ZodObject<{
  routeId: z.ZodOptional<z.ZodString>;
  sectionId: z.ZodOptional<z.ZodString>;
  dryRun: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  force: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}> = z.object({
  routeId: z.string().optional().describe("Optional: specific route filter"),
  sectionId: z
    .string()
    .optional()
    .describe("Optional: specific section filter"),
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe("Optional: preview changes without executing"),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe("Force regeneration even if content exists"),
});

export type GenerateOptions = z.input<typeof GenerateOptionsSchema>;

export const GenerateResultJobSchema: z.ZodObject<{
  jobId: z.ZodString;
  routeId: z.ZodString;
  sectionId: z.ZodString;
}> = z.object({
  jobId: z.string(),
  routeId: z.string(),
  sectionId: z.string(),
});

export type GenerateResultJob = z.output<typeof GenerateResultJobSchema>;

export const GenerateResultSchema: z.ZodObject<{
  jobs: z.ZodArray<typeof GenerateResultJobSchema>;
  totalSections: z.ZodNumber;
  queuedSections: z.ZodNumber;
  skippedSections: z.ZodOptional<z.ZodNumber>;
  batchId: z.ZodOptional<z.ZodString>;
}> = z.object({
  jobs: z.array(GenerateResultJobSchema),
  totalSections: z.number(),
  queuedSections: z.number(),
  skippedSections: z.number().optional(),
  batchId: z.string().optional(),
});

export type GenerateResult = z.output<typeof GenerateResultSchema>;
