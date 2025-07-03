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
  prompt?: string | undefined;
  data?: Record<string, unknown> | undefined;
}

/**
 * Zod schema for Template validation (used in plugin configurations)
 */
export const TemplateSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.any(), // ZodType can't be validated at runtime - required
  basePrompt: z.string(),
  requiredPermission: z.enum(["anchor", "trusted", "public"]),
  formatter: z.any().optional(), // ContentFormatter instance
  layout: z
    .object({
      component: z.any(), // ComponentType or string
      description: z.string().optional(),
      interactive: z.boolean().optional(),
      packageName: z.string().optional(),
    })
    .optional(),
});

/**
 * Template for reusable generation patterns and view rendering
 * Inferred from TemplateSchema with proper typing for generic T
 */
export interface Template<T = unknown>
  extends Omit<z.infer<typeof TemplateSchema>, "schema" | "formatter"> {
  schema: z.ZodType<T>;
  formatter?: ContentFormatter<T>;
}
