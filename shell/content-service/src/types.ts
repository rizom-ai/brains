import { z, type ZodType } from "@brains/utils/zod";
import type { ContentFormatter } from "@brains/content-formatters";
import type { ContentVisibility } from "@brains/entity-service";

export type ContentTemplateDataSchema<T> = ZodType<T, unknown>;
/** @deprecated Use ContentTemplateDataSchema<T>. */
export type ContentTemplateSchemaParser<T> = ContentTemplateDataSchema<T>;

/**
 * Zod schema for ContentTemplate validation (used in plugin configurations)
 */
export const ContentTemplateSchema: z.ZodObject<{
  name: z.ZodString;
  description: z.ZodString;
  schema: z.ZodUnknown;
  basePrompt: z.ZodOptional<z.ZodString>;
  requiredPermission: z.ZodEnum<{
    admin: "admin";
    trusted: "trusted";
    public: "public";
  }>;
  formatter: z.ZodOptional<z.ZodUnknown>;
  dataSourceId: z.ZodOptional<z.ZodString>;
  layout: z.ZodOptional<
    z.ZodObject<{
      component: z.ZodUnknown;
      description: z.ZodOptional<z.ZodString>;
      packageName: z.ZodOptional<z.ZodString>;
    }>
  >;
}> = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.unknown(), // ZodType can't be validated at runtime - required
  basePrompt: z.string().optional(), // Optional - if not provided, template doesn't support AI generation
  requiredPermission: z.enum(["admin", "trusted", "public"]),
  formatter: z.unknown().optional(), // ContentFormatter instance
  dataSourceId: z.string().optional(), // DataSource ID for content generation
  layout: z
    .object({
      component: z.unknown(), // Component function or string
      description: z.string().optional(),
      packageName: z.string().optional(),
    })
    .optional(),
});

export type ContentTemplateInput = z.output<typeof ContentTemplateSchema>;

/**
 * ContentTemplate for reusable generation patterns and view rendering
 */
export interface ContentTemplate<T = unknown> extends Omit<
  ContentTemplateInput,
  "schema" | "formatter"
> {
  schema: ContentTemplateDataSchema<T>;
  formatter?: ContentFormatter<T>;
  dataSourceId?: string;
}

/**
 * Context for content generation - simplified for template-based approach
 */
export const generationContextSchema: z.ZodObject<{
  prompt: z.ZodOptional<z.ZodString>;
  conversationHistory: z.ZodOptional<z.ZodString>;
  data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  representedIdentity: z.ZodOptional<
    z.ZodEnum<{ brain: "brain"; anchor: "anchor"; none: "none" }>
  >;
  styleGuide: z.ZodOptional<
    z.ZodObject<{
      voice: z.ZodOptional<z.ZodString>;
      visual: z.ZodOptional<z.ZodString>;
    }>
  >;
}> = z.object({
  prompt: z.string().optional(),
  conversationHistory: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  representedIdentity: z.enum(["brain", "anchor", "none"]).optional(),
  styleGuide: z
    .object({
      voice: z.string().optional(),
      visual: z.string().optional(),
    })
    .optional(),
});

export type GenerationContext = z.output<typeof generationContextSchema>;

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
  /**
   * Whether to filter to only published/complete content
   * Set by site-builder: true for production, false for preview
   */
  publishedOnly?: boolean;
  /**
   * Visibility scope to enforce on entity lookups within this resolution.
   * Set by site-builder: "public" for production, anchor scope for preview.
   * Undefined fails closed at the entity-service chokepoint to "public".
   */
  visibilityScope?: ContentVisibility;
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
   *
   * Returns `unknown`: the value is validated against the *template's* schema,
   * which a caller-chosen type parameter has no relationship to. Callers that
   * need a specific type should parse it.
   */
  resolveContent(
    templateName: string,
    options?: ResolutionOptions,
    pluginId?: string,
  ): Promise<unknown>;

  /**
   * Generate content using a template with entity-aware context.
   *
   * Returns unknown: generation validates against the template's schema, and
   * callers parse the shape they need.
   */
  generateContent(
    templateName: string,
    context?: GenerationContext,
    pluginId?: string,
  ): Promise<unknown>;

  /**
   * Format content using a template's formatter
   */
  formatContent<T = unknown>(
    templateName: string,
    data: T,
    options?: { truncate?: number; pluginId?: string },
  ): string;

  /**
   * Parse existing content using a template's formatter. Returns unknown:
   * the formatter parses to the template's own shape.
   */
  parseContent(
    templateName: string,
    content: string,
    pluginId?: string,
  ): unknown;
}
