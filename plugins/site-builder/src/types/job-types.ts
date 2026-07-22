import { siteBuilderSiteMetadataSchema } from "./site-metadata-schema";
import type { SiteMetadata } from "@brains/site-composition";
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
}

export const siteBuildJobSchema: z.ZodType<SiteBuildJobData, SiteBuildJobData> =
  z.object({
    environment: z.enum(["preview", "production"]).optional(),
    outputDir: z.string(),
    workingDir: z.string().optional(),
    enableContentGeneration: z.boolean().optional(),
    siteConfig: siteBuilderSiteMetadataSchema.optional(),
  });

/**
 * Site build job result type
 */
export interface SiteBuildJobResult {
  success: boolean;
  cancelled?: boolean;
  routesBuilt: number;
  outputDir: string;
  environment: "preview" | "production";
  errors?: string[];
  warnings?: string[];
  diagnostics?: SiteBuildDiagnostic[];
}

/**
 * Payload for site:build:completed event
 */
export interface SiteBuildCompletedPayload {
  outputDir: string;
  environment: "preview" | "production";
  routesBuilt: number;
  siteConfig: {
    title?: string | undefined;
    description?: string | undefined;
    url?: string | undefined;
    copyright?: string | undefined;
    themeMode?: "light" | "dark" | undefined;
  };
  generateEntityUrl: (entityType: string, slug: string) => string;
}

/** Payload for extensions that write optional artifacts into staging. */
export type SiteBuildStagingPayload = SiteBuildCompletedPayload;
