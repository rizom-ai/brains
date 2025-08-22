import type {
  RouteDefinition,
  SectionDefinition,
  Template,
} from "@brains/view-registry";
import type { ProgressInfo } from "./content-service";
import type { 
  IContentProvider, 
  Content, 
  ContentContext
} from "./interfaces/provider";

/**
 * Context for content generation - simplified for template-based approach
 */
export interface GenerationContext {
  prompt?: string | undefined;
  data?: Record<string, unknown> | undefined;
  conversationId: string; // Always required for tracking context (use "system" for non-conversation contexts)
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

  // ===== Provider Registry Methods =====

  /**
   * Register a content provider
   */
  registerProvider(provider: IContentProvider): void;

  /**
   * Unregister a content provider
   */
  unregisterProvider(providerId: string): void;

  /**
   * Get a registered provider
   */
  getProvider(providerId: string): IContentProvider | undefined;

  /**
   * List all registered providers
   */
  listProviders(): IContentProvider[];

  /**
   * Generate content using a provider
   */
  generate(request: {
    provider: string;
    type: string;
    data: unknown;
    context?: ContentContext;
  }): Promise<Content>;

  /**
   * Get all available content types from all providers
   */
  getAvailableContentTypes(): Array<{
    provider: string;
    types: Array<{ id: string; name: string; description?: string }>;
  }>;
}
