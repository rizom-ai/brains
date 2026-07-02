import { z } from "@brains/utils/zod-v4";

export interface WebserverConfig {
  enablePreview: boolean;
  previewDistDir: string;
  productionDistDir: string;
  sharedImagesDir: string;
  previewPort: number;
  productionPort: number;
  apiPort: number;
}

export interface WebserverConfigInput {
  enablePreview?: boolean | undefined;
  previewDistDir?: string | undefined;
  productionDistDir?: string | undefined;
  sharedImagesDir?: string | undefined;
  previewPort?: number | undefined;
  productionPort?: number | undefined;
  apiPort?: number | undefined;
}

/**
 * Webserver configuration schema
 */
export const webserverConfigSchema: z.ZodType<
  WebserverConfig,
  WebserverConfigInput
> = z.object({
  enablePreview: z
    .boolean()
    .default(true)
    .describe(
      "Enable the preview site server when preview assets are configured",
    ),
  previewDistDir: z
    .string()
    .default("./dist/site-preview")
    .describe("Directory for preview site files"),
  productionDistDir: z
    .string()
    .describe("Directory for production site files")
    .default("./dist/site-production"),
  sharedImagesDir: z
    .string()
    .default("./dist/images")
    .describe("Shared directory for optimized images"),
  previewPort: z.number().default(4321).describe("Port for preview server"),
  productionPort: z
    .number()
    .describe("Port for production server")
    .default(8080),
  apiPort: z
    .number()
    .describe("Port for API route server (plugin HTTP endpoints)")
    .default(3335),
});
