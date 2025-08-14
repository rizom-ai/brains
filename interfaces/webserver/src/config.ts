import { z } from "zod";

/**
 * Webserver configuration schema
 */
export const webserverConfigSchema = z.object({
  previewDistDir: z.string().describe("Directory for preview site files"),
  productionDistDir: z.string().describe("Directory for production site files"),
  previewPort: z.number().describe("Port for preview server"),
  productionPort: z.number().describe("Port for production server"),
});

export type WebserverConfig = z.infer<typeof webserverConfigSchema>;

export const defaultWebserverConfig: WebserverConfig = {
  previewDistDir: "./dist/site-preview",
  productionDistDir: "./dist/site-production",
  previewPort: 4321,
  productionPort: 8080,
};
