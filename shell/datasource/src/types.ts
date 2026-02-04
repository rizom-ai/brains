import type { z } from "@brains/utils";
import type { IEntityService } from "@brains/plugins";

/**
 * Context passed to all DataSource operations
 * Contains internal state that should not be mixed with user query parameters
 */
export interface BaseDataSourceContext {
  /**
   * Whether to filter to only published/complete content
   * Set by site-builder: true for production, false for preview
   */
  publishedOnly?: boolean;

  /**
   * Scoped entity service that auto-applies publishedOnly filter
   * Datasources should use this instead of their injected entityService
   * to ensure consistent filtering behavior across environments
   */
  entityService: IEntityService;
}

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
   * DataSources validate output using the provided schema
   * @param query - Query parameters for fetching data
   * @param outputSchema - Schema for validating output data
   * @param context - Context with environment
   */
  fetch?: <T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ) => Promise<T>;

  /**
   * Optional: Generate new content
   * Used by data sources that create content (e.g., AI-generated content, reports)
   */
  generate?: <T>(request: unknown, schema: z.ZodSchema<T>) => Promise<T>;

  /**
   * Optional: Transform content between formats
   * Used by data sources that convert content (e.g., markdown to HTML, data formatting)
   */
  transform?: <T>(
    content: unknown,
    format: string,
    schema: z.ZodSchema<T>,
  ) => Promise<T>;
}

/**
 * DataSource capabilities for discovery and validation
 */
export interface DataSourceCapabilities {
  canFetch: boolean;
  canGenerate: boolean;
  canTransform: boolean;
}
