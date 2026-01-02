/**
 * Result returned by a publish provider after successful publish
 */
export interface PublishResult {
  /** Platform-specific ID of the published content */
  id: string;
  /** URL to the published content (if applicable) */
  url?: string;
  /** Additional platform-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for publish providers that handle actual publishing to platforms.
 * Plugins can implement custom providers for external platforms (LinkedIn, etc.)
 * or use the default InternalPublishProvider for internal publishing (blog, decks).
 */
export interface PublishProvider {
  /** Name of the provider (e.g., "linkedin", "internal") */
  name: string;

  /**
   * Publish content to the platform
   * @param content - The content to publish (markdown body)
   * @param metadata - Entity metadata for context
   * @returns Result with platform-specific ID
   */
  publish(
    content: string,
    metadata: Record<string, unknown>,
  ): Promise<PublishResult>;

  /**
   * Optionally validate that credentials are configured correctly
   * @returns true if credentials are valid
   */
  validateCredentials?(): Promise<boolean>;
}

/**
 * Default provider for internal publishing (blog, decks).
 * Does not call any external API - just marks entity as published.
 */
export class InternalPublishProvider implements PublishProvider {
  name = "internal";

  async publish(
    _content: string,
    _metadata: Record<string, unknown>,
  ): Promise<PublishResult> {
    return { id: "internal" };
  }
}
