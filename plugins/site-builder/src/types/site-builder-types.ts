import { z } from "zod";
import type { ProgressCallback } from "@brains/plugins";

/**
 * Site builder options schema
 */
export const SiteBuilderOptionsSchema = z.object({
  environment: z.enum(["preview", "production"]),
  outputDir: z.string(),
  workingDir: z.string().optional(),
  enableContentGeneration: z.boolean().default(false),
  cleanBeforeBuild: z.boolean().default(true),
  siteConfig: z.object({
    title: z.string(),
    description: z.string(),
    url: z.string().optional(),
  }),
});

export type SiteBuilderOptions = z.infer<typeof SiteBuilderOptionsSchema>;

/**
 * Build result schema
 */
export const BuildResultSchema = z.object({
  success: z.boolean(),
  outputDir: z.string(),
  filesGenerated: z.number(),
  routesBuilt: z.number(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

export type BuildResult = z.infer<typeof BuildResultSchema>;

/**
 * Site builder interface
 */
export interface ISiteBuilder {
  build(
    options: SiteBuilderOptions,
    progress?: ProgressCallback,
  ): Promise<BuildResult>;
}
