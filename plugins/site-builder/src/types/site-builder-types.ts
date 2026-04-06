import { z } from "@brains/utils";
import type { ProgressCallback } from "@brains/plugins";
import type { LayoutComponent, LayoutSlots } from "../config";

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
  siteConfig: z.object({
    title: z.string(),
    description: z.string(),
    url: z.string().optional(),
    copyright: z.string().optional(),
    themeMode: z.enum(["light", "dark"]).optional(),
    analyticsScript: z.string().optional(),
  }),
  layouts: z.record(z.any()),
  themeCSS: z.string().optional(),
});

export type SiteBuilderOptions = z.infer<typeof SiteBuilderOptionsSchema> & {
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
