import { z, type ZodType } from "@brains/utils/zod";
import type { JsonObject, JsonObjectOutputGuard } from "@brains/contracts";
import { jsonObjectSchema } from "@brains/contracts";
import type { ContentFormatter } from "@brains/content-formatters";
import type { ReactElement } from "react";

/**
 * Component type for layouts - using React. Props are checked as a function
 * parameter: a component cannot ask for a prop its data does not supply.
 */
export type ComponentType<P = unknown> = (props: P) => ReactElement;

export type TemplateDataSchema<T> = ZodType<T, unknown>;

/** Formats a template renders besides its web page: an image, a printed PDF, an EPUB. */
export type MediaFormat = "image" | "pdf" | "epub";

/** A template's components for its media formats. */
export type FormatComponents<P = unknown> = Partial<
  Record<MediaFormat, ComponentType<P>>
>;

/**
 * The link fields site-builder fills on every entity before render; a view
 * schema leaves them nullable. A render schema extends a view schema with
 * these, so a component reading them as required is proven, not trusted.
 */
export const renderedLinkFields: {
  url: z.ZodString;
  typeLabel: z.ZodString;
  listUrl: z.ZodString;
  listLabel: z.ZodString;
} = {
  url: z.string(),
  typeLabel: z.string(),
  listUrl: z.string(),
  listLabel: z.string(),
};

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

/** Wrap each format component so its props are parsed before it runs. */
function createTypedFormats<TComponent>(
  schema: TemplateDataSchema<TComponent>,
  formats: FormatComponents<TComponent> | undefined,
): FormatComponents | undefined {
  const typed = Object.fromEntries(
    Object.entries(formats ?? {}).map(([format, component]) => [
      format,
      createTypedComponent(schema, component),
    ]),
  );
  return Object.keys(typed).length > 0 ? typed : undefined;
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
    /** Components for formats other than the web page. */
    formats?: FormatComponents;
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
                formats?: FormatComponents<NoInfer<TSchema>>;
              }
            | {
                // The component consumes an enriched shape that site-builder
                // produces after the datasource; that shape needs its own
                // schema, because nothing else has checked it.
                component: ComponentType<TComponent>;
                renderSchema: TemplateDataSchema<TComponent>;
                fullscreen?: boolean;
                formats?: FormatComponents<TComponent>;
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
    // than asserted. The author's schema stays on the outside: providers
    // derive their structured-output schema from the input side, and a
    // transform around unknown would hand them an empty one.
    schema: schema.transform((data) => jsonObjectSchema.parse(data)),
    layout: {},
  };
  // Format components parse their props against the same schema as the page.
  let formats: FormatComponents | undefined;
  if (layout.renderSchema) {
    result.layout.component = createTypedComponent(
      layout.renderSchema,
      layout.component,
    );
    formats = createTypedFormats(layout.renderSchema, layout.formats);
  } else {
    if (layout.component)
      result.layout.component = createTypedComponent(schema, layout.component);
    formats = createTypedFormats(schema, layout.formats);
  }
  if (layout.fullscreen !== undefined) {
    result.layout.fullscreen = layout.fullscreen;
  }
  if (formats) result.layout.formats = formats;

  return result;
}

/**
 * Template schema for validation
 */
export const TemplateSchema: z.ZodObject<{
  name: z.ZodString;
  description: z.ZodString;
  schema: z.ZodUnknown;
  basePrompt: z.ZodOptional<z.ZodString>;
  useKnowledgeContext: z.ZodOptional<z.ZodBoolean>;
  requiredPermission: z.ZodEnum<{
    admin: "admin";
    trusted: "trusted";
    public: "public";
  }>;
  formatter: z.ZodOptional<z.ZodUnknown>;
  overlayFormatter: z.ZodOptional<z.ZodUnknown>;
  layout: z.ZodOptional<
    z.ZodObject<{
      component: z.ZodOptional<z.ZodUnknown>;
      fullscreen: z.ZodOptional<z.ZodBoolean>;
      formats: z.ZodOptional<z.ZodUnknown>;
    }>
  >;
  dataSourceId: z.ZodOptional<z.ZodString>;
}> = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.unknown(), // ZodType can't be validated at runtime - required
  basePrompt: z.string().optional(), // Optional - if not provided, template doesn't support AI generation
  useKnowledgeContext: z.boolean().optional(),
  requiredPermission: z.enum(["admin", "trusted", "public"]),
  formatter: z.unknown().optional(), // ContentFormatter instance
  overlayFormatter: z.unknown().optional(), // ContentFormatter for authored overlay
  layout: z
    .object({
      component: z.unknown().optional(), // ComponentType or string
      fullscreen: z.boolean().optional(),
      formats: z.unknown().optional(), // FormatComponents
    })
    .optional(),
  dataSourceId: z.string().optional(),
});

export type TemplateInput = z.output<typeof TemplateSchema>;

/** A template's renderers by output format: its page component as `web`. */
export function templateRenderers(
  template: Template,
): Partial<Record<"web" | MediaFormat, ComponentType<unknown>>> {
  const { component, formats } = template.layout ?? {};
  return {
    ...(component ? { web: component } : {}),
    ...(formats?.image ? { image: formats.image } : {}),
    ...(formats?.pdf ? { pdf: formats.pdf } : {}),
    ...(formats?.epub ? { epub: formats.epub } : {}),
  };
}
