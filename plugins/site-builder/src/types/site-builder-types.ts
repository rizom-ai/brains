import type { ProgressCallback } from "@brains/utils";
import { z } from "@brains/utils/zod-v4";
import type { LayoutComponent, LayoutSlots } from "@brains/site-engine";
import { siteBuilderSiteMetadataSchema } from "./site-metadata-schema";

/**
 * Site builder options schema
 */
export const SiteBuilderOptionsSchema = z.object({
  environment: z.enum(["preview", "production"]),
  outputDir: z.string(),
  workingDir: z.string().optional(),
  sharedImagesDir: z.string().default("./dist/images"),
  enableContentGeneration: z.boolean().default(false),
  cleanBeforeBuild: z.boolean().default(true),
  siteConfig: siteBuilderSiteMetadataSchema,
  layouts: z.record(z.string(), z.any()),
  themeCSS: z.string().optional(),
});

export type SiteBuilderOptions = z.output<typeof SiteBuilderOptionsSchema> & {
  // Override layouts type
  layouts: Record<string, LayoutComponent>;
  // Optional slot registry for plugin-registered UI components
  slots?: LayoutSlots | undefined;
  // Head scripts registered by other plugins (e.g., analytics beacon)
  headScripts?: string[] | undefined;
  /**
   * Static assets to write into the output directory at build time.
   * Keys are output paths relative to outputDir (e.g. `/canvases/tree.js`),
   * values are file contents as strings. Supplied by a SitePackage via
   * text imports.
   */
  staticAssets?: Record<string, string> | undefined;
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

export type BuildResult = z.output<typeof BuildResultSchema>;

/**
 * Site builder interface
 */
export interface ISiteBuilder {
  build(
    options: SiteBuilderOptions,
    progress?: ProgressCallback,
  ): Promise<BuildResult>;
}
