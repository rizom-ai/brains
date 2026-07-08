import { z } from "@brains/utils/zod";

export interface GenerateOptions {
  routeId?: string | undefined;
  sectionId?: string | undefined;
  dryRun?: boolean | undefined;
  force?: boolean | undefined;
}

interface ParsedGenerateOptions {
  routeId?: string | undefined;
  sectionId?: string | undefined;
  dryRun: boolean;
  force: boolean;
}

export const GenerateOptionsSchema: z.ZodObject<z.ZodRawShape> &
  z.ZodType<ParsedGenerateOptions, GenerateOptions> = z.object({
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

export interface GenerateResultJob {
  jobId: string;
  routeId: string;
  sectionId: string;
}

export interface GenerateResult {
  jobs: GenerateResultJob[];
  totalSections: number;
  queuedSections: number;
  skippedSections?: number | undefined;
  batchId?: string | undefined;
}

export const GenerateResultSchema: z.ZodType<GenerateResult, GenerateResult> =
  z.object({
    jobs: z.array(
      z.object({
        jobId: z.string(),
        routeId: z.string(),
        sectionId: z.string(),
      }),
    ),
    totalSections: z.number(),
    queuedSections: z.number(),
    skippedSections: z.number().optional(),
    batchId: z.string().optional(),
  });
