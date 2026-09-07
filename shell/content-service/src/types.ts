import { z, type ZodType } from "@brains/utils/zod";
import type { ContentFormatter } from "@brains/content-formatters";
import type { BaseEntity, ContentVisibility } from "@brains/entity-service";
import type { GenerationContext } from "./generation-context";
export {
  generationContextSchema,
  type GenerationContext,
} from "./generation-context";
import type {
  ContentGenerationPlan,
  ContentGenerationRequestInput,
  ContentGenerationJobData,
  ContentGenerationBatchResult,
} from "./generation-contracts";
import type { GenerationQueueBinding } from "./generation-submission";
import type { GenerationAccess } from "./generation-authorization";

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
/** Runtime-only generation settings; never author input. */
export interface GenerateContentOptions {
  pluginId?: string | undefined;
  signal?: AbortSignal | undefined;
  /** Fixes every read to the authorized output visibility (durable jobs). */
  visibilityScope?: ContentVisibility | undefined;
}

export interface ContentService {
  /**
   * Authorize a durable generation job: the full policy when it starts, and
   * current authority over the final fields when `persisted` is supplied.
   */
  authorizeGenerationWrite(
    data: ContentGenerationJobData,
    persisted?: Readonly<BaseEntity>,
  ): Promise<GenerationAccess>;

  submitGeneration(
    request: ContentGenerationRequestInput,
    binding: GenerationQueueBinding,
    signal?: AbortSignal,
  ): Promise<ContentGenerationBatchResult>;

  /** Plan validated, template-backed generation without enqueueing work. */
  planGeneration(
    request: ContentGenerationRequestInput,
    signal?: AbortSignal,
  ): Promise<ContentGenerationPlan>;

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
    options?: GenerateContentOptions,
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
