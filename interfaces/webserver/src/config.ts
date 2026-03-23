import { z } from "@brains/utils";

/**
 * Webserver configuration schema
 */
export const webserverConfigSchema = z.object({
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
});

export type WebserverConfig = z.infer<typeof webserverConfigSchema>;
