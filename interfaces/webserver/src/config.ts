import { z } from "@brains/utils";

/**
 * Webserver configuration schema
 */
export const webserverConfigSchema = z.object({
  previewDistDir: z.string().describe("Directory for preview site files").default("./dist/site-preview"),
  productionDistDir: z.string().describe("Directory for production site files").default("./dist/site-production"),
  previewPort: z.number().describe("Port for preview server").default(4321),
  productionPort: z.number().describe("Port for production server").default(8080),
});

export type WebserverConfig = z.infer<typeof webserverConfigSchema>;
