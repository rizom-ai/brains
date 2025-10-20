import { z } from "@brains/utils";

/**
 * Webserver configuration schema
 */
export const webserverConfigSchema = z.object({
  previewDistDir: z
    .string()
    .optional()
    .describe("Directory for preview site files"),
  productionDistDir: z
    .string()
    .describe("Directory for production site files")
    .default("./dist/site-production"),
  previewPort: z.number().optional().describe("Port for preview server"),
  productionPort: z
    .number()
    .describe("Port for production server")
    .default(8080),
  productionDomain: z
    .string()
    .optional()
    .describe("Public domain for production server (e.g., https://babal.io)"),
  previewDomain: z
    .string()
    .optional()
    .describe(
      "Public domain for preview server (e.g., https://preview.babal.io)",
    ),
});

export type WebserverConfig = z.infer<typeof webserverConfigSchema>;
