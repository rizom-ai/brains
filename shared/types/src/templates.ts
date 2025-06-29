import { z } from "zod";
import type { ContentFormatter } from "./formatters";
import type { VNode } from "preact";

/**
 * Component type for layouts - using Preact
 * Returns a Preact VNode
 */
export type ComponentType<P = unknown> = (props: P) => VNode;

/**
 * Context for content generation - simplified for template-based approach
 */
export interface GenerationContext {
  prompt?: string;
  data?: Record<string, unknown>;
}

/**
 * Template for reusable generation patterns and view rendering
 */
export interface Template<T = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<T>;
  basePrompt: string;
  /**
   * Optional formatter for converting between structured data and human-editable markdown.
   * If not provided, a default YAML formatter will be used.
   */
  formatter?: ContentFormatter<T>;
  /**
   * Optional layout definition for rendering this content type.
   * If provided, the template can be used as a section layout.
   */
  layout?: {
    component: ComponentType<T> | string; // Component function or path string
    description?: string;
    interactive?: boolean; // Whether this layout requires client-side interactivity
    packageName?: string; // Package name for hydration script resolution
  };
}

/**
 * Zod schema for Template validation (used in plugin configurations)
 */
export const TemplateSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.any(), // ZodType can't be validated at runtime - required
  basePrompt: z.string(),
  formatter: z.any().optional(), // ContentFormatter instance
  layout: z
    .object({
      component: z.any(), // ComponentType or string
      description: z.string().optional(),
      interactive: z.boolean().optional(),
    })
    .optional(),
});