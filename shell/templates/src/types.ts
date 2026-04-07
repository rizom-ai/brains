import { z } from "@brains/utils";
import type { ContentFormatter } from "@brains/utils";
import type { VNode } from "preact";
import { UserPermissionLevelSchema } from "./permission-service";

/**
 * Component type for layouts - using Preact
 * Returns a Preact VNode
 */
export type ComponentType<P = unknown> = (props: P) => VNode;

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
 * Helper function to create a type-safe component that automatically parses props
 * using the provided Zod schema
 *
 * Supports transformation between schema type and component type (e.g., enrichment)
 * @param TSchema - Type validated by schema (e.g., with optional url/typeLabel)
 * @param TComponent - Type expected by component (e.g., with required url/typeLabel)
 */
export function createTypedComponent<TSchema, TComponent = TSchema>(
  schema: z.ZodType<TSchema>,
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
  z.infer<typeof TemplateSchema>,
  "schema" | "layout" | "formatter"
> {
  schema: z.ZodSchema;

  // View rendering capability (optional)
  layout?: {
    component?: ComponentType<unknown>;
    // Pre-compiled hydration JS for client-side interactivity (undefined = not interactive)
    interactive?: string;
    // When true, render without any page layout shell (no header/footer)
    fullscreen?: boolean;
  };

  // Data sourcing capability (optional)
  formatter?: ContentFormatter<unknown>; // For parsing stored content

  /**
   * Runtime script dependencies. Loaded only on routes where this
   * template actually renders — site-builder collects from all
   * templates on a route, dedupes by src, and injects into <head>.
   */
  runtimeScripts?: RuntimeScript[];
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
    schema: z.ZodType<TSchema>;
    layout?: {
      component?: ComponentType<TComponent>;
      interactive?: string;
      fullscreen?: boolean;
    };
    runtimeScripts?: RuntimeScript[];
  },
): Template {
  const { layout, schema, ...rest } = template;

  const result: Template = {
    ...rest,
    schema,
  };

  if (layout) {
    result.layout = {};
    if (layout.interactive !== undefined) {
      result.layout.interactive = layout.interactive;
    }
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
export const TemplateSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.any(), // ZodType can't be validated at runtime - required
  basePrompt: z.string().optional(), // Optional - if not provided, template doesn't support AI generation
  requiredPermission: UserPermissionLevelSchema,
  formatter: z.any().optional(), // ContentFormatter instance
  layout: z
    .object({
      component: z.any(), // ComponentType or string
      interactive: z.string().optional(),
    })
    .optional(),
  dataSourceId: z.string().optional(),
});

export type TemplateInput = z.infer<typeof TemplateSchema>;
