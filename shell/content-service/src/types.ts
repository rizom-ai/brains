import type {
  RouteDefinition,
  SectionDefinition,
  Template,
} from "@brains/view-registry";
import type { ProgressInfo } from "./content-service";
import type { IContentProvider, ProviderInfo } from "./providers/types";

/**
 * Context for content generation - simplified for template-based approach
 */
export interface GenerationContext {
  prompt?: string | undefined;
  data?: Record<string, unknown> | undefined;
  conversationId?: string | undefined;
}

/**
 * Public interface for ContentService
 * Used by plugins and for testing
 */
export interface ContentService {
  /**
   * Register a reusable template
   */
  registerTemplate<T>(name: string, template: Template<T>): void;

  /**
   * Get a registered template
   */
  getTemplate(name: string): Template<unknown> | null;

  /**
   * List all available templates
   */
  listTemplates(): Template<unknown>[];

  /**
   * Generate content using a template with entity-aware context
   */
  generateContent<T = unknown>(
    templateName: string,
    context?: GenerationContext,
    pluginId?: string,
  ): Promise<T>;

  /**
   * Generate content for a specific route and section
   */
  generateWithRoute(
    route: RouteDefinition,
    section: SectionDefinition,
    progressInfo: ProgressInfo,
    additionalContext?: Record<string, unknown>,
  ): Promise<string>;

  /**
   * Format content using a template's formatter
   */
  formatContent<T = unknown>(
    templateName: string,
    data: T,
    options?: { truncate?: number; pluginId?: string },
  ): string;

  /**
   * Parse existing content using a template's formatter
   */
  parseContent<T = unknown>(
    templateName: string,
    content: string,
    pluginId?: string,
  ): T;

  // ========== Provider Methods ==========

  /**
   * Register a content provider
   */
  registerProvider(provider: IContentProvider): void;

  /**
   * Get a provider by ID
   */
  getProvider(id: string): IContentProvider | undefined;

  /**
   * List all registered providers
   */
  listProviders(): IContentProvider[];

  /**
   * Get provider information for discovery
   */
  getProviderInfo(id: string): ProviderInfo | undefined;

  /**
   * Get all provider information
   */
  getAllProviderInfo(): ProviderInfo[];

  /**
   * Generate content using a provider
   */
  generateFromProvider(providerId: string, request: unknown): Promise<unknown>;

  /**
   * Fetch data using a provider
   */
  fetchFromProvider(providerId: string, query: unknown): Promise<unknown>;

  /**
   * Transform content using a provider
   */
  transformWithProvider(
    providerId: string,
    content: unknown,
    format: string,
  ): Promise<unknown>;
}
