import path from 'path';

import { z } from 'zod';

import { type LandingPageData, LandingPageSchema } from '@website/schemas';

// Default path for Astro project as a subdirectory within the project
const defaultAstroPath = path.join('src', 'website');


/**
 * Schema for website deployment configuration
 */
export const DeploymentConfigSchema = z.object({
  type: z.enum(['local-dev', 'caddy']).default('local-dev'),
  previewDir: z.string().optional(),
  liveDir: z.string().optional(),
  previewPort: z.number().default(4321),
  livePort: z.number().default(4322),
  domain: z.string().optional(),
});

export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;

/**
 * Schema for website configuration
 */
export const WebsiteConfigSchema = z.object({
  title: z.string().default('Personal Brain'),
  description: z.string().default('My personal website'),
  author: z.string(),
  baseUrl: z.string().url().default('http://localhost:4321'),
  astroProjectPath: z.string().default(defaultAstroPath),
  deployment: DeploymentConfigSchema.default({
    type: 'local-dev',
    previewPort: 4321,
    livePort: 4322,
  }),
});

export type WebsiteConfig = z.infer<typeof WebsiteConfigSchema>;

// Re-export the landing page schema and type from the shared location
export { LandingPageSchema, type LandingPageData };