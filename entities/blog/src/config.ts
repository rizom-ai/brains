import { z } from "@brains/utils/zod";

/**
 * The blog package's settings, as the blog plugin class took them; a brain
 * config naming one stays valid.
 */
export const blogConfigSchema: z.ZodObject<{
  defaultPrompt: z.ZodDefault<z.ZodString>;
  paginate: z.ZodDefault<z.ZodBoolean>;
  pageSize: z.ZodDefault<z.ZodNumber>;
}> = z.object({
  defaultPrompt: z
    .string()
    .default("Write a blog post about my recent work and insights"),
  /** Enable pagination for blog list pages (default: true) */
  paginate: z.boolean().default(true),
  /** Number of posts per page (default: 10) */
  pageSize: z.number().default(10),
});

/** Blog plugin configuration type (output, with all defaults applied) */
export type BlogConfig = z.output<typeof blogConfigSchema>;

/** Blog plugin configuration input type */
export type BlogConfigInput = z.input<typeof blogConfigSchema>;
