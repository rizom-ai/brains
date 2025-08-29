import { z } from "zod";
import type { ContentFormatter } from "@brains/utils";

/**
 * Zod schema for ContentTemplate validation (used in plugin configurations)
 */
export const ContentTemplateSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.any(), // ZodType can't be validated at runtime - required
  basePrompt: z.string().optional(), // Optional - if not provided, template doesn't support AI generation
  requiredPermission: z.enum(["anchor", "trusted", "public"]),
  formatter: z.any().optional(), // ContentFormatter instance
  dataSourceId: z.string().optional(), // DataSource ID for content generation
  layout: z
    .object({
      component: z.any(), // Component function or string
      description: z.string().optional(),
      interactive: z.boolean().optional(),
      packageName: z.string().optional(),
    })
    .optional(),
});

/**
 * ContentTemplate for reusable generation patterns and view rendering
 */
export interface ContentTemplate<T = unknown>
  extends Omit<z.infer<typeof ContentTemplateSchema>, "schema" | "formatter"> {
  schema: z.ZodType<T>;
  formatter?: ContentFormatter<T>;
  dataSourceId?: string;
}

/**
 * Context for content generation - simplified for template-based approach
 */
export interface GenerationContext {
  prompt?: string;
  conversationHistory?: string;
  data?: Record<string, unknown>;
}

/**
 * Options for content resolution with multiple strategies
 */
export interface ResolutionOptions {
  /** Look up previously saved content from entity storage */
  savedContent?: {
    entityType: string;
    entityId: string;
  };
  /** Parameters for DataSource fetch operation */
  dataParams?: unknown;
  /** Format for DataSource transform operation (e.g., "list" or "detail") */
  transformFormat?: string;
  /** Static fallback content */
  fallback?: unknown;
}

/**
 * Public interface for ContentService
 * Used by plugins and for testing
 */
export interface ContentService {
  /**
   * Get a registered template
   */
  getTemplate(name: string): ContentTemplate<unknown> | null;

  /**
   * List all available templates
   */
  listTemplates(): ContentTemplate<unknown>[];

  /**
   * Resolve content for a template using multiple resolution strategies
   * Priority order: DataSource fetch -> saved content -> fallback
   */
  resolveContent<T = unknown>(
    templateName: string,
    options?: ResolutionOptions,
    pluginId?: string,
  ): Promise<T | null>;

  /**
   * Generate content using a template with entity-aware context
   */
  generateContent<T = unknown>(
    templateName: string,
    context?: GenerationContext,
    pluginId?: string,
  ): Promise<T>;

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
}
