import { z } from "zod";
import { createPluginConfig } from "@brains/utils";

/**
 * Webserver plugin configuration schema
 */
export const webserverConfigSchema = createPluginConfig(
  {
    // Output directory for generated site
    outputDir: z.string().default("./dist").describe("Output directory for generated site"),
    
    // Path to the Astro site template
    astroSiteTemplate: z.string().optional().describe("Path to the Astro site template"),
    
    // Server configuration
    previewPort: z.number().int().min(1).max(65535).default(4321).describe("Port for preview server"),
    productionPort: z.number().int().min(1).max(65535).default(8080).describe("Port for production server"),
    
    // Site metadata
    siteTitle: z.string().default("Personal Brain").describe("Title of the generated site"),
    siteDescription: z.string().default("A digital knowledge repository").describe("Description of the generated site"),
    siteUrl: z.string().url().optional().describe("Public URL of the site"),
  },
  "Configuration for the webserver plugin",
);

/**
 * Type definitions for webserver configuration
 */
export type WebserverConfig = z.infer<typeof webserverConfigSchema>;
export type WebserverConfigInput = z.input<typeof webserverConfigSchema>;