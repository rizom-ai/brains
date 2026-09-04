import { z, type ZodType } from "@brains/utils/zod";
import type { JsonObject, JsonObjectOutputGuard } from "@brains/contracts";
import { jsonObjectSchema } from "@brains/contracts";
import type { ContentFormatter } from "@brains/content-formatters";
import type { ReactElement } from "react";

/**
 * Component type for layouts - using React
 * Returns a React element
 */
export type ComponentType<P = unknown> = {
  bivarianceHack(props: P): ReactElement;
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
  requiredPermission: "admin" | "trusted" | "public";
  /** Stable author-owned version for output-affecting renderer behavior. */
  renderVersion?: string | undefined;
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
 * Wrap a component so its props are parsed before it runs.
 *
 * The schema passed here is the one the *component* consumes. Where
 * site-builder enriches datasource output before render (filling `url`,
 * `typeLabel`, and similar), that enriched shape is what must be proven —
 * so a template declaring a component type distinct from its datasource type
 * supplies `layout.renderSchema` and this parses against it.
 */
export function createTypedComponent<TComponent>(
  schema: TemplateDataSchema<TComponent>,
  component: ComponentType<TComponent>,
): ComponentType<unknown> {
  return (props: unknown) => component(schema.parse(props));
}

/**
 * Unified template interface that bundles content generation and view rendering
 * This is the single source of truth for what constitutes a template
 */
interface TemplateBase extends Omit<
  TemplateInput,
  "schema" | "layout" | "formatter"
> {
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

/** A renderer template must parse to a JSON document before it can be snapshotted. */
export interface LayoutTemplate extends TemplateBase {
  schema: TemplateDataSchema<JsonObject>;
  layout: {
    component?: ComponentType<unknown>;
    // When true, render without any page layout shell (no header/footer)
    fullscreen?: boolean;
  };
}

/** Generation-only templates never enter the serializable site-build snapshot. */
export interface NonLayoutTemplate extends TemplateBase {
  schema: TemplateDataSchema<unknown>;
  layout?: undefined;
}

export type Template = LayoutTemplate | NonLayoutTemplate;

/**
 * Helper to create a template with automatic component wrapping
 *
 * Supports transformation between schema type and component type (e.g., enrichment)
 * @param TSchema - Type validated by schema (datasource output)
 * @param TComponent - Type expected by component (after enrichment)
 */
export function createTemplate<TSchema = unknown, TComponent = TSchema>(
  template: Omit<TemplateBase, "layout" | "schema"> &
    (
      | {
          schema: TemplateDataSchema<TSchema> & JsonObjectOutputGuard<TSchema>;
          layout:
            | {
                // The component consumes the datasource shape, so `schema`
                // already proves its props.
                component?: ComponentType<NoInfer<TSchema>>;
                renderSchema?: undefined;
                fullscreen?: boolean;
              }
            | {
                // The component consumes an enriched shape that site-builder
                // produces after the datasource; that shape needs its own
                // schema, because nothing else has checked it.
                component: ComponentType<TComponent>;
                renderSchema: TemplateDataSchema<TComponent>;
                fullscreen?: boolean;
              };
        }
      | {
          schema: TemplateDataSchema<TSchema>;
          layout?: undefined;
        }
    ) & {
      runtimeScripts?: RuntimeScript[];
      staticAssets?: Record<string, string>;
    },
): Template {
  const { layout, schema, ...rest } = template;

  if (!layout) {
    return { ...rest, schema };
  }

  const result: LayoutTemplate = {
    ...rest,
    // The guard proves TSchema is JSON-shaped at the call site; piping proves
    // it of the parsed value too, so the snapshot contract is checked rather
    // than asserted.
    schema: z
      .unknown()
      .transform((data) => jsonObjectSchema.parse(schema.parse(data))),
    layout: {},
  };
  if (layout.renderSchema) {
    result.layout.component = createTypedComponent(
      layout.renderSchema,
      layout.component,
    );
  } else if (layout.component) {
    result.layout.component = createTypedComponent(schema, layout.component);
  }
  if (layout.fullscreen !== undefined) {
    result.layout.fullscreen = layout.fullscreen;
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
  requiredPermission: z.enum(["admin", "trusted", "public"]),
  renderVersion: z.string().min(1).optional(),
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
