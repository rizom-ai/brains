import {
  siteMetadataSchema,
  type SiteMetadata,
} from "@brains/site-composition";
import { z } from "@brains/utils/zod";
import type { SiteBuildDiagnostic } from "./site-builder-types";

/**
 * Schema for site build job data
 */
export interface SiteBuildJobData {
  environment?: "preview" | "production" | undefined;
  outputDir: string;
  workingDir?: string | undefined;
  enableContentGeneration?: boolean | undefined;
  siteConfig?: SiteMetadata | undefined;
  /** Automatic content-change generation observed when this build was queued. */
  inputGeneration?: number | undefined;
}

export const siteBuildJobSchema: z.ZodType<SiteBuildJobData, SiteBuildJobData> =
  z.object({
    environment: z.enum(["preview", "production"]).optional(),
    outputDir: z.string(),
    workingDir: z.string().optional(),
    enableContentGeneration: z.boolean().optional(),
    siteConfig: siteMetadataSchema.optional(),
    inputGeneration: z.number().int().nonnegative().optional(),
  });

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
