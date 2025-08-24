/**
 * Content Provider Interface
 *
 * Minimal interface for plugins to provide content generation capabilities.
 * Providers implement only the methods they need.
 */
export interface IContentProvider {
  /**
   * Unique identifier for this provider
   */
  id: string;

  /**
   * Human-readable name for this provider
   */
  name: string;

  /**
   * Optional: Generate new content
   * Used by providers that create content (e.g., site-builder, email)
   */
  generate?: (request: unknown) => Promise<unknown>;

  /**
   * Optional: Fetch existing data
   * Used by providers that aggregate data (e.g., dashboard, reports)
   */
  fetch?: (query?: unknown) => Promise<unknown>;

  /**
   * Optional: Transform content between formats
   * Used by providers that convert content (e.g., markdown to HTML)
   */
  transform?: (content: unknown, format: string) => Promise<unknown>;
}

/**
 * Provider information for discovery
 */
export interface ProviderInfo {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;
}

/**
 * Provider capabilities
 */
export interface ProviderCapabilities {
  canGenerate: boolean;
  canFetch: boolean;
  canTransform: boolean;
}
