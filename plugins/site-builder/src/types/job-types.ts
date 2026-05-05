import { z } from "@brains/utils";
import { siteMetadataSchema } from "@brains/site-composition";

/**
 * Schema for site build job data
 */
export const siteBuildJobSchema = z.object({
  environment: z.enum(["preview", "production"]).optional(),
  outputDir: z.string(),
  workingDir: z.string().optional(),
  enableContentGeneration: z.boolean().optional(),
  siteConfig: siteMetadataSchema.optional(),
});

/**
 * Site build job data type
 */
export type SiteBuildJobData = z.infer<typeof siteBuildJobSchema>;

/**
 * Site build job result type
 */
export interface SiteBuildJobResult {
  success: boolean;
  routesBuilt: number;
  outputDir: string;
  environment: "preview" | "production";
  errors?: string[];
  warnings?: string[];
}

/**
 * Payload for site:build:completed event
 */
export interface SiteBuildCompletedPayload {
  outputDir: string;
  environment: "preview" | "production";
  routesBuilt: number;
  siteConfig: {
    title?: string;
    description?: string;
    url?: string;
    copyright?: string;
    themeMode?: "light" | "dark";
  };
  generateEntityUrl: (entityType: string, slug: string) => string;
}
