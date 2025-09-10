import { z } from "@brains/utils";
import type { ProgressCallback } from "@brains/plugins";
import type { LayoutComponent } from "../config";

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
    copyright: z.string().optional(),
  }),
  layouts: z.record(z.any()),
  themeCSS: z.string().optional().default(""),
});

export type SiteBuilderOptions = z.infer<typeof SiteBuilderOptionsSchema> & {
  // Override layouts type
  layouts: Record<string, LayoutComponent>;
};

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
