import type { SiteMetadata } from "@brains/site-composition";
import type { ProgressCallback } from "@brains/utils";
import { z } from "@brains/utils/zod";
import type { LayoutComponent, LayoutSlots } from "@brains/site-engine";
import { siteBuilderSiteMetadataSchema } from "./site-metadata-schema";

/**
 * Site builder options schema
 */
export interface SiteBuilderOptionsSchemaOutput {
  environment: "preview" | "production";
  outputDir: string;
  workingDir?: string | undefined;
  sharedImagesDir: string;
  enableContentGeneration: boolean;
  cleanBeforeBuild: boolean;
  siteConfig: SiteMetadata;
  layouts: Record<string, LayoutComponent>;
  themeCSS?: string | undefined;
}

export interface SiteBuilderOptionsSchemaInput {
  environment: "preview" | "production";
  outputDir: string;
  workingDir?: string | undefined;
  sharedImagesDir?: string | undefined;
  enableContentGeneration?: boolean | undefined;
  cleanBeforeBuild?: boolean | undefined;
  siteConfig: SiteMetadata;
  layouts: Record<string, LayoutComponent>;
  themeCSS?: string | undefined;
}

export const SiteBuilderOptionsSchema: z.ZodType<
  SiteBuilderOptionsSchemaOutput,
  SiteBuilderOptionsSchemaInput
> = z.object({
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

export interface SiteBuilderOptions extends SiteBuilderOptionsSchemaOutput {
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
}

/**
 * Build result schema
 */
export interface BuildResult {
  success: boolean;
  outputDir: string;
  filesGenerated: number;
  routesBuilt: number;
  errors?: string[] | undefined;
  warnings?: string[] | undefined;
}

export const BuildResultSchema: z.ZodType<BuildResult, BuildResult> = z.object({
  success: z.boolean(),
  outputDir: z.string(),
  filesGenerated: z.number(),
  routesBuilt: z.number(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

/**
 * Site builder interface
 */
export interface ISiteBuilder {
  build(
    options: SiteBuilderOptions,
    progress?: ProgressCallback,
  ): Promise<BuildResult>;
}
