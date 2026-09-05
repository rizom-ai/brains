import { z } from "@brains/utils/zod";

type WebserverConfigSchema = z.ZodObject<{
  enablePreview: z.ZodDefault<z.ZodBoolean>;
  previewDistDir: z.ZodDefault<z.ZodString>;
  productionDistDir: z.ZodDefault<z.ZodString>;
  sharedImagesDir: z.ZodDefault<z.ZodString>;
  previewPort: z.ZodDefault<z.ZodNumber>;
  productionPort: z.ZodDefault<z.ZodNumber>;
  apiPort: z.ZodDefault<z.ZodNumber>;
}>;

/**
 * Webserver configuration schema
 */
export const webserverConfigSchema: WebserverConfigSchema = z.object({
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

export type WebserverConfig = z.output<typeof webserverConfigSchema>;
export type WebserverConfigInput = z.input<typeof webserverConfigSchema>;
