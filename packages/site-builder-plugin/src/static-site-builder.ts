import type { Logger } from "@brains/utils";
import type { z } from "zod";

/**
 * Interface for static site builders (Astro, Next.js, etc.)
 */
export interface StaticSiteBuilder {
  /**
   * Prepare the working directory with template
   */
  prepare(): Promise<void>;

  /**
   * Generate content configuration
   */
  generateContentConfig(
    schemas: Map<string, z.ZodType<unknown>>,
  ): Promise<void>;

  /**
   * Write content file
   */
  writeContentFile(
    collection: string,
    filename: string,
    content: unknown,
  ): Promise<void>;

  /**
   * Build the static site
   */
  build(onProgress?: (message: string) => void): Promise<void>;

  /**
   * Check if a build exists
   */
  hasBuild(): boolean;

  /**
   * Clean build artifacts
   */
  clean(): Promise<void>;
}

/**
 * Options for creating a static site builder
 */
export interface StaticSiteBuilderOptions {
  logger: Logger;
  workingDir: string;
  outputDir: string;
}

/**
 * Factory function type for static site builders
 */
export type StaticSiteBuilderFactory = (
  options: StaticSiteBuilderOptions,
) => StaticSiteBuilder;
