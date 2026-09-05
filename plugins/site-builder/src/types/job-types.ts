import { siteMetadataSchema } from "@brains/site-composition";
import { z } from "@brains/utils/zod";
import type { SiteBuildDiagnostic } from "./site-builder-types";

/**
 * Schema for site build job data
 */
export const siteBuildJobSchema: z.ZodObject<{
  environment: z.ZodOptional<
    z.ZodEnum<{ preview: "preview"; production: "production" }>
  >;
  outputDir: z.ZodString;
  workingDir: z.ZodOptional<z.ZodString>;
  enableContentGeneration: z.ZodOptional<z.ZodBoolean>;
  siteConfig: z.ZodOptional<typeof siteMetadataSchema>;
  inputGeneration: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  environment: z.enum(["preview", "production"]).optional(),
  outputDir: z.string(),
  workingDir: z.string().optional(),
  enableContentGeneration: z.boolean().optional(),
  siteConfig: siteMetadataSchema.optional(),
  /** Automatic content-change generation observed when this build was queued. */
  inputGeneration: z.number().int().nonnegative().optional(),
});

export type SiteBuildJobData = z.output<typeof siteBuildJobSchema>;

/**
 * Site build job result type
 */
export interface SiteBuildJobResult {
  success: boolean;
  cancelled?: boolean;
  skipped?: boolean;
  routesBuilt: number;
  outputDir: string;
  environment: "preview" | "production";
  errors?: string[];
  warnings?: string[];
  diagnostics?: SiteBuildDiagnostic[];
}

export type {
  SiteBuildCompletedPayload,
  SiteBuildStagingPayload,
} from "@brains/contracts";
