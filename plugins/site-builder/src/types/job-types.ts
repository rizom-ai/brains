import { z } from "@brains/utils";

/**
 * Schema for site build job data
 */
export const siteBuildJobSchema = z.object({
  environment: z.enum(["preview", "production"]).optional(),
  outputDir: z.string(),
  workingDir: z.string().optional(),
  enableContentGeneration: z.boolean().optional(),
  siteConfig: z
    .object({
      title: z.string(),
      description: z.string(),
      url: z.string().optional(),
      analyticsScript: z.string().optional(),
    })
    .optional(),
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
  };
  generateEntityUrl: (entityType: string, slug: string) => string;
}
