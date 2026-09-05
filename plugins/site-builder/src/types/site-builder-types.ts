import { siteMetadataSchema } from "@brains/site-composition";
import { type ProgressCallback } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import type { LayoutComponent, LayoutSlots } from "@brains/site-engine";

/**
 * Site builder options schema
 */
export const SiteBuilderOptionsSchema: z.ZodObject<{
  environment: z.ZodEnum<{ preview: "preview"; production: "production" }>;
  outputDir: z.ZodString;
  workingDir: z.ZodOptional<z.ZodString>;
  sharedImagesDir: z.ZodDefault<z.ZodString>;
  enableContentGeneration: z.ZodDefault<z.ZodBoolean>;
  cleanBeforeBuild: z.ZodDefault<z.ZodBoolean>;
  siteConfig: typeof siteMetadataSchema;
  layouts: z.ZodRecord<
    z.ZodString,
    z.ZodCustom<LayoutComponent, LayoutComponent>
  >;
  themeCSS: z.ZodOptional<z.ZodString>;
}> = z.object({
  environment: z.enum(["preview", "production"]),
  outputDir: z.string(),
  workingDir: z.string().optional(),
  sharedImagesDir: z.string().default("./dist/images"),
  enableContentGeneration: z.boolean().default(false),
  cleanBeforeBuild: z.boolean().default(true),
  siteConfig: siteMetadataSchema,
  layouts: z.record(z.string(), z.custom<LayoutComponent>()),
  themeCSS: z.string().optional(),
});

export type SiteBuilderOptionsSchemaOutput = z.output<
  typeof SiteBuilderOptionsSchema
>;
export type SiteBuilderOptionsSchemaInput = z.input<
  typeof SiteBuilderOptionsSchema
>;

export interface SiteBuilderOptions extends SiteBuilderOptionsSchemaInput {
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
  /** Environment-specific public URL used for staged SEO extension artifacts. */
  siteUrl: string | undefined;
  /** Optional caller cancellation combined with the builder-owned signal. */
  signal?: AbortSignal | undefined;
}

/**
 * Structured diagnostic emitted while validating or building a site.
 * String errors/warnings remain on BuildResult for compatibility.
 */
export const siteBuildDiagnosticCodeSchema: z.ZodEnum<{
  "build-failed": "build-failed";
  "build-cancelled": "build-cancelled";
  "output-commit-failed": "output-commit-failed";
  "unsafe-route-path": "unsafe-route-path";
  "missing-layout": "missing-layout";
  "missing-template": "missing-template";
  "missing-web-renderer": "missing-web-renderer";
  "unsafe-static-asset-path": "unsafe-static-asset-path";
  "static-asset-collision": "static-asset-collision";
  "public-asset-snapshot-failed": "public-asset-snapshot-failed";
  "section-content-resolution-failed": "section-content-resolution-failed";
  "invalid-section-content": "invalid-section-content";
  "missing-site-url": "missing-site-url";
  "staged-artifact-failed": "staged-artifact-failed";
}> = z.enum([
  "build-failed",
  "build-cancelled",
  "output-commit-failed",
  "unsafe-route-path",
  "missing-layout",
  "missing-template",
  "missing-web-renderer",
  "unsafe-static-asset-path",
  "static-asset-collision",
  "public-asset-snapshot-failed",
  "section-content-resolution-failed",
  "invalid-section-content",
  "missing-site-url",
  "staged-artifact-failed",
]);

export type SiteBuildDiagnosticCode = z.output<
  typeof siteBuildDiagnosticCodeSchema
>;

export const SiteBuildDiagnosticSchema: z.ZodObject<{
  severity: z.ZodEnum<{ warning: "warning"; error: "error" }>;
  code: typeof siteBuildDiagnosticCodeSchema;
  message: z.ZodString;
  routeId: z.ZodOptional<z.ZodString>;
  sectionId: z.ZodOptional<z.ZodString>;
  template: z.ZodOptional<z.ZodString>;
  path: z.ZodOptional<z.ZodString>;
}> = z.object({
  severity: z.enum(["warning", "error"]),
  code: siteBuildDiagnosticCodeSchema,
  message: z.string(),
  routeId: z.string().optional(),
  sectionId: z.string().optional(),
  template: z.string().optional(),
  path: z.string().optional(),
});

export type SiteBuildDiagnostic = z.output<typeof SiteBuildDiagnosticSchema>;

/**
 * Build result schema
 */
export const BuildResultSchema: z.ZodObject<{
  success: z.ZodBoolean;
  cancelled: z.ZodOptional<z.ZodBoolean>;
  skipped: z.ZodOptional<z.ZodBoolean>;
  outputDir: z.ZodString;
  filesGenerated: z.ZodNumber;
  routesBuilt: z.ZodNumber;
  errors: z.ZodOptional<z.ZodArray<z.ZodString>>;
  warnings: z.ZodOptional<z.ZodArray<z.ZodString>>;
  diagnostics: z.ZodOptional<z.ZodArray<typeof SiteBuildDiagnosticSchema>>;
}> = z.object({
  success: z.boolean(),
  cancelled: z.boolean().optional(),
  skipped: z.boolean().optional(),
  outputDir: z.string(),
  filesGenerated: z.number(),
  routesBuilt: z.number(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
  diagnostics: z.array(SiteBuildDiagnosticSchema).optional(),
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
