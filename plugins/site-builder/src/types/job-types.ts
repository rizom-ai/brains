import { z } from "zod";

/**
 * Schema for site build job data
 */
export const siteBuildJobSchema = z.object({
  environment: z.enum(["preview", "production"]).default("preview"),
  outputDir: z.string(),
  workingDir: z.string().optional(),
  enableContentGeneration: z.boolean().default(false),
  siteConfig: z
    .object({
      title: z.string(),
      description: z.string(),
      url: z.string().optional(),
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
