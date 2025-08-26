import { z } from "zod";

/**
 * DataSource Interface
 *
 * Provides data for templates through fetch, generate, or transform operations.
 * DataSources are registered in the DataSourceRegistry and referenced by templates
 * via their dataSourceId property.
 */
export interface DataSource {
  /**
   * Unique identifier for this data source
   */
  id: string;

  /**
   * Human-readable name for this data source
   */
  name: string;

  /**
   * Optional description of what this data source provides
   */
  description?: string;

  /**
   * Optional: Fetch existing data
   * Used by data sources that aggregate or retrieve data (e.g., dashboard stats, API data)
   */
  fetch?: <T>(query: unknown, schema: z.ZodSchema<T>) => Promise<T>;

  /**
   * Optional: Generate new content
   * Used by data sources that create content (e.g., AI-generated content, reports)
   */
  generate?: <T>(request: unknown, schema: z.ZodSchema<T>) => Promise<T>;

  /**
   * Optional: Transform content between formats
   * Used by data sources that convert content (e.g., markdown to HTML, data formatting)
   */
  transform?: <T>(content: unknown, format: string, schema: z.ZodSchema<T>) => Promise<T>;
}

/**
 * DataSource capabilities for discovery and validation
 */
export interface DataSourceCapabilities {
  canFetch: boolean;
  canGenerate: boolean;
  canTransform: boolean;
}
