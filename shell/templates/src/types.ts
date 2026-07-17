import { z, type ZodType } from "@brains/utils/zod";
import type { ContentFormatter } from "@brains/content-formatters";
import type { VNode } from "preact";

/**
 * Component type for layouts - using Preact
 * Returns a Preact VNode
 */
export type ComponentType<P = unknown> = {
  bivarianceHack(props: P): VNode;
}["bivarianceHack"];

export type TemplateDataSchema<T> = ZodType<T, unknown>;
/** @deprecated Use TemplateDataSchema<T>. */
export type TemplateSchemaParser<T> = TemplateDataSchema<T>;

/**
 * A runtime script that a template depends on. Site-builder collects
 * these per route across all templates rendered on the page, dedupes
 * by `src`, and injects them as <script> tags.
 *
 * Use this for non-hydration runtime scripts (background canvases,
 * scroll observers, decorative animations) that should ONLY load on
 * pages where the template actually renders — unlike the plugin-level
 * head-script registration which fires on every page.
 */
export interface RuntimeScript {
  src: string;
  defer?: boolean;
  module?: boolean;
}

export interface TemplateInput {
  name: string;
  description: string;
  schema: unknown;
  basePrompt?: string | undefined;
  useKnowledgeContext?: boolean | undefined;
  requiredPermission: "anchor" | "trusted" | "public";
  formatter?: unknown;
  overlayFormatter?: unknown;
  layout?:
    | {
        component?: unknown;
        fullscreen?: boolean | undefined;
      }
    | undefined;
  dataSourceId?: string | undefined;
}

/**
 * Helper function to create a type-safe component that automatically parses props
 * using the provided Zod schema
 *
 * Supports transformation between schema type and component type (e.g., enrichment)
 * @param TSchema - Type validated by schema (e.g., with optional url/typeLabel)
 * @param TComponent - Type expected by component (e.g., with required url/typeLabel)
 */
export function createTypedComponent<TSchema, TComponent = TSchema>(
  schema: TemplateDataSchema<TSchema>,
  component: ComponentType<TComponent>,
): ComponentType<unknown> {
  return (props: unknown) => {
    const parsedProps = schema.parse(props);
    // Cast is safe: external enrichment transforms TSchema → TComponent before component runs
    return component(parsedProps as unknown as TComponent);
  };
}

/**
 * Unified template interface that bundles content generation and view rendering
 * This is the single source of truth for what constitutes a template
 */
export interface Template extends Omit<
  TemplateInput,
  "schema" | "layout" | "formatter"
> {
  schema: TemplateDataSchema<unknown>;

  // View rendering capability (optional)
  layout?: {
    component?: ComponentType<unknown>;
    // When true, render without any page layout shell (no header/footer)
    fullscreen?: boolean;
  };

  // Data sourcing capability (optional)
  formatter?: ContentFormatter<unknown>; // For parsing stored content

  /**
   * Opt-in content overlay. When set alongside a `dataSourceId`, the section's
   * saved content is parsed with this formatter and merged over the datasource
   * output (authored fields win), rather than the two being mutually exclusive.
   * Lets a live datasource-backed section carry content-authored fields — e.g.
   * a map whose data is live but whose hero copy is editable. Absent → the
   * classic datasource-or-saved precedence is unchanged.
   */
  overlayFormatter?: ContentFormatter<unknown>;

  /**
   * Whether to retrieve relevant entities from the knowledge base
   * and inject them as context before AI generation. Default: false.
   */
  useKnowledgeContext?: boolean;

  /**
   * Runtime script dependencies. Loaded only on routes where this
   * template actually renders — site-builder collects from all
   * templates on a route, dedupes by src, and injects into <head>.
   */
  runtimeScripts?: RuntimeScript[];

  /**
   * Static files this template needs served alongside the site — typically
   * the file behind a runtimeScripts src. Keyed by output-relative path;
   * site-builder writes each entry into the build output for routes that
   * actually render this template.
   */
  staticAssets?: Record<string, string>;
}

/**
 * Helper to create a template with automatic component wrapping
 *
 * Supports transformation between schema type and component type (e.g., enrichment)
 * @param TSchema - Type validated by schema (datasource output)
 * @param TComponent - Type expected by component (after enrichment)
 */
export function createTemplate<TSchema = unknown, TComponent = TSchema>(
  template: Omit<Template, "layout" | "schema"> & {
    schema: TemplateDataSchema<TSchema>;
    layout?: {
      component?: ComponentType<TComponent>;
      fullscreen?: boolean;
    };
    runtimeScripts?: RuntimeScript[];
    staticAssets?: Record<string, string>;
  },
): Template {
  const { layout, schema, ...rest } = template;

  const result: Template = {
    ...rest,
    schema,
  };

  if (layout) {
    result.layout = {};
    if (layout.component) {
      result.layout.component = createTypedComponent<TSchema, TComponent>(
        schema,
        layout.component,
      );
    }
    if (layout.fullscreen !== undefined) {
      result.layout.fullscreen = layout.fullscreen;
    }
  }

  return result;
}

/**
 * Template schema for validation
 */
export const TemplateSchema: z.ZodType<TemplateInput> = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.any(), // ZodType can't be validated at runtime - required
  basePrompt: z.string().optional(), // Optional - if not provided, template doesn't support AI generation
  useKnowledgeContext: z.boolean().optional(),
  requiredPermission: z.enum(["anchor", "trusted", "public"]),
  formatter: z.any().optional(), // ContentFormatter instance
  overlayFormatter: z.any().optional(), // ContentFormatter for authored overlay
  layout: z
    .object({
      component: z.any().optional(), // ComponentType or string
      fullscreen: z.boolean().optional(),
    })
    .optional(),
  dataSourceId: z.string().optional(),
});
